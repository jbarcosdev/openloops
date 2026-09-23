import { getCountryData, getCurrencyData } from 'country-currency-utils'
import { currencies } from './currencies-db'

export async function getCurrencyDataFromCountryCode(countryCode: string): Promise<{ isoCode: string; label: string; symbol: string; nativeName: string } | undefined> {
    try {
        const countryData = await getCountryData(countryCode)
        if (!countryData) return undefined

        const currencyData = await getCurrencyData(countryData.currencyCode)
        if (!currencyData) return undefined

        return {
            isoCode: currencyData.currencyCode,
            label: currencyData.name,
            symbol: currencyData.symbolPreferred || currencyData.symbol,
            nativeName: getCurrencyNativeName(currencyData.currencyCode) || currencyData.name
        }
    } catch (error) {
        console.error('Error fetching currency data:', error)
        return undefined
    }
}

export async function getCurrencyDataFromCurrencyCode(currencyCode: string): Promise<{ isoCode: string; label: string; symbol: string; nativeName: string } | undefined> {
    try {
        const currencyData = await getCurrencyData(currencyCode)
        if (!currencyData) return undefined

        return {
            isoCode: currencyData.currencyCode,
            label: currencyData.name,
            symbol: currencyData.symbolPreferred || currencyData.symbol,
            nativeName: getCurrencyNativeName(currencyData.currencyCode) || currencyData.name
        }
    } catch (error) {
        console.error('Error fetching currency data:', error)
        return undefined
    }
}

export function getCurrencyNativeName(currencyCode: string): string | undefined {
    return (currencies as Record<string, { nativeName: string }>)[currencyCode]?.nativeName
}
