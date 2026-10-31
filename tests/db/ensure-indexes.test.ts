import { ensureIndexes, indexes } from '../../src/db'

describe('ensureIndexes', () => {
	it('creates the indexes of every collection and returns their names', async () => {
		const createIndexes = jest.fn(async (definitions: unknown[]) => definitions.map((_, i) => `index_${i}`))
		const collection = jest.fn(() => ({ createIndexes }))

		const created = await ensureIndexes({ collection } as any)

		expect(Object.keys(created).sort()).toEqual(Object.keys(indexes).sort())
		expect(collection).toHaveBeenCalledWith('llm_calls')
		expect(createIndexes).toHaveBeenCalledTimes(Object.keys(indexes).length)
		expect(created.automation_runs).toEqual(['index_0', 'index_1', 'index_2'])
	})

	it('covers the collections of the package that store data per owner', () => {
		for (const name of ['llm_calls', 'chats', 'agent_tasks', 'agent_actions', 'agent_traces', 'workspace_items', 'mcp_servers', 'automations', 'automation_runs']) {
			expect(indexes[name]?.length).toBeGreaterThan(0)
		}
	})
})
