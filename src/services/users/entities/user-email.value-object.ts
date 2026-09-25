import { HttpError } from '@common/error'
import { sanitizeString } from '@common/helpers'

export class UserEmail {
    private static readonly EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/

    private constructor() {}

    public static validateFormat(email: string): boolean {
        return this.EMAIL_REGEX.test(email)
    }

    public static create(email: string | undefined): string | undefined {
        if (!email) return undefined

        const normalized = typeof email === 'string' ? sanitizeString(email.trim())?.toLowerCase() : ''

        if (!this.validateFormat(normalized ?? '')) throw new HttpError({ statusCode: 400, errorMessage: '{{invalid_email_format}}', errorDetails: { email } })

        return normalized
    }
}
