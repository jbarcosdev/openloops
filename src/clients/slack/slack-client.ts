import { secretManager } from '@common/utils/secret-manager'

export interface SlackMessage {
    channel: string
    text: string
}

export interface SlackSentMessage {
    channel: string
    ts: string
}

interface SlackResponse {
    ok: boolean
    error?: string
    channel?: string
    ts?: string
}

export class SlackClient {
    public async sendMessage ({ channel, text }: SlackMessage): Promise<SlackSentMessage> {
        const token = secretManager.get('SLACK_BOT_TOKEN')
        if (!token) throw new Error('[Slack Client] SLACK_BOT_TOKEN is not set')

        const response = await fetch('https://slack.com/api/chat.postMessage', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json; charset=utf-8',
            },
            body: JSON.stringify({ channel, text }),
        })
        if (!response.ok) {
            throw new Error(`[Slack Client] Slack responded with status ${response.status}`)
        }

        const data = await response.json() as SlackResponse
        if (!data.ok) {
            throw new Error(`[Slack Client] ${data.error ?? 'unknown_error'}`)
        }

        return { channel: data.channel as string, ts: data.ts as string }
    }
}
