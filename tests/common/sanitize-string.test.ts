import { sanitizeString } from '@common/helpers'

describe('sanitizeString', () => {
    it('is undefined for an empty value', () => {
        expect(sanitizeString('')).toBeUndefined()
        expect(sanitizeString()).toBeUndefined()
    })

    it('keeps plain text as it is, quotes and ampersands included', () => {
        expect(sanitizeString('Jose Barcos')).toBe('Jose Barcos')
        expect(sanitizeString('AT&T "quoted" it\'s')).toBe('AT&T "quoted" it\'s')
        expect(sanitizeString('Tom &amp; Jerry')).toBe('Tom &amp; Jerry')
    })

    it('removes tags and keeps their text', () => {
        expect(sanitizeString('<b>bold</b> text')).toBe('bold text')
        expect(sanitizeString('a<br>b')).toBe('ab')
        expect(sanitizeString('<img src=x onerror=alert(1)>hi')).toBe('hi')
        expect(sanitizeString('<a href="https://x.com" title="a">link</a>')).toBe('link')
        expect(sanitizeString('<!DOCTYPE html><?xml version="1.0"?>ok')).toBe('ok')
    })

    it('removes scripts, styles and comments with their content', () => {
        expect(sanitizeString('<script>alert(1)</script>ok')).toBe('ok')
        expect(sanitizeString('<SCRIPT type="x">alert(1)</SCRIPT >ok')).toBe('ok')
        expect(sanitizeString('<style>p{}</style>ok')).toBe('ok')
        expect(sanitizeString('<!-- c -->ok')).toBe('ok')
        expect(sanitizeString('ok<script>never closed')).toBe('ok')
    })

    it('escapes the angle brackets that are left, so no tag can survive', () => {
        expect(sanitizeString('5 < 6 and 7 > 3')).toBe('5 &lt; 6 and 7 &gt; 3')
        expect(sanitizeString('x <y')).toBe('x &lt;y')
        expect(sanitizeString('a < b')).toBe('a &lt; b')
    })

    it.each([
        '<scr<script>ipt>alert(1)</script>',
        '<<b>script>alert(1)<</b>/script>',
        '<img src="x"<script>>',
        '<svg/onload=alert(1)>',
        '<a href="javascript:alert(1)">x</a><',
        '<iframe src="//evil"></iframe',
        '<math><mi//xlink:href="data:x,<script>alert(1)</script>">',
        '<<script>script>alert(1)</script>',
    ])('never leaves a raw angle bracket in %s', payload => {
        const result = sanitizeString(payload) ?? ''

        expect(result).not.toMatch(/[<>]/)
    })

    it('does not change a value that it already cleaned', () => {
        for (const value of ['5 < 6', 'x <y', '<<b>script>', 'AT&T', 'Tom &amp; Jerry', '<b>a</b> & <i>b</i>']) {
            const once = sanitizeString(value)

            expect(sanitizeString(once)).toBe(once)
        }
    })

    it('stays fast with hostile input', () => {
        const started = Date.now()

        sanitizeString('<'.repeat(200000))
        sanitizeString('<a'.repeat(100000))
        sanitizeString('<script '.repeat(50000))
        sanitizeString('x<' + 'a'.repeat(200000))
        sanitizeString('<!--'.repeat(50000))

        expect(Date.now() - started).toBeLessThan(2000)
    })
})
