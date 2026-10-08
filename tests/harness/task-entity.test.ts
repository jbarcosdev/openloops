import { ObjectId } from 'mongodb'
import { AgentTask, TaskStatus, ASK_USER, RESPOND } from '@services/tasks/entities/agent-task.entity'
import { AgentAction } from '@services/tasks/entities/agent-action.entity'
import { newTask, structured } from '../support'

const declared = ['ext', 'other_ext']

function turn (task: AgentTask, tools: string[], extra: Record<string, any> = {}) {
    return task.addTurn({
        reasoning: 'r',
        actions: tools.map(tool => ({ tool, arguments: tool === 'save_context' ? { name: 'x', content: 'y' } : { name: 'x' } })),
        ...extra,
    }, { declaredTools: declared })
}

describe('addTurn', () => {
    it('numbers turns and gives each action a step id', () => {
        const task = newTask()
        const first = turn(task, ['ext', 'other_ext'])
        const second = turn(task, ['ext'])

        expect(first.map(a => a.stepId)).toEqual(['1_1', '1_2'])
        expect(second[0].stepId).toBe('2_1')
        expect(task.turnCount).toBe(2)
    })

    it('turns an empty action list into an error observation', () => {
        const [action] = newTask().addTurn({ reasoning: 'r', actions: [] })

        expect(action.name).toBe('invalid_response')
        expect(action.status).toBe('failed')
        expect(action.error?.message).toContain('no actions')
    })

    it('fails each malformed action with a clear message', () => {
        const task = newTask()
        const actions = task.addTurn({
            actions: [
                { arguments: {} },
                { tool: ASK_USER, arguments: {} },
                { tool: RESPOND, arguments: {} },
                { tool: 'ext', arguments: [1] as any },
            ],
        }, { declaredTools: declared })

        expect(actions[0].error?.message).toContain('"tool"')
        expect(actions[1].error?.message).toContain('question')
        expect(actions[2].error?.message).toContain('answer')
        expect(actions[3].error?.message).toContain('JSON object')
    })

    it('accepts arguments written as a JSON string', () => {
        const [action] = newTask().addTurn({ actions: [{ tool: 'ext', arguments: '{"id":"7"}' }] }, { declaredTools: declared })

        expect(action.status).toBe('pending')
        expect(action.args).toEqual({ id: '7' })
    })

    it('strips a functions. prefix', () => {
        const [action] = newTask().addTurn({ actions: [{ tool: 'functions.ext', arguments: {} }] }, { declaredTools: declared })
        expect(action.name).toBe('ext')
    })

    it('corrects a missing server prefix and remembers what the model wrote', () => {
        const [action] = newTask().addTurn({ actions: [{ tool: 'ping', arguments: {} }] }, { declaredTools: ['other__ping'] })

        expect(action.name).toBe('other__ping')
        expect(action.requestedName).toBe('ping')
    })

    it('caps long reasoning and large state', () => {
        const task = newTask()
        task.addTurn({ reasoning: 'r'.repeat(5000), state: { big: 'x'.repeat(5000) }, actions: [{ tool: 'ext', arguments: {} }] }, { declaredTools: declared })

        expect(task.turns[0].reasoning).toHaveLength(1500)
        expect(JSON.stringify(task.state).length).toBeLessThan(1200)
    })
})

describe('known facts', () => {
    it('keeps learned facts and replaces a key regardless of case', () => {
        const task = newTask()
        task.remember([{ key: 'Site', value: 'Alpha id=111' }, { key: 'owner', value: { name: 'x' } }, { key: '', value: 'skip' }, { value: 'nokey' }])
        expect(task.known).toEqual({ Site: 'Alpha id=111', owner: '{"name":"x"}' })

        task.remember([{ key: 'site', value: 'Alpha id=222' }, { key: 'long', value: 'z'.repeat(1000) }])
        expect(Object.keys(task.known!)).toEqual(['owner', 'site', 'long'])
        expect(task.known!.site).toBe('Alpha id=222')
        expect(task.known!.long).toHaveLength(300)
    })

    it('keeps only the newest 40 entries', () => {
        const task = newTask()
        task.remember(Array.from({ length: 50 }, (_, i) => ({ key: `k${i}`, value: `v${i}` })))

        expect(Object.keys(task.known!)).toHaveLength(40)
        expect(task.known!.k49).toBe('v49')
        expect(task.known!.k0).toBeUndefined()
    })

    it('ignores input that is not a list', () => {
        const task = newTask()
        task.remember('nope')
        expect(task.known).toBeUndefined()
    })

    it('is fed from addTurn', () => {
        const task = newTask()
        turn(task, ['ext'], { learned: [{ key: 'a', value: 'b' }] })
        expect(task.known).toEqual({ a: 'b' })
    })
})

