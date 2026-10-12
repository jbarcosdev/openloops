import type { ToolSpec } from '../core/types'

export interface Item {
    id: string
    name: string
    kind: string
    stock: number
    price: number
}

export const ITEMS: Item[] = [
    { id: 'L1', name: 'Laptop Pro 14', kind: 'laptop', stock: 7, price: 1450 },
    { id: 'L2', name: 'Laptop Air 13', kind: 'laptop', stock: 12, price: 990 },
    { id: 'M1', name: 'Monitor 27', kind: 'monitor', stock: 4, price: 320 },
    { id: 'M2', name: 'Monitor 24', kind: 'monitor', stock: 9, price: 210 },
    { id: 'K1', name: 'Keyboard Mech', kind: 'keyboard', stock: 30, price: 80 },
]

export const defineTool = (name: string, description: string, properties: Record<string, any> = {}): ToolSpec => ({
    name,
    description,
    parameters: { type: 'object', properties, required: Object.keys(properties), additionalProperties: false },
})

export const SEARCH_TOOL: ToolSpec = {
    name: 't_search',
    description: 'Search the warehouse inventory by free text query.',
    parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false },
}

export const GET_TOOL: ToolSpec = {
    name: 't_get',
    description: 'Get one inventory item by id.',
    parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false },
}

export function search (query: string, withStock: boolean) {
    const words = String(query ?? '').toLowerCase().split(/\W+/).filter(Boolean)
    const tokens = words.filter(token => token.length >= 3).map(token => token.replace(/s$/, ''))
    const found = ITEMS.filter(item => words.includes(item.id.toLowerCase()) || tokens.some(token => `${item.name} ${item.kind}`.toLowerCase().includes(token)))
    return JSON.stringify(found.map(item => withStock ? { id: item.id, name: item.name, stock: item.stock, price: item.price } : { id: item.id, name: item.name, price: item.price }))
}

export function get (id: string) {
    const item = ITEMS.find(entry => entry.id.toLowerCase() === String(id ?? '').toLowerCase())
    return JSON.stringify(item ? { id: item.id, name: item.name, stock: item.stock, price: item.price } : { error: 'not_found', id })
}

export const numbers = (text: string) => text.replace(/(\d)[.,](\d{3})\b/g, '$1$2')
