import { countries } from './countries-db'

interface CountryData {
    name: string
    localName: string
    language: {
        isoCode: string
        name: string
        localName: string
    }
    currency: {
        isoCode: string
        name: string
        localName: string
    }
}

export const getCountryDataFromCountryCode = (countryCode?: string): CountryData | undefined => {
    if (!countryCode) return undefined

    const country = countries[countryCode]
    if (!country) return undefined

    return country
}
