import { CurrentUser, CurrentSession } from '@common/base'
import type { Chat } from '@services/chats/entities/chat.entity'

export interface RuntimeContextParams {
    currentUser?: CurrentUser
    currentSession?: CurrentSession
    chat?: Chat
}

export function buildRuntimeContext (params: RuntimeContextParams): Record<string, any> {
    const { currentUser, currentSession, chat } = params

    const currentCountryCode = currentSession?.location?.country
    const currentCurrencyCode = currentSession?.currencyCode

    const now = new Date()
    const timezone = currentSession?.location?.timezone
    const nowLocal = timezone ? now.toLocaleString('sv-SE', { timeZone: timezone }) : undefined

    return {
        now_utc: now.toISOString(),
        now_local: nowLocal,
        timezone,
        day_of_week: now.toLocaleDateString('en-US', { weekday: 'long' }),
        ...(chat?.state?.language ? { detected_language: chat.state.language } : {}),
        ...(currentUser ?
            {
                user_details: {
                    first_name: currentUser?.firstName,
                    last_name: currentUser?.lastName,

                    preferred_language: currentUser?.language,
                    residence_country_code: currentUser?.preferences?.country?.isoCode,
                    preferred_currency_code: currentUser?.preferences?.currency?.isoCode,
                }
            } : {}
        ),
        ...(currentSession ?
            {
                session_details: {
                    current_location: {
                        country_code: currentCountryCode,
                        currency_code: currentCurrencyCode,
                        timezone_offset: currentSession?.timezoneOffset,
                    },
                    client_info: {
                        platform: currentSession?.device?.os,
                        brand: currentSession?.device?.brand,
                        model: currentSession?.device?.model,
                    }
                }
            } : {}
        ),
    }
}
