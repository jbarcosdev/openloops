import { Tool, externalToolNotice } from '@tools/tool'
import { describeTool } from '@harness/tool-catalog'

const handler = async () => ({ data: 1 })
const client: any = { callTool: jest.fn() }

const mcpTool = (inputSchema: any, annotations?: any): any => ({ name: 'search', description: 'Search things', inputSchema, annotations })

const fromMcp = (inputSchema: any, annotations?: any) => Tool.fromMcp(mcpTool(inputSchema, annotations), client, { namespace: 'srv' })

const local = (parameters: any) => new Tool({ name: 'l', description: 'd', parameters, handler })

describe('Tool origin', () => {
    it('is local by default, with no server and no notice', () => {
        const tool = local({ type: 'object', properties: {}, required: [] })

        expect(tool.origin).toBe('local')
        expect(tool.server).toBeUndefined()
        expect(tool.notice).toBeUndefined()
    })

    it('is mcp when it comes from a server, with its name and the notice of the harness', () => {
        const tool = fromMcp({ type: 'object', properties: {}, required: [] })

        expect(tool.origin).toBe('mcp')
        expect(tool.server).toBe('srv')
        expect(tool.name).toBe('srv__search')
        expect(tool.notice).toBe(externalToolNotice('srv'))
        expect(tool.notice).toContain('"srv"')
    })

    it('shows the origin and the notice when the tool is described, and nothing extra for local tools', () => {
        const external = describeTool(fromMcp({ type: 'object', properties: {}, required: [] }))
        const own = describeTool(local({ type: 'object', properties: {}, required: [] }))

        expect(external).toMatchObject({ origin: 'mcp', notice: expect.stringContaining('external server') })
        expect(Object.keys(own)).not.toContain('notice')
        expect(Object.keys(own)).not.toContain('origin')
    })

    it('keeps the notice out of the description written by the server', () => {
        const tool = fromMcp({ type: 'object', properties: {}, required: [] })

        expect(tool.description).toBe('Search things')
    })
})

describe('Tool destructive flag', () => {
    const schema = { type: 'object', properties: {}, required: [] }

    it('is false when the server declares no annotations', () => {
        expect(fromMcp(schema).destructive).toBe(false)
    })

    it('follows the destructive hint of the server when it declares one', () => {
        expect(fromMcp(schema, { destructiveHint: true }).destructive).toBe(true)
        expect(fromMcp(schema, { destructiveHint: false }).destructive).toBe(false)
    })
})

describe('Tool.validate for tools from an MCP server', () => {
    const open = { type: 'object', properties: { query: { type: 'string', description: 'q' } }, required: ['query'] }

    it('rejects an argument that is not in the schema even when the schema does not close itself', () => {
        expect(fromMcp(open).validate({ query: 'x', notes: 'secret' })).toEqual(['Unknown argument "notes"'])
    })

    it('rejects any argument when the schema declares no properties', () => {
        expect(fromMcp({ type: 'object', properties: {}, required: [] }).validate({ anything: 1 })).toEqual(['Unknown argument "anything"'])
    })

    it('accepts the declared arguments', () => {
        expect(fromMcp(open).validate({ query: 'x' })).toEqual([])
    })

    it('still checks required arguments and types', () => {
        expect(fromMcp(open).validate({})).toEqual(['Missing required argument "query"'])
        expect(fromMcp(open).validate({ query: 3 })).toEqual(['Argument "query" must be of type string'])
    })

    it('lets extra arguments through when the schema allows them explicitly', () => {
        expect(fromMcp({ ...open, additionalProperties: true }).validate({ query: 'x', extra: 1 })).toEqual([])
        expect(fromMcp({ ...open, additionalProperties: { type: 'string' } }).validate({ query: 'x', extra: 'y' })).toEqual([])
        expect(fromMcp({ ...open, patternProperties: { '^x_': { type: 'string' } } }).validate({ query: 'x', x_a: 'y' })).toEqual([])
    })

    it('cannot judge a schema without a properties object, so it lets everything through', () => {
        expect(fromMcp({ type: 'object' }).validate({ anything: 1 })).toEqual([])
    })
})

describe('Tool.validate for local tools', () => {
    const open = { type: 'object', properties: { query: { type: 'string', description: 'q' } }, required: ['query'] }

    it('keeps accepting arguments outside the schema unless it closes itself', () => {
        expect(local(open).validate({ query: 'x', extra: 1 })).toEqual([])
        expect(local({ ...open, additionalProperties: false }).validate({ query: 'x', extra: 1 })).toEqual(['Unknown argument "extra"'])
    })
})
