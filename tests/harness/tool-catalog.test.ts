import { buildToolCatalog, needsSearch, isDeclarable } from '@harness/tool-catalog'
import { NATIVE_TOOLS } from '@harness/native-tools'
import { Tool } from '@tools/tool'
import { makeTool } from '../support'

const make = (count: number, prefix: string, description?: string) =>
    Array.from({ length: count }, (_, i) => makeTool({ name: `${prefix}${i}`, description: description ?? `Does ${prefix}${i}` }))

describe('tool catalog', () => {
    it('lists every tool in the tools field up to 15 and hides search_tools', () => {
        const catalog = buildToolCatalog(make(15, 'srv__t'), NATIVE_TOOLS, [])

        expect(needsSearch(make(15, 'srv__t'))).toBe(false)
        expect(catalog.tools.map(tool => tool.name)).not.toContain('search_tools')
        expect(catalog.tools.filter(tool => tool.name.startsWith('srv__'))).toHaveLength(15)
        expect(catalog.context).toEqual({})
    })

    it('with no external tools offers only the natives without search', () => {
        const catalog = buildToolCatalog([], NATIVE_TOOLS, [])
        expect(catalog.tools.map(tool => tool.name)).toEqual(NATIVE_TOOLS.map(tool => tool.name).filter(name => name !== 'search_tools'))
    })

    it('over 15 tools offers search and summarizes the sources', () => {
        const all = [...make(10, 'github__t'), ...make(8, 'calendar__e'), makeTool({ name: 'local_tool' })]
        const catalog = buildToolCatalog(all, NATIVE_TOOLS, [])

        expect(needsSearch(all)).toBe(true)
        expect(catalog.tools.map(tool => tool.name)).toEqual(NATIVE_TOOLS.map(tool => tool.name))
        expect(catalog.context.total_tools).toBe(19)
        expect(catalog.context.tool_sources.map((source: any) => `${source.name}:${source.tool_count}:${source.sample.length}`)).toEqual(['github:10:3', 'calendar:8:3', 'local:1:1'])
        expect(catalog.context.tool_sources[0].sample[0].parameters).toBeUndefined()
    })

    it('appends discovered tools after the natives', () => {
        const all = make(20, 'big__t')
        const catalog = buildToolCatalog(all, NATIVE_TOOLS, ['big__t7', 'big__t3'])

        expect(catalog.tools.slice(-2).map(tool => tool.name)).toEqual(['big__t7', 'big__t3'])
    })

    it('excludes names a provider would reject', () => {
        const odd = makeTool({ name: 'bad name with spaces' })
        expect(isDeclarable(odd)).toBe(false)
        expect(buildToolCatalog([odd], NATIVE_TOOLS, []).tools.map(tool => tool.name)).not.toContain('bad name with spaces')
    })

    it('does not cut descriptions at 1000 characters', () => {
        const long = 'tutorial '.repeat(330)
        const catalog = buildToolCatalog([makeTool({ name: 'long_tool', description: long })], NATIVE_TOOLS, [])

        expect(catalog.tools.find(tool => tool.name === 'long_tool')?.description).toHaveLength(long.length)
    })

    describe('with MCP servers', () => {
        const external = (name: string) => new Tool({ name, description: name, parameters: { type: 'object', properties: {} } as any, origin: 'mcp', server: 'srv', handler: async () => ({ data: {} }) })
        const mcps = [{ name: 'srv', state: 'approved' as const }, { name: 'off', state: 'blocked' as const }]

        it('keeps search and adds the index, without declaring the tools of the servers', () => {
            const catalog = buildToolCatalog([makeTool({ name: 'local_tool' }), external('srv__a')], NATIVE_TOOLS, [], mcps)

            expect(catalog.tools.map(tool => tool.name)).toEqual([...NATIVE_TOOLS.map(tool => tool.name), 'local_tool'])
            expect(catalog.context).toEqual({ mcp_servers: mcps })
        })

        it('declares the tools of a server once they were discovered', () => {
            const catalog = buildToolCatalog([external('srv__a'), external('srv__b')], NATIVE_TOOLS, ['srv__b'], mcps)

            expect(catalog.tools.map(tool => tool.name)).toContain('srv__b')
            expect(catalog.tools.map(tool => tool.name)).not.toContain('srv__a')
        })

        it('does not count the tools of the servers to decide whether local tools need search', () => {
            const all = [...make(15, 'local_t'), ...Array.from({ length: 30 }, (_, i) => external(`srv__t${i}`))]

            expect(needsSearch(all)).toBe(false)
            expect(buildToolCatalog(all, NATIVE_TOOLS, [], mcps).context.tool_sources).toBeUndefined()
        })

        it('adds the index next to the summary of a large local catalog', () => {
            const catalog = buildToolCatalog(make(20, 'big__t'), NATIVE_TOOLS, [], mcps)

            expect(catalog.context.mcp_servers).toEqual(mcps)
            expect(catalog.context.tool_sources).toHaveLength(1)
        })
    })
})
