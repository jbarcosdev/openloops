export function getCountryNameFromCountryCode(countryCode?: string, lang = 'en') {
    if (!countryCode || typeof countryCode !== 'string' || countryCode.length !== 2) {
        return undefined
    }

    const regionNames = new Intl.DisplayNames([lang], { type: 'region' })

    try {
        return regionNames.of(countryCode.toUpperCase())
    } catch (error) {
        console.error(`Error getting country name for code ${countryCode}:`, error)
        return undefined
    }
}