describe('schemas', () => {
    it('are learned from any tool listing in an output', () => {
        const task = newTask()
        task.learnSchemas({ tools: [{ name: 'get_health', inputSchema: { type: 'object', properties: { site: { type: 'string' }, hours: { type: ['number', 'null'] } }, required: ['site'] } }] })

        expect(task.schemas).toEqual({ get_health: { required: ['site (string)'], optional: ['hours (number|null)'] } })
    })

    it('ignore entries without a usable schema', () => {
        const task = newTask()
        task.learnSchemas({ tools: [{ name: 'a' }, { name: 'b', input_schema: 'nope' }] })
        expect(task.schemas).toBeUndefined()
    })

    it('keep the most recent 30', () => {
        const task = newTask()
        task.learnSchemas({ tools: Array.from({ length: 40 }, (_, i) => ({ name: `t${i}`, input_schema: { properties: { a: { type: 'string' } } } })) })

        expect(Object.keys(task.schemas!)).toHaveLength(30)
        expect(task.schemas!.t39).toBeDefined()
        expect(task.schemas!.t0).toBeUndefined()
    })
})

describe('streaks', () => {
    it('counts consecutive workspace-only turns and resets on an external tool', () => {
        const task = newTask()
        turn(task, ['read_context'])
        turn(task, ['save_context', 'read_context'])
        turn(task, ['read_context'])
        expect(task.workspaceStreak).toBe(3)

        turn(task, ['ext'])
        expect(task.workspaceStreak).toBe(0)
    })

    it('counts consecutive turns on the same single tool', () => {
        const task = newTask()
        turn(task, ['ext'])
        turn(task, ['ext'])
        turn(task, ['ext'])
        expect(task.sameToolStreak).toEqual({ name: 'ext', count: 3 })

        turn(task, ['other_ext'])
        expect(task.sameToolStreak).toEqual({ name: 'other_ext', count: 1 })
    })

    it('does not count turns that mix tools', () => {
        const task = newTask()
        turn(task, ['ext'])
        turn(task, ['ext', 'other_ext'])
        expect(task.sameToolStreak.count).toBe(0)
    })
})

describe('questions and answers', () => {
    it('stores the answer to ask_user as a known fact with its question', () => {
        const task = newTask()
        task.addTurn({ actions: [{ tool: ASK_USER, arguments: { question: 'Which warehouse?' } }] }, { declaredTools: declared })

        expect(task.pendingQuestion).toBe('Which warehouse?')
        expect(task.answerQuestion('the second one')).toBe(true)
        expect(task.known).toEqual({ user_answer_1_1: 'the second one | in answer to: Which warehouse?' })
        expect(task.pendingQuestion).toBeUndefined()
        expect(task.answerQuestion('again')).toBe(false)
    })

    it('extracts, delivers and rejects final answers', () => {
        expect(AgentTask.answerFrom({ actions: [{ tool: RESPOND, arguments: { answer: ' hola ' } }] })).toBe('hola')
        expect(AgentTask.answerFrom({ actions: [{ tool: 'ext' }] })).toBeUndefined()

        const task = newTask()
        task.addTurn({ actions: [{ tool: RESPOND, arguments: { answer: 'done' } }] }, { declaredTools: declared })
        expect(task.pendingAnswer).toBe('done')

        task.rejectAnswer('no')
        expect(task.rejectedAnswers).toBe(1)
        expect(task.pendingAnswer).toBeUndefined()
    })

    it('forceAnswer prefers the pending answer over the fallback and skips the rest', () => {
        const task = newTask()
        task.addTurn({ actions: [{ tool: 'ext', arguments: {} }, { tool: RESPOND, arguments: { answer: 'mine' } }] }, { declaredTools: declared })

        expect(task.forceAnswer('fallback')).toBe('mine')
        expect(task.actions.find(a => a.name === 'ext')?.status).toBe('skipped')
        expect(newTask().forceAnswer('fallback')).toBe('fallback')
    })
})

