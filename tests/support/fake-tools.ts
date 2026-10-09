import { Tool } from '@tools/tool'

type Properties = Record<string, { type: string; description?: string }>

export function makeTool (props: {
    name: string
    description?: string
    required?: string[]
    properties?: Properties
    destructive?: boolean
    handler?: (params: any) => Promise<any> | any
}): Tool {
    const { name, description = name, required = [], properties = {}, destructive = false, handler } = props

    return new Tool({
        name,
        description,
        destructive,
        parameters: { type: 'object', required, properties } as any,
        handler: async (params: any) => ({ data: await (handler ? handler(params) : { ok: true }) }),
    })
}

export function structured (value: unknown): { content: { type: string; text: string }[]; structuredContent: unknown } {
    return { content: [{ type: 'text', text: 'ok' }], structuredContent: value }
}

export function bigListing (size = 3000): { query: string; results: { id: string; name: string }[] } {
    return { query: 'q', results: Array.from({ length: size }, (_, i) => ({ id: `id${i}`, name: 'x'.repeat(30) })) }
}

export interface Warehouse {
    tools: Tool[]
    gets: string[]
    deleted: string[]
    reset: () => void
}

export function warehouseTools (): Warehouse {
    const state: Warehouse = {
        gets: [],
        deleted: [],
        tools: [],
        reset () {
            state.gets.length = 0
            state.deleted.length = 0
        },
    }

    state.tools = [
        makeTool({
            name: 't_search',
            description: 'search warehouse items by query',
            required: ['q'],
            properties: { q: { type: 'string', description: 'q' } },
            handler: async () => structured(bigListing()),
        }),
        makeTool({
            name: 't_get',
            description: 'get one item by id',
            required: ['id'],
            properties: { id: { type: 'string', description: 'id' } },
            handler: async (params) => {
                state.gets.push(params.id)
                return { got: params.id }
            },
        }),
        makeTool({
            name: 't_delete',
            description: 'delete an item permanently',
            destructive: true,
            required: ['id'],
            properties: { id: { type: 'string', description: 'id' } },
            handler: async (params) => {
                state.deleted.push(params.id)
                return { deleted: params.id }
            },
        }),
    ]

    return state
}
