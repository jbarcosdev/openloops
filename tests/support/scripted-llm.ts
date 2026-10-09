import { LLMClient } from '@clients/llm-client'
import type { LLMChatParams } from '@clients/llm-types'

export interface ScriptedAction {
    tool?: string
    arguments?: unknown
}

export interface ScriptedTurn {
    reasoning?: string
    state?: Record<string, any>
    actions?: ScriptedAction[]
    learned?: { key?: string; value?: unknown }[]
    raw?: string
    throws?: Error
}

export type ScriptStep = ScriptedTurn | ((params: LLMChatParams, index: number) => ScriptedTurn)

export function act (tool: string, args: unknown = {}): ScriptedAction {
    return { tool, arguments: args }
}

export function say (answer: string, extra: Omit<ScriptedTurn, 'actions'> & { actions?: ScriptedAction[] } = {}): ScriptedTurn {
    return { actions: [act('respond', { answer })], ...extra }
}

export function failWith (error: Error): ScriptedTurn {
    return { throws: error }
}

function clone<T> (value: T): T {
    return JSON.parse(JSON.stringify(value))
}

export class ScriptedLLM {
    calls: LLMChatParams[] = []
    private steps: ScriptStep[] = []
    private spy?: jest.SpyInstance

    install (): this {
        this.spy = jest.spyOn(LLMClient.prototype, 'chat').mockImplementation(async (params: LLMChatParams) => this.respond(params))
        return this
    }

    restore (): void {
        this.spy?.mockRestore()
        this.spy = undefined
    }

    reset (): void {
        this.calls = []
        this.steps = []
    }

    script (...steps: ScriptStep[]): this {
        this.steps = [...steps]
        return this
    }

    repeat (count: number, step: ScriptStep): this {
        this.steps = Array.from({ length: count }, () => step)
        return this
    }

    get remaining (): number {
        return this.steps.length
    }

    private async respond (params: LLMChatParams) {
        const index = this.calls.length
        this.calls.push(clone(params))

        const next = this.steps.shift()
        if (!next) throw new Error('The scripted LLM ran out of steps')

        const turn = typeof next === 'function' ? next(params, index) : next
        if (turn.throws) throw turn.throws

        const body = {
            reasoning: turn.reasoning ?? 'because',
            state: turn.state ?? { next: 'continue' },
            actions: turn.actions,
            ...(turn.learned ? { learned: turn.learned } : {}),
        }

        return {
            text: turn.raw ?? JSON.stringify(body),
            toolCalls: [],
            stopReason: 'stop',
            usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, costInUsd: 0 },
        } as any
    }

    call (index: number): LLMChatParams {
        return this.calls[index]
    }

    lastCall (): LLMChatParams {
        return this.calls[this.calls.length - 1]
    }

    lastMessage (index = this.calls.length - 1): Record<string, any> {
        const messages = this.calls[index].messages
        return JSON.parse(messages[messages.length - 1].content as string)
    }

    observations (index = this.calls.length - 1): any[] {
        return this.lastMessage(index).OBSERVATIONS ?? []
    }

    harness (index = this.calls.length - 1): Record<string, any> {
        return this.lastMessage(index).HARNESS ?? {}
    }

    opening (index = 0): Record<string, any> {
        return JSON.parse(this.calls[index].messages[1].content as string)
    }

    toolNames (index = 0): string[] {
        return (this.calls[index].tools ?? []).map(tool => tool.name)
    }
}
