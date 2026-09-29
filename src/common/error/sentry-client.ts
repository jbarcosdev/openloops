import * as Sentry from '@sentry/node'
import { logger } from '../logger'
import { secretManager } from '@common/utils/secret-manager'

export class SentryClient {
    private static instance: SentryClient
    private readonly enabled: boolean

    static getInstance(): SentryClient {
        if (!SentryClient.instance) {
            SentryClient.instance = new SentryClient()
        }
        return SentryClient.instance
    }

    private constructor() {
        const dsn = this.resolveDsn()
        this.enabled = !!dsn

        if (!dsn) {
            logger.warn('[Sentry Client] Sentry DSN is not configured. Skipping error reporting.')
            return
        }

        Sentry.init({ dsn, environment: process.env.NODE_ENV || 'production', tracesSampleRate: 0.0 })

        logger.debug('[Sentry Client] Sentry client initialized')
    }

    async captureError(error: unknown, contextData?: Record<string, any>): Promise<void> {
        if (!this.enabled) return

        Sentry.withScope(scope => {
            if (contextData) scope.setExtras(contextData)
            Sentry.captureException(error)
        })

        try {
            await Sentry.flush(2000)
            logger.debug('[Sentry Client] Error reported to Sentry successfully')
        } catch (e) {
            logger.error(e, '[Sentry Client] Failed to flush Sentry events')
        }
    }

    setUser(userId: string): void {
        if (!this.enabled) return
        Sentry.setUser({ id: userId })
    }

    private resolveDsn(): string | undefined {
        try {
            return secretManager.get('SENTRY_DSN')
        } catch {
            return undefined
        }
    }
}

export const sentryClient = SentryClient.getInstance()

