import { Tool, BaseParams } from 'openloops/tools'

interface Params extends BaseParams {
    noteId: string
}

interface Output {
    data: {
        deleted: string
    }
}

export const deleteNoteTool = new Tool({
    name: 'delete_note',
    description: 'Permanently delete a note by its id',
    destructive: true,
    parameters: {
        type: 'object',
        properties: {
            noteId: {
                type: 'string',
                description: 'Id of the note to delete'
            },
        },
        required: ['noteId'],
    },
    handler: async (params: Params): Promise<Output> => {
        if (!params) throw new Error('[delete_note] params is required')

        const { noteId } = params

        return { data: { deleted: noteId } }
    }
})
