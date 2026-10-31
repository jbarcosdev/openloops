import { Agent, AgentStatus } from '@harness/index'
import { AgentState } from '@harness/agent-state'
import { useHarness, makeLoop } from '../support'

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const loopWith = (activities: string[], delay = 0) => makeLoop({
    initialNode: 'work',
    nodes: {
        work: async ctx => {
            for (const activity of activities) {
                ctx.chat.state.setCurrentActivity(activity)
                if (delay) await sleep(delay)
            }
            ctx.chat.state.setStatus(AgentStatus.IDLE)
        },
    },
})

describe('Agent activity', () => {
    const env = useHarness()

    it('tells every change of the current activity of the run, in order', async () => {
        const seen: string[] = []
        const agent = new Agent({ loop: loopWith(['Thinking...', 'Running search...', 'Writing...']) })
        agent.onActivity(activity => seen.push(activity))

        await env.send(agent, 'x')

        expect(seen).toEqual(['Thinking...', 'Running search...', 'Writing...'])
    })

    it('does not repeat an activity that did not change', async () => {
        const seen: string[] = []
        const agent = new Agent({ loop: loopWith(['Thinking...', 'Thinking...', 'Thinking...', 'Writing...']) })
        agent.onActivity(activity => seen.push(activity))

        await env.send(agent, 'x')

        expect(seen).toEqual(['Thinking...', 'Writing...'])
    })

    it('stops telling after the listener is removed', async () => {
        const seen: string[] = []
        const agent = new Agent({ loop: loopWith(['Thinking...']) })
        const remove = agent.onActivity(activity => seen.push(activity))
        remove()

        await env.send(agent, 'x')

        expect(seen).toEqual([])
    })

    it('does not break the run when a listener throws, and the others still hear it', async () => {
        const seen: string[] = []
        const agent = new Agent({ loop: loopWith(['Thinking...']) })
        agent.onActivity(() => { throw new Error('listener exploded') })
        agent.onActivity(activity => seen.push(activity))

        const result = await env.send(agent, 'x')

        expect(result.error).toBeUndefined()
        expect(result.data.state.status).toBe(AgentStatus.IDLE)
        expect(seen).toEqual(['Thinking...'])
    })

    it('keeps the activities of runs that happen at the same time apart', async () => {
        const first: string[] = []
        const second: string[] = []
        const agentA = new Agent({ loop: loopWith(['A1', 'A2', 'A3'], 15) })
        const agentB = new Agent({ loop: loopWith(['B1', 'B2', 'B3'], 10) })
        agentA.onActivity(activity => first.push(activity))
        agentB.onActivity(activity => second.push(activity))

        await Promise.all([env.send(agentA, 'x'), env.send(agentB, 'y')])

        expect(first).toEqual(['A1', 'A2', 'A3'])
        expect(second).toEqual(['B1', 'B2', 'B3'])
    })

    it('starts again from the first activity in every run of the same agent', async () => {
        const seen: string[] = []
        const agent = new Agent({ loop: loopWith(['Thinking...']) })
        agent.onActivity(activity => seen.push(activity))

        await env.send(agent, 'first')
        await env.send(agent, 'second')

        expect(seen).toEqual(['Thinking...', 'Thinking...'])
    })

    it('does not put the listener in the saved state of the chat', async () => {
        const agent = new Agent({ loop: loopWith(['Thinking...']) })
        agent.onActivity(() => undefined)

        await env.send(agent, 'x')

        const state = env.db.chats.all()[0].state
        expect(Object.keys(state)).not.toContain('activityListener')
        expect(JSON.stringify(state)).not.toContain('activityListener')
        expect(Object.keys(new AgentState().toJSON())).not.toContain('activityListener')
    })
})
