import { isIPv4, isIPv6 } from 'node:net'

function isPrivateIpv4 (address: string): boolean {
    const [a, b, c] = address.split('.').map(Number)

    return a === 0
        || a === 10
        || a === 127
        || a >= 224
        || (a === 100 && b >= 64 && b <= 127)
        || (a === 169 && b === 254)
        || (a === 172 && b >= 16 && b <= 31)
        || (a === 192 && b === 0 && c === 0)
        || (a === 192 && b === 168)
        || (a === 198 && (b === 18 || b === 19))
}

function expandIpv6 (address: string): number[] | undefined {
    let text = address.split('%')[0].toLowerCase()

    const tail = text.match(/(\d+\.\d+\.\d+\.\d+)$/)
    if (tail) {
        const octets = tail[1].split('.').map(Number)
        text = text.slice(0, -tail[1].length) + ((octets[0] << 8) | octets[1]).toString(16) + ':' + ((octets[2] << 8) | octets[3]).toString(16)
    }

    const [head, rest, extra] = text.split('::')
    if (extra !== undefined) return undefined

    const left = head ? head.split(':') : []
    const right = rest ? rest.split(':') : []
    const missing = 8 - left.length - right.length

    if (rest === undefined ? missing !== 0 : missing < 1) return undefined

    const groups = [...left, ...Array(rest === undefined ? 0 : missing).fill('0'), ...right].map(group => parseInt(group, 16))
    return groups.length === 8 && groups.every(group => group >= 0 && group <= 0xffff) ? groups : undefined
}

function isPrivateIpv6 (address: string): boolean {
    const groups = expandIpv6(address)
    if (!groups) return true

    const embedded = `${groups[6] >> 8}.${groups[6] & 255}.${groups[7] >> 8}.${groups[7] & 255}`
    const mapped = groups.slice(0, 5).every(group => group === 0) && groups[5] === 0xffff
    const nat64 = groups[0] === 0x64 && groups[1] === 0xff9b && groups.slice(2, 6).every(group => group === 0)

    if (mapped || nat64) return isPrivateIpv4(embedded)

    return groups.slice(0, 7).every(group => group === 0)
        || (groups[0] & 0xfe00) === 0xfc00
        || (groups[0] & 0xffc0) === 0xfe80
        || (groups[0] & 0xff00) === 0xff00
}

export function isPrivateAddress (address: string): boolean {
    if (isIPv4(address)) return isPrivateIpv4(address)
    if (isIPv6(address)) return isPrivateIpv6(address)
    return true
}
