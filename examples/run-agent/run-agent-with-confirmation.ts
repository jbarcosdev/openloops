import { Agent, AgentStatus } from 'openloops/core'
import { Logger } from 'openloops/common'
import { CurrentUser } from 'openloops/base'
import { AgiLoop } from 'openloops/loops'
import { Tool } from 'openloops/tools'

const deleteNoteTool = new Tool({
    name: 'delete_note',
    description: 'Permanently delete a note by its id',
    destructive: true,
    parameters: {
        type: 'object',
        properties: {
            noteId: { type: 'string', description: 'Id of the note' },
        },
        required: ['noteId'],
    },
    handler: async ({ noteId }: { noteId: string }) => ({ data: { deleted: noteId } }),
})

async function runAgentWithConfirmation () {
    const logger = new Logger()
    const currentUser = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')

    if (!currentUser) throw new Error('[Demo] current user is not defined')

    const agent = new Agent({ loop: new AgiLoop(), tools: [deleteNoteTool] })

    const first = await agent.run({
        input: { message: 'delete the note 6ab59c88d3ea4199c9b7ba09' },
        currentUser,
    })

    logger.info(first.data?.lastAnswer, '[Demo] Question for the user')

    if (first.data?.state?.status !== AgentStatus.AWAITING_USER_CONFIRMATION) return

    const second = await agent.run({
        input: {
            chatId: String(first.data._id),
            message: 'yes, go ahead',
        },
        currentUser,
    })

    logger.info(second.data?.lastAnswer, '[Demo] Final answer')
}

runAgentWithConfirmation()
