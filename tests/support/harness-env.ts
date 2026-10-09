import { ObjectId } from 'mongodb'
import { Agent, AgentLoop } from '@harness/index'
import { AgiLoop } from '@loops/agi/loop'
import { fastResponder, confirmationGate } from '@loops/shared/skills'
import type { Tool } from '@tools/tool'
import type { Guard } from '@guardrails/guard'
import type { CurrentUser } from '@common/base'
import { MemoryDb } from './memory-db'
import { ScriptedLLM } from './scripted-llm'
import { fakeMcp } from './fake-mcp'

export interface RunResult {
    data: any
    error?: string
}

export class HarnessEnv {
    readonly db = new MemoryDb()
    readonly llm = new ScriptedLLM()
    readonly user = { userId: new ObjectId().toString(), email: 'tester@example.com', isAdmin: () => false } as unknown as CurrentUser
    readonly fast = { canAnswer: false, calls: 0 }
    readonly gate = { decision: 'CONFIRMED' }
    private spies: jest.SpyInstance[] = []

    start (): void {
        this.db.reset()
        this.db.install()
        this.llm.reset()
        this.llm.install()
        fakeMcp.reset()
        this.fast.canAnswer = false
        this.fast.calls = 0
        this.gate.decision = 'CONFIRMED'

        this.spies = [
            jest.spyOn(fastResponder as any, 'run').mockImplementation(async () => {
                this.fast.calls++
                return { can_answer: this.fast.canAnswer, answer: 'fast answer', detected_language: 'es' }
            }),
            jest.spyOn(confirmationGate as any, 'run').mockImplementation(async () => ({
                decision: this.gate.decision,
                acknowledgement: 'cancelled ok',
                clarification_prompt: 'sure?',
            })),
        ]
    }

    stop (): void {
        this.llm.restore()
        this.spies.forEach(spy => spy.mockRestore())
        this.spies = []
    }

    agent (tools: Tool[] = [], guards: Guard[] = []): Agent {
        return new Agent({ loop: new AgiLoop(), tools, guards })
    }

    async send (agent: Agent, message: string, chatId?: string): Promise<RunResult> {
        return agent.run({ input: { message, ...(chatId ? { chatId } : {}) }, currentUser: this.user }) as Promise<RunResult>
    }

    tasks (): Record<string, any>[] {
        return this.db.tasks.all()
    }

    task (): Record<string, any> {
        return this.tasks()[0]
    }

    actions (): Record<string, any>[] {
        return this.db.actions.all()
    }

    workspaceItems (): Record<string, any>[] {
        return this.db.workspace.all()
    }

    traces (): Record<string, any>[] {
        return this.db.traces.all()
    }
}

export function useHarness (): HarnessEnv {
    const env = new HarnessEnv()
    beforeEach(() => env.start())
    afterEach(() => env.stop())
    return env
}

export function makeLoop (props: { initialNode: string; nodes: Record<string, (ctx: any) => Promise<void>>; name?: string }) {
    return {
        name: props.name ?? 'test_loop',
        version: '1.0.0',
        author: { name: 'test', email: 'test@example.com' },
        initialNode: props.initialNode,
        nodes: props.nodes,
    } as unknown as AgentLoop
}
