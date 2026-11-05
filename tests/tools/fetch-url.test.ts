import * as http from 'node:http'
import { AddressInfo } from 'node:net'
import * as zlib from 'node:zlib'
import { fetchUrlTool } from '@tools/core/fetch-url'
import { isPrivateAddress } from '@tools/core/fetch-url/network-guard'

jest.mock('@tools/core/fetch-url/network-guard', () => {
    const actual = jest.requireActual('@tools/core/fetch-url/network-guard')
    return { ...actual, isPrivateAddress: jest.fn(actual.isPrivateAddress) }
})

describe('fetch_url', () => {
    const real = jest.requireActual('@tools/core/fetch-url/network-guard').isPrivateAddress
    let server: http.Server
    let base: string
    let requests: http.IncomingMessage[]

    beforeAll(async () => {
        requests = []
        server = http.createServer((request, response) => {
            requests.push(request)
            const path = request.url ?? ''

            if (path === '/page') {
                response.setHeader('content-type', 'text/html; charset=utf-8')
                return response.end('<html><head><title>T</title></head><body><h1>Hi</h1><p>Body &amp; more</p><a href="/next">Next</a><script>x()</script></body></html>')
            }
            if (path === '/json') {
                response.setHeader('content-type', 'application/json')
                return response.end('{"a":1}')
            }
            if (path === '/gzip') {
                response.setHeader('content-type', 'text/plain')
                response.setHeader('content-encoding', 'gzip')
                return response.end(zlib.gzipSync('zipped text'))
            }
            if (path === '/latin1') {
                response.setHeader('content-type', 'text/plain; charset=iso-8859-1')
                return response.end(Buffer.from('caf\xe9', 'latin1'))
            }
            if (path === '/pdf') {
                response.setHeader('content-type', 'application/pdf')
                return response.end('%PDF')
            }
            if (path === '/missing') {
                response.statusCode = 404
                return response.end('nope')
            }
            if (path === '/big') {
                response.setHeader('content-type', 'text/plain')
                return response.end('a'.repeat(11000000))
            }
            if (path === '/long') {
                response.setHeader('content-type', 'text/plain')
                return response.end('b'.repeat(60000))
            }
            if (path === '/loop') {
                response.statusCode = 302
                response.setHeader('location', '/loop')
                return response.end()
            }
            if (path === '/go') {
                response.statusCode = 302
                response.setHeader('location', '/page')
                return response.end()
            }
            if (path === '/to-private') {
                response.statusCode = 302
                response.setHeader('location', 'http://10.0.0.1/secret')
                return response.end()
            }
            response.statusCode = 500
            response.end()
        })

        await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
        base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    })

    afterAll(async () => {
        await new Promise(resolve => server.close(resolve))
    })

    beforeEach(() => {
        requests.length = 0
        ;(isPrivateAddress as jest.Mock).mockImplementation((address: string) => address !== '127.0.0.1' && real(address))
    })

    const run = (url: string) => fetchUrlTool.run({ url })

    it('is not destructive, asks only for the url and carries a notice', () => {
        expect(fetchUrlTool.destructive).toBe(false)
        expect(fetchUrlTool.parameters.required).toEqual(['url'])
        expect(fetchUrlTool.notice).toBeTruthy()
    })

    it('returns an html page as text, with links resolved', async () => {
        const result = await run(`${base}/page`)

        expect(result.data).toEqual({
            url: `${base}/page`,
            status: 200,
            contentType: 'text/html',
            truncated: false,
            text: `# Hi\n\nBody & more\n\nNext (${base}/next)`,
        })
    })

    it('sends an honest user agent and asks for markdown first', async () => {
        await run(`${base}/page`)

        expect(requests[0].headers['user-agent']).toBe('openloops-fetch-url/1.0')
        expect(requests[0].headers.accept).toMatch(/^text\/markdown/)
    })

    it('returns json and plain text as they are', async () => {
        expect((await run(`${base}/json`)).data.text).toBe('{"a":1}')
    })

    it('decodes gzip and the charset of the response', async () => {
        expect((await run(`${base}/gzip`)).data.text).toBe('zipped text')
        expect((await run(`${base}/latin1`)).data.text).toBe('café')
    })

    it('follows redirects', async () => {
        const result = await run(`${base}/go`)

        expect(result.data.url).toBe(`${base}/page`)
    })

    it('stops a redirect loop', async () => {
        await expect(run(`${base}/loop`)).rejects.toThrow('[fetch_url] more than 5 redirects')
    })

    it('refuses a redirect to a private address', async () => {
        await expect(run(`${base}/to-private`)).rejects.toThrow('private or internal address')
    })

    it('fails on http errors and on content that is not text', async () => {
        await expect(run(`${base}/missing`)).rejects.toThrow('[fetch_url] the server answered 404')
        await expect(run(`${base}/pdf`)).rejects.toThrow('"application/pdf" is not text')
    })

    it('cuts the body at the byte limit and the text at the character limit', async () => {
        const big = (await run(`${base}/big`)).data
        const long = (await run(`${base}/long`)).data

        expect(big.truncated).toBe(true)
        expect(big.text).toHaveLength(50000)
        expect(long.truncated).toBe(true)
        expect(long.text).toHaveLength(50000)
    })

    it('rejects urls that are invalid, not http, or carry credentials', async () => {
        await expect(run('not a url')).rejects.toThrow('is not a valid URL')
        await expect(run('file:///etc/passwd')).rejects.toThrow('only http and https')
        await expect(run('http://user:pass@example.com')).rejects.toThrow('credentials')
    })

    it('does not reach loopback, private or metadata addresses', async () => {
        ;(isPrivateAddress as jest.Mock).mockImplementation(real)

        await expect(run(`${base}/page`)).rejects.toThrow('private or internal address')
        await expect(run('http://169.254.169.254/latest/meta-data')).rejects.toThrow('private or internal address')
        await expect(run('http://[::1]/')).rejects.toThrow('private or internal address')
        await expect(run('http://localhost/')).rejects.toThrow('private or internal address')
        expect(requests).toHaveLength(0)
    })
})
