import { Tool, BaseParams } from 'openloops/tools'

interface Params extends BaseParams {
    firstName: string
}

interface Output {
    data: {
        greeting: string
    }
}

export const greetUserTool = new Tool({
    name: 'greet_user',
    description: 'Greet the user',
    destructive: false,
    parameters: {
        type: 'object',
        properties: {
            firstName: {
                type: 'string',
                description: 'First name of the user'
            },
        },
        required: ['firstName'],
    },
    handler: async (params: Params): Promise<Output> => {
        if (!params) throw new Error('[greet_user] params is required')

        const { currentUser, sessionId, answerId, firstName } = params

        const greeting = `Hi ${firstName}`
        return { data: { greeting } }
    }
})
