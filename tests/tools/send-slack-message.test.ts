import { secretManager } from '@common/utils/secret-manager'
import { sendSlackMessageTool } from '@tools/core/slack'

const slackResponse = (body: any, status = 200): any => ({ ok: status >= 200 && status < 300, status, json: async () => body })

describe('send_slack_message', () => {
    const originalFetch = global.fetch
    const originalGet = secretManager.get
    let fetchMock: jest.Mock

    beforeEach(() => {
        fetchMock = jest.fn()
        global.fetch = fetchMock as any
        ;(secretManager as any).get = jest.fn(() => 'xoxb-token')
    })

    afterEach(() => {
        global.fetch = originalFetch
        ;(secretManager as any).get = originalGet
    })

    it('is not destructive and asks for the channel and the text', () => {
        expect(sendSlackMessageTool.destructive).toBe(false)
        expect(sendSlackMessageTool.parameters.required).toEqual(['channel', 'text'])
    })

    it('posts the message with the bot token and returns where it landed', async () => {
        fetchMock.mockResolvedValue(slackResponse({ ok: true, channel: 'C123', ts: '1730000000.000100' }))

        const result = await sendSlackMessageTool.run({ channel: '#general', text: 'hello' })

        expect(result).toEqual({ data: { channel: 'C123', ts: '1730000000.000100' } })
        const [url, init] = fetchMock.mock.calls[0]
        expect(url).toBe('https://slack.com/api/chat.postMessage')
        expect(init.headers.Authorization).toBe('Bearer xoxb-token')
        expect(JSON.parse(init.body)).toEqual({ channel: '#general', text: 'hello', mrkdwn: true, unfurl_links: true, unfurl_media: true })
    })

    it('fails with the error code when slack answers ok false', async () => {
        fetchMock.mockResolvedValue(slackResponse({ ok: false, error: 'channel_not_found' }))

        await expect(sendSlackMessageTool.run({ channel: '#nope', text: 'hi' })).rejects.toThrow('channel_not_found')
    })

    it('fails when slack answers with an http error such as a rate limit', async () => {
        fetchMock.mockResolvedValue(slackResponse({}, 429))

        await expect(sendSlackMessageTool.run({ channel: '#general', text: 'hi' })).rejects.toThrow('status 429')
    })

    it('fails without calling slack when the token is not set', async () => {
        ;(secretManager as any).get = jest.fn(() => '')

        await expect(sendSlackMessageTool.run({ channel: '#general', text: 'hi' })).rejects.toThrow('SLACK_BOT_TOKEN')
        expect(fetchMock).not.toHaveBeenCalled()
    })
})
