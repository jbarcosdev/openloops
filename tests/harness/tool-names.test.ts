import { resolveToolName, findInvoker, seenHiddenTool } from '@services/tasks/entities/agent-task.entity'
import { newTask } from '../support'

describe('resolveToolName', () => {
    const declared = ['read_context', 'respond', 'zainar-dev__search_tools', 'zainar-dev__invoke_tool', 'other__ping']

    it('leaves an exact name untouched', () => {
        expect(resolveToolName('zainar-dev__search_tools', declared)).toBeUndefined()
    })

    it('restores the server prefix when the model dropped it', () => {
        expect(resolveToolName('search_tools', declared)).toBe('zainar-dev__search_tools')
        expect(resolveToolName('invoke_tool', declared)).toBe('zainar-dev__invoke_tool')
    })

    it('tolerates hyphen versus underscore in the prefix', () => {
        expect(resolveToolName('zainar_dev__search_tools', declared)).toBe('zainar-dev__search_tools')
    })

    it('removes a prefix wrongly added to a native tool', () => {
        expect(resolveToolName('zainar-dev__read_context', declared)).toBe('read_context')
    })

    it('does not map the name of a hidden tool', () => {
        expect(resolveToolName('get_wifi_site', declared)).toBeUndefined()
    })

    it('maps a unique suffix and refuses an ambiguous one', () => {
        expect(resolveToolName('ping', declared)).toBe('other__ping')
        expect(resolveToolName('ping', [...declared, 'third__ping'])).toBeUndefined()
    })

    it('ignores case', () => {
        expect(resolveToolName('Respond', declared)).toBe('respond')
    })
})

describe('findInvoker', () => {
    const invoker = { name: 'z__invoke_tool', parameters: { properties: { name: {}, arguments: {} } } }
    const tools = [{ name: 'respond' }, { name: 'z__search_tools', parameters: { properties: { query: {} } } }, invoker]

    it('finds the unique invoker', () => {
        expect(findInvoker(tools)).toBe('z__invoke_tool')
    })

    it('returns nothing when two servers expose one', () => {
        expect(findInvoker([...tools, { ...invoker, name: 'y__invoke_tool' }])).toBeUndefined()
    })

    it('requires the name and arguments parameters', () => {
        expect(findInvoker([{ name: 'z__invoke_tool', parameters: { properties: { x: {} } } }])).toBeUndefined()
    })
})

describe('seenHiddenTool', () => {
    const schemas = { run_site_audit: {} }

    it('matches the bare name and the prefixed name of the same server', () => {
        expect(seenHiddenTool('run_site_audit', 'z__invoke_tool', schemas)).toBe('run_site_audit')
        expect(seenHiddenTool('z__run_site_audit', 'z__invoke_tool', schemas)).toBe('run_site_audit')
        expect(seenHiddenTool('Z__Run_Site_Audit', 'z__invoke_tool', schemas)).toBe('run_site_audit')
    })

    it('ignores a prefix from another server', () => {
        expect(seenHiddenTool('other__run_site_audit', 'z__invoke_tool', schemas)).toBeUndefined()
    })

    it('ignores names never seen', () => {
        expect(seenHiddenTool('unknown', 'z__invoke_tool', schemas)).toBeUndefined()
        expect(seenHiddenTool('unknown', 'z__invoke_tool', undefined)).toBeUndefined()
    })
})

describe('hidden tool routing in addTurn', () => {
    const declared = ['respond', 'z__search_tools', 'z__invoke_tool']
    const write = (task: ReturnType<typeof newTask>, tool: string, args: any = { site: 'B' }, options: { invoker?: string } = { invoker: 'z__invoke_tool' }) =>
        task.addTurn({ reasoning: 'r', actions: [{ tool, arguments: args }] }, { declaredTools: declared, invoker: options.invoker })[0]

    it('rewrites a seen hidden tool into a call to the invoker', () => {
        const task = newTask()
        task.schemas = { identify_site_profile: { required: ['site (string)'], optional: [] } }
        const action = write(task, 'identify_site_profile')

        expect(action.name).toBe('z__invoke_tool')
        expect(action.args).toEqual({ name: 'identify_site_profile', arguments: { site: 'B' } })
        expect(action.requestedName).toBe('identify_site_profile')
    })

    it('sends the bare name to the invoker when the model wrote the prefix', () => {
        const task = newTask()
        task.schemas = { run_site_audit: { required: [], optional: [] } }
        const action = write(task, 'z__run_site_audit')

        expect(action.name).toBe('z__invoke_tool')
        expect(action.args?.name).toBe('run_site_audit')
    })

    it('does not route a tool that was never seen', () => {
        const action = write(newTask(), 'identify_site_profile')
        expect(action.name).toBe('identify_site_profile')
        expect(action.requestedName).toBeUndefined()
    })

    it('does not route when there is no unique invoker', () => {
        const task = newTask()
        task.schemas = { identify_site_profile: { required: [], optional: [] } }
        expect(write(task, 'identify_site_profile', {}, {}).name).toBe('identify_site_profile')
    })

    it('never routes native tools', () => {
        const task = newTask()
        task.schemas = { respond: { required: [], optional: [] } }
        expect(write(task, 'respond', { answer: 'hi' }).name).toBe('respond')
    })

    it('adds a routing note to the history only for routed calls', () => {
        const task = newTask()
        task.schemas = { run_site_audit: { required: [], optional: [] } }

        const routed = write(task, 'run_site_audit')
        routed.markFailed({ message: 'e', retryable: false })
        expect(JSON.stringify(task.history())).toContain('hidden tool')

        const plain = newTask()
        plain.schemas = { run_site_audit: { required: [], optional: [] } }
        const direct = write(plain, 'invoke_tool', { name: 'a', arguments: {} })
        direct.markFailed({ message: 'e', retryable: false })
        expect(JSON.stringify(plain.history())).not.toContain('hidden tool and cannot')
    })
})
