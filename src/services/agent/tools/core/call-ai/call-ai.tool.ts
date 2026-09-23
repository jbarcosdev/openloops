import { CallAiResponseSchema, callAiSkill } from './call-ai.skill'
import { Tool, BaseParams } from '../../tool'

interface Params extends BaseParams {
    payload: {
        instructions: string
        input_data: any
    },
}

interface Output {
    data: CallAiResponseSchema
}

export const callAiTool = new Tool({
    name: 'call_ai',
    description: callAiSkill.description ?? '',
    destructive: false,
    parameters: {
        type: 'object',
        properties: {
            instructions: {
                type: 'string',
                description: 'System instructions or guidelines to perform the analysis, extraction, or transformation task.'
            },
            input_data: {
                type: 'string',
                description: 'The raw text, data, or context to be processed.'
            },
            temperature: {
                type: 'number',
                description: 'Optional sampling temperature (0.0 to 1.0) to control creativity or precision.'
            }
        },
        required: ['instructions', 'input_data'],
    },
    handler: async (params: Params): Promise<Output> => {
        const { payload, currentUser, sessionId, answerId } = params
        const { instructions, input_data } = payload

        if (!instructions) throw new Error('[call_ai_tool] Param instructions is required')
        if (!input_data) throw new Error('[call_ai_tool] Param input_data is required')

        const result = await callAiSkill.run({
            sessionId,
            answerId,
            input: input_data,
            contextInjection: {
                systemPrompt: instructions,
            },
            currentUser: currentUser,
        })

        return { data: result }
    }
})
