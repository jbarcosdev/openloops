import { stripBlocks } from './strip-blocks'

export function sanitizeString (input = ''): string | undefined {
    if (!input) return undefined

    let text = stripBlocks(input, '<!--', '-->', '-->', false)
    text = stripBlocks(text, '<script', '</script', '>', true)
    text = stripBlocks(text, '<style', '</style', '>', true)

    return text
        .replace(/<[/!?]?[a-zA-Z][^<>]*>/g, '')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
}
