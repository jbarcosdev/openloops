import ISO6391 from 'iso-639-1'

export function getLanguageFromLanguageCode(isoCode?: string): { isoCode: string; name: string; nativeName: string } | undefined {
    if (!isoCode || typeof isoCode !== 'string' || isoCode.trim() === '') {
        return undefined
    }

    isoCode = isoCode.trim().toLowerCase()
    const name = ISO6391.getName(isoCode)
    const nativeName = ISO6391.getNativeName(isoCode)

    if (!name || !nativeName) return undefined

    return {
        isoCode,
        name,
        nativeName
    }
}
