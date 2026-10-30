import { AgentState, AgentStatus } from '@harness/agent-state'

describe('AgentState current activity', () => {
    it('is not part of what is saved with the chat', () => {
        const state = new AgentState(AgentStatus.PROCESSING, 'es')
        state.setCurrentActivity('Buscando tus gastos', 'model')

        expect(state.toJSON()).toEqual({ language: 'es', status: AgentStatus.PROCESSING, activeTaskId: undefined, lastError: undefined, stopRequested: undefined })
        expect(JSON.stringify(state.toJSON())).not.toContain('Buscando')
    })

    it('ignores the activity that chats saved before 0.3.0 still have', () => {
        const state = AgentState.fromJSON({ status: AgentStatus.IDLE, currentActivity: 'Thinking...' })

        expect(state.currentActivity).toBeUndefined()
        expect(state.status).toBe(AgentStatus.IDLE)
    })

    it('keeps the real activity in this process and still tells the listener', () => {
        const seen: string[] = []
        const state = new AgentState()
        state.onActivityChange(activity => seen.push(activity))

        state.setCurrentActivity('Running search...')
        state.setCurrentActivity('Running search...')
        state.setCurrentActivity('stopped')

        expect(state.currentActivity).toBe('stopped')
        expect(seen).toEqual(['Running search...', 'stopped'])
    })
})
