import { Tool, BaseParams } from '../../tool'
import { SlackClient, SlackSentMessage } from '@clients/slack/slack-client'

interface Params extends BaseParams {
    channel: string
    text: string
}

interface Output {
    data: SlackSentMessage
}

export const sendSlackMessageTool = new Tool({
    name: 'send_slack_message',
    description: 'Send a message to a Slack channel',
    destructive: false,
    parameters: {
        type: 'object',
        properties: {
            channel: {
                type: 'string',
                description: 'channel id (C0123456789) or name (#general) to send the message to'
            },
            text: {
                type: 'string',
                description: 'content of the message. Use Slack mrkdwn when it helps readability: *bold*, _italic_, ~strike~, `code`, <https://url|label> for links and "- " for lists. Do not use standard Markdown (no **bold**, no # headings, no [label](url))'
            },
        },
        required: ['channel', 'text'],
    },
    handler: async (params: Params): Promise<Output> => {
        if (!params) throw new Error('[send_slack_message] params is required')

        const { channel, text } = params

        const sent = await new SlackClient().sendMessage({ channel, text })
        return { data: sent }
    }
})
