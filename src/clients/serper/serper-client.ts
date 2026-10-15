import { Logger } from '@common/logger'
import { secretManager } from '@common/utils/secret-manager'

export class SerperClient {
    private readonly logger = new Logger()

    public async searchOnGoogle (params: SerperSearchParams): Promise<SerperSearchResponse | undefined> {
        const { query, type, page, num, countryCode, languageCode } = params
        const apiKey = secretManager.get('SERPER_API_KEY')

        const inputData = {
            q: query,
            type,
            page,
            num,
            ...(countryCode ? { gl: countryCode } : {}),
            ...(languageCode ? { hl: languageCode } : {}),
            engine: "google",
        }

        try {
            this.logger.debug({ ...inputData }, '[Serper Client] Searching on internet...')

            const response = await fetch('https://google.serper.dev/search', {
                method: 'POST',
                headers: {
                    'X-API-KEY': apiKey,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(inputData),
            })
            if (!response.ok) {
                throw new Error(`Serper responded with status ${response.status}`)
            }

            const data = await response.json() as SerperSearchResponse
            this.logger.debug({ ...data }, '[Serper Client] Search results')
            return data

        } catch (error) {
            this.logger.error(error)
        }
    }
}

export interface SerperSearchParams {
    query: string
    type?: 'search' | 'news'
    page?: number
    num?: number
    countryCode?: string
    languageCode?: string
}

export interface SerperOrganicResult {
    title: string
    link: string
    snippet: string
    position: number
    sitelinks?: Array<{ title: string; link: string }>
    date?: string
    attributes?: Record<string, string>
}

export interface SerperAnswerBox {
    title?: string
    answer?: string
    snippet?: string
    source?: string
    sourceLink?: string
    temperature?: string
    unit?: string
    weather?: string
    humidity?: string
    wind?: string
}

export interface SerperKnowledgeGraph {
    title: string
    type?: string
    website?: string
    imageUrl?: string
    description?: string
    descriptionSource?: string
    descriptionLink?: string
    attributes?: Record<string, string>
}

export interface SerperRelatedSearch {
    query: string
}

export interface SerperSearchResponse {
    searchParameters: {
        q: string
        gl?: string
        hl?: string
        type: string
        engine: string
        num?: number
        page?: number
    }
    news?: SerperOrganicResult[]
    organic?: SerperOrganicResult[]
    answerBox?: SerperAnswerBox
    knowledgeGraph?: SerperKnowledgeGraph
    relatedSearches?: SerperRelatedSearch[]
    credits?: number
}
