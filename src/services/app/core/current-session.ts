import { getCountryDataFromCountryCode } from '@common/helpers/get-country-data-from-country-code'
import { getCountryISOCodeFromTimezone } from '@common/helpers/get-country-from-timezone'
import { getTimezoneOffset } from '@common/helpers/get-timezone-offset'

export class CurrentSession {
    constructor (
        public clientType?: ClientType,
        public environment?: ClientEnvironment,
        public app?: {
            id?: string
            name?: string
            version?: string
        },
        public device?: {
            id?: string
            os?: string
            brand?: string
            model?: string
            osVersion?: string
            modelVersion?: string
            platform?: DevicePlatform
            screen?: DeviceScreen
        },
        public preferences?: {
            appTheme?: string
            locale?: string
        },
        public location?: {
            timezone?: string
            country?: string
        },
        public request?: {
            id?: string
            path?: string
            ipAddress?: string
            userAgent?: string
        }
    ){}

    public get language (): string | undefined {
        return this.preferences?.locale?.split('_')[0]
    }

    public get timezoneOffset (): number | undefined {
        return getTimezoneOffset(this.location?.timezone)
    }

    public get currencyCode (): string | undefined {
        const currentCountryData = getCountryDataFromCountryCode(this.location?.country)
        return currentCountryData?.currency?.isoCode
    }

    static fromJSON (json: CurrentSessionProps): CurrentSession {
        return new CurrentSession(
            json.clientType,
            json.environment,
            json.app,
            json.device,
            json.preferences,
            json.location,
            json.request
        )
    }

    toJson (): CurrentSessionProps {
        return {
            clientType: this.clientType,
            environment: this.environment,
            app: this.app,
            device: this.device,
            preferences: this.preferences,
            location: this.location,
            request: this.request
        }
    }

    static fromRequest (request: {
        path?: string
        ipAddress?: string
        userAgent?: string
        requestId?: string
        xCurrentSessionHeader: string
    }): CurrentSession {
        let xCurrentSessionHeaderObj = {}
		try {
			xCurrentSessionHeaderObj = JSON.parse(request.xCurrentSessionHeader || '{}')
		} catch (error) {
			xCurrentSessionHeaderObj = {}
		}

        const session = CurrentSession.fromJSON(xCurrentSessionHeaderObj)

        session.request = {
            ...session.request,
            id: request.requestId,
            path: request.path,
            ipAddress: request.ipAddress,
            userAgent: request.userAgent,
        }

        session.location = session.location?.timezone ? {
            ...session.location,
            country: getCountryISOCodeFromTimezone(session.location?.timezone),
        } : session.location

        return session
    }
}

export interface CurrentSessionProps {
	// 1. Tipo de Capa Cliente y Entorno
	clientType?: ClientType // e.g., "web", "mobile", "desktop", "api"
	environment?: ClientEnvironment // e.g., "production", "staging", "development"

	// 2. Información de la Aplicación
	app?: {
		id?: string // e.g., "cash.sofi.app"
		name?: string // e.g., "user_app", "admin_app"
		version?: string // e.g., "1.0.0 (100)"
	},

	// 3. Información del Dispositivo
	device?: {
		id?: string // unique device identifier
		os?: string // e.g., "iOS", "Android", "Windows"
		brand?: string // e.g., "Apple", "Samsung"
		model?: string // e.g., "iPhone 12", "Galaxy S21"
		osVersion?: string // e.g., "14.4", "11"
        modelVersion?: string
		platform?: DevicePlatform // e.g., "smartphone", "tablet", "tv", "smartwatch"
        screen?: DeviceScreen // screen dimensions and pixel ratio
	},

	// 4. Preferencias del Usuario
    preferences?: {
        appTheme?: string // e.g., "light", "dark"
        locale?: string // e.g., "en-US", "es-ES"
    },

	// 5. Información de Ubicación
	location?: {
		timezone?: string // IANA timezone identifier, e.g., "America/New_York"
		country?: string // ISO country code, e.g., "US", "ES"
	}

	// 6. Información de Request
	request?: {
		id?: string // e.g., "request_id_12345"
        path?: string // e.g., "/users/online/me"
		ipAddress?: string // e.g., "192.168.1.1"
		userAgent?: string // e.g., "Mozilla/5.0 (Windows NT 10.0; Win64; x64)..."
	}
}

interface DeviceScreen {
    width: number
    height: number
    pixelRatio: number
}

enum ClientType {
	WEB = 'web',
	MOBILE = 'mobile',
	DESKTOP = 'desktop',
	API = 'api',
}

export enum ClientEnvironment {
	PRODUCTION = 'production',
	STAGING = 'staging',
	DEVELOPMENT = 'development',
}

enum DevicePlatform {
	SMARTPHONE = 'smartphone',
	TABLET = 'tablet',
	IPAD = 'ipad',
	SMARTWATCH = 'smartwatch',
	DESKTOP = 'desktop',
	LAPTOP = 'laptop',
	TV = 'tv',
}
