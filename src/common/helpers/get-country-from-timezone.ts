import { getTimezone } from 'countries-and-timezones'

export function getCountryISOCodeFromTimezone(timezone: string | undefined): string | undefined {
    if (!timezone) return undefined

    const tzData = getTimezone(timezone)

    if (tzData && tzData.countries && tzData.countries.length > 0) {
        return tzData.countries[0] // Retorna el primer país asociado
    }

    return undefined
}
