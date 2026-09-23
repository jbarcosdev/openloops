import { Tool, BaseParams } from '../../tool'
import {
    SerperClient,
    SerperSearchParams,
    SerperSearchResponse
} from '@common/clients/serper-client'

interface Params extends BaseParams, SerperSearchParams {}

interface Output {
    data: SerperSearchResponse | undefined
}

export const webSearchTool = new Tool({
    name: 'web_search',
    description: 'Search on web',
    destructive: false,
    parameters: {
        type: 'object',
        properties: {
            query: {
                type: 'string',
                description: 'search query'
            },
        },
        required: ['query'],
    },
    handler: async (params: Params): Promise<Output> => {
        if (!params) throw new Error('[web_search] params is required')

        const { currentUser, sessionId, answerId, ...rest } = params

        const serperClient = new SerperClient()
        const results = await serperClient.searchOnGoogle(rest)
        return { data: results }
    }
})
