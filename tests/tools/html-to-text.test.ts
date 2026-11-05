import { htmlToText } from '@tools/core/fetch-url/html-to-text'
import { isPrivateAddress } from '@tools/core/fetch-url/network-guard'

describe('htmlToText', () => {
    it('drops scripts, styles, head, comments and hidden templates', () => {
        const html = '<html><head><title>x</title></head><body><!-- note --><script>alert(1)</script><style>p{}</style><noscript>enable js</noscript><p>Hello</p></body></html>'

        expect(htmlToText(html)).toBe('Hello')
    })

    it('drops the doctype and the xml declaration', () => {
        expect(htmlToText('<?xml version="1.0"?><!DOCTYPE html><html><body><p>Hello</p></body></html>')).toBe('Hello')
        expect(htmlToText('<!doctype html><html lang=en><head><title>x</title></head><body><p>Hi</p></body></html>')).toBe('Hi')
    })

    it('keeps the structure with line breaks, lists and headings', () => {
        const html = '<h1>Title</h1><p>First</p><p>Second<br>line</p><ul><li>one</li><li>two</li></ul>'

        expect(htmlToText(html)).toBe('# Title\n\nFirst\n\nSecond\nline\n\n- one\n- two')
    })

    it('treats the line breaks of the source as spaces', () => {
        expect(htmlToText('<p>one\n   two\n\nthree</p>')).toBe('one two three')
    })

    it('writes links as text (url) and resolves relative ones against the base', () => {
        const html = '<a href="/docs">Docs</a> <a href="https://b.com/x">B</a> <a href="#top">Top</a> <a href="javascript:void(0)">Run</a>'

        expect(htmlToText(html, 'https://a.com/start')).toBe('Docs (https://a.com/docs) B (https://b.com/x) Top Run')
    })

    it('decodes named and numeric entities after removing the tags', () => {
        expect(htmlToText('<p>Tom &amp; Jerry &lt;b&gt; &#233; &#x1F600; caf&eacute; &unknown;</p>')).toBe('Tom & Jerry <b> é 😀 café &unknown;')
    })

    it('puts the cells of a row in one line', () => {
        expect(htmlToText('<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>')).toBe('A B\n1 2')
    })

    it('does not mistake header for head', () => {
        expect(htmlToText('<header>Top</header><main>Body</main>')).toBe('Top\nBody')
    })

    it('handles unclosed tags and unterminated scripts without hanging', () => {
        const started = Date.now()
        const hostile = '<p>ok</p>' + '<script '.repeat(50000) + '<a '.repeat(50000)

        expect(htmlToText(hostile)).toBe('ok')
        expect(htmlToText('<p>ok</p>' + '<div'.repeat(100000))).toBe('ok')
        expect(Date.now() - started).toBeLessThan(2000)
    })
})

describe('isPrivateAddress', () => {
    it.each([
        '0.0.0.0', '10.1.2.3', '127.0.0.1', '169.254.169.254', '172.16.0.1', '172.31.255.255', '192.168.1.1', '100.64.0.1', '224.0.0.1',
        '::', '::1', 'fe80::1', 'fc00::1', 'fd12:3456::1', 'ff02::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:10.0.0.1', '64:ff9b::a00:1',
        'not-an-ip',
    ])('blocks %s', address => {
        expect(isPrivateAddress(address)).toBe(true)
    })

    it.each([
        '8.8.8.8', '93.184.216.34', '172.32.0.1', '100.63.0.1', '2606:4700:4700::1111', '::ffff:8.8.8.8', '2001:db8::1',
    ])('allows %s', address => {
        expect(isPrivateAddress(address)).toBe(false)
    })
})