describe('history', () => {
    function completedTurn (task: AgentTask, tool: string, output: unknown) {
        const [action] = task.addTurn({ reasoning: `think ${tool}`, state: { objective: 'o' }, actions: [{ tool, arguments: {} }] }, { declaredTools: [tool] })
        action.markCompleted(output)
        return action
    }

    it('starts with the opening byte for byte', () => {
        const task = newTask({ opening: '{"INPUT": {"user_message":  "hi"}}' })
        completedTurn(task, 'ext', { a: 1 })

        expect(task.history()[0]).toEqual({ role: 'user', content: '{"INPUT": {"user_message":  "hi"}}' })
    })

    it('is empty without an opening', () => {
        const task = new AgentTask({ goal: 'g' })
        expect(task.history()).toEqual([])
    })

    it('alternates the assistant turn and its observations', () => {
        const task = newTask()
        completedTurn(task, 'ext', { a: 1 })
        const messages = task.history()

        expect(messages.map(m => m.role)).toEqual(['user', 'assistant', 'user'])
        expect(JSON.parse(messages[1].content as string)).toMatchObject({ reasoning: 'think ext', state: { objective: 'o' }, actions: [{ tool: 'ext' }] })
        expect(JSON.parse(messages[2].content as string).OBSERVATIONS[0]).toMatchObject({ ref: '1_1', tool: 'ext', status: 'completed', output: { a: 1 } })
    })

    it('merges the harness notice into the last user message only', () => {
        const task = newTask()
        completedTurn(task, 'ext', { a: 1 })
        const messages = task.history({ budget: { turns_left: 5 } })

        expect(JSON.parse(messages[2].content as string).HARNESS).toEqual({ budget: { turns_left: 5 } })
        expect(messages[0].content).toBe('{}')
    })

    it('unwraps the envelope of an MCP result', () => {
        const task = newTask()
        completedTurn(task, 'ext', structured({ results: [1] }))

        expect(JSON.parse(task.history()[2].content as string).OBSERVATIONS[0].output).toEqual({ results: [1] })
    })

    it('leaves out turns whose actions have not all finished', () => {
        const task = newTask()
        task.addTurn({ actions: [{ tool: 'ext', arguments: {} }] }, { declaredTools: declared })
        expect(task.history()).toHaveLength(1)
    })

    it('shows older stubbed outputs as stubs and the latest in full', () => {
        const task = newTask()
        const first = completedTurn(task, 'ext', structured({ rows: [1, 2, 3] }))
        first.keepOutputWithStub({ ref: 'out_1_1', totalChars: 9000, preview: '[1', outline: {} } as any)
        completedTurn(task, 'ext', { b: 2 })

        const messages = task.history()
        const older = JSON.parse(messages[2].content as string).OBSERVATIONS[0].output
        const latest = JSON.parse(messages[4].content as string).OBSERVATIONS[0].output

        expect(older.workspace_ref).toBe('out_1_1')
        expect(latest).toEqual({ b: 2 })
    })
})

describe('AgentAction outputs', () => {
    const envelope = (value: unknown) => structured(value)
    const make = (extra: Record<string, any> = {}) => AgentAction.fromJSON({ _id: new ObjectId(), name: 't', status: 'completed', output: envelope({ query: 'q', results: [] }), ...extra })

    it('shows only the structured content, not the envelope', () => {
        expect(make().observationOutput(false, 3000)).toEqual({ query: 'q', results: [] })
        expect(make().promptView(3000).output).toEqual({ query: 'q', results: [] })
    })

    it('keeps showing the content for a reloaded action that has a ref but no stub', () => {
        expect(make({ outputRef: 'out_1' }).observationOutput(false, 3000)).toEqual({ query: 'q', results: [] })
    })

    it('shows the stub only once the output is stale', () => {
        const action = make({ outputRef: 'out_1', outputStub: { workspace_ref: 'out_1' } })

        expect(action.observationOutput(false, 3000)).toEqual({ query: 'q', results: [] })
        expect(action.observationOutput(true, 3000).workspace_ref).toBe('out_1')
    })

    it('truncates an unreferenced large output for the prompt', () => {
        const view = make({ output: { text: 'x'.repeat(5000) } }).observationOutput(false, 100)
        expect(view.truncated).toBe(true)
    })
})

describe('fields to unset', () => {
    it('reports the fields that were cleared so the database removes them', () => {
        const task = newTask()
        task.setNextNode(undefined)
        task.setScratch('x', 1)
        task.clearScratch('x')

        expect(Object.keys(task.clearedFields)).toEqual(expect.arrayContaining(['nextNode', 'scratch']))

        const action = newTask().addAction({ name: 't', stepId: '1_1' })
        action.markFailed({ message: 'e', retryable: false })
        action.resetForRetry()
        expect(Object.keys(action.clearedFields)).toEqual(expect.arrayContaining(['error', 'startedAt']))
    })
})

describe('task lifecycle', () => {
    it('moves through terminal states', () => {
        const task = newTask()
        task.status = TaskStatus.IN_PROGRESS
        task.complete('done')
        expect(task).toMatchObject({ status: TaskStatus.COMPLETED, summary: 'done' })

        const failed = newTask()
        failed.fail()
        expect(failed.status).toBe(TaskStatus.FAILED)
    })
})
