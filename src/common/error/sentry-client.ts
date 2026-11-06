import type * as SentryNode from '@sentry/node'
import { logger } from '../logger'
import { secretManager } from '@common/utils/secret-manager'

type SentrySdk = typeof SentryNode

export class SentryClient {
    private static instance: SentryClient
    private sdk?: SentrySdk | null

    static getInstance (): SentryClient {
        if (!SentryClient.instance) {
            SentryClient.instance = new SentryClient()
        }
        return SentryClient.instance
    }

    private constructor () {}

    async captureError (error: unknown, contextData?: Record<string, any>): Promise<void> {
        const Sentry = this.load()
        if (!Sentry) return

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

    private load (): SentrySdk | null {
        if (this.sdk !== undefined) return this.sdk

        const dsn = this.resolveDsn()

        if (!dsn) {
            logger.warn('[Sentry Client] Sentry DSN is not configured. Skipping error reporting.')
            return this.sdk = null
        }

        try {
            const Sentry: SentrySdk = require('@sentry/node')

            Sentry.init({ dsn, environment: process.env.NODE_ENV || 'production', tracesSampleRate: 0.0 })
            logger.warn('[Sentry Client] Reporting to Sentry with SENTRY_DSN is deprecated and will be removed in a future version. Register your own reporter with setErrorReporter.')

            return this.sdk = Sentry
        } catch {
            logger.warn('[Sentry Client] SENTRY_DSN is set but @sentry/node is not installed. Install it, or register your own reporter with setErrorReporter.')
            return this.sdk = null
        }
    }

    private resolveDsn (): string | undefined {
        try {
            return secretManager.get('SENTRY_DSN')
        } catch {
            return undefined
        }
    }
}

export const sentryClient = SentryClient.getInstance()
