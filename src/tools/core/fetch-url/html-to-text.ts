const REMOVED_ELEMENTS = ['script', 'style', 'noscript', 'svg', 'head', 'template', 'iframe', 'object', 'canvas']

const LINE = '\u0001'
const PARAGRAPH = '\u0002'
const BREAK = '\u0003'

const PARAGRAPH_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'ul', 'ol', 'table', 'hr'])
const LINE_TAGS = new Set(['div', 'section', 'article', 'aside', 'header', 'footer', 'nav', 'main', 'figure', 'figcaption', 'form', 'fieldset', 'dl', 'dt', 'dd', 'details', 'summary', 'address', 'tr', 'tbody', 'thead', 'tfoot', 'caption'])

const ENTITIES: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '-', mdash: '-', hellip: '...',
    laquo: '«', raquo: '»', lsquo: "'", rsquo: "'", ldquo: '"', rdquo: '"', bull: '•', middot: '·',
    copy: '©', reg: '®', trade: '™', euro: '€', iexcl: '¡', iquest: '¿',
    aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', uuml: 'ü',
    Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ', Uuml: 'Ü',
}

function asciiLower (text: string): string {
    return text.replace(/[A-Z]/g, char => String.fromCharCode(char.charCodeAt(0) + 32))
}

function strip (html: string, open: string, close: string, end: string, isElement: boolean): string {
    const lower = asciiLower(html)
    let result = ''
    let cursor = 0

    while (cursor < html.length) {
        let start = lower.indexOf(open, cursor)
        while (isElement && start !== -1 && /[a-z0-9]/.test(lower.charAt(start + open.length))) start = lower.indexOf(open, start + 1)
        if (start === -1) break

        result += html.slice(cursor, start)

        const closing = lower.indexOf(close, start + open.length)
        const stop = closing === -1 ? -1 : lower.indexOf(end, closing)
        cursor = stop === -1 ? html.length : stop + end.length
    }

    return result + html.slice(cursor)
}

function decodeEntities (text: string): string {
    return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+[0-9]*);/gi, (match, entity: string) => {
        if (entity[0] === '#') {
            const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10)
            return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : ''
        }
        return ENTITIES[entity] ?? match
    })
}

function absolute (href: string, baseUrl?: string): string | undefined {
    const value = decodeEntities(href.trim())
    if (!value || value.startsWith('#') || /^(javascript|mailto|tel|data):/i.test(value)) return undefined

    try {
        return new URL(value, baseUrl).href
    } catch {
        return undefined
    }
}

export function htmlToText (html: string, baseUrl?: string): string {
    let text = strip(html, '<!--', '-->', '-->', false)
    for (const tag of REMOVED_ELEMENTS) text = strip(text, `<${tag}`, `</${tag}`, '>', true)
    text = text.slice(0, text.lastIndexOf('>') + 1).replace(/<[!?][^>]*>/g, '').replace(/[\u0001-\u0003]/g, '').replace(/\s+/g, ' ')

    const links: Array<string | undefined> = []

    text = text.replace(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g, (match, slash: string, rawName: string, attributes: string) => {
        const name = rawName.toLowerCase()

        if (name === 'a') {
            if (slash) {
                const href = links.pop()
                return href ? ` (${href})` : ''
            }
            const href = attributes.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i)
            links.push(href ? absolute(href[1] ?? href[2] ?? href[3], baseUrl) : undefined)
            return ''
        }

        if (name === 'br') return BREAK
        if (name === 'li') return slash ? LINE : `${LINE}- `
        if (/^h[1-6]$/.test(name)) return slash ? PARAGRAPH : `${PARAGRAPH}${'#'.repeat(Number(name[1]))} `
        if (PARAGRAPH_TAGS.has(name)) return PARAGRAPH
        if (LINE_TAGS.has(name)) return LINE
        return name === 'td' || name === 'th' ? ' ' : ''
    })

    return decodeEntities(text.replace(/[\u0001-\u0003 ]+/g, run => {
        if (run.includes(PARAGRAPH)) return '\n\n'
        const lines = Math.max(run.split(BREAK).length - 1, run.includes(LINE) ? 1 : 0)
        return lines ? '\n'.repeat(Math.min(lines, 2)) : ' '
    }))
        .replace(/ {2,}/g, ' ')
        .trim()
}
