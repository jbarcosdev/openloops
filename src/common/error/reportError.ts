import { HttpError } from './http-error'
import { logger } from '../logger'
import { sentryClient } from '@common/clients/sentry-client'

export const reportError = async (error: Error | HttpError | string, details?: object): Promise<void> => {
	error = typeof error === 'string' ? new Error(error) : error

	const errorMessage = (error instanceof HttpError ? error?.errorMessage : error?.message) || 'Unknown error'
	const errorDetails = (error instanceof HttpError ? error?.errorDetails : error?.stack) || 'No stack trace available'
	const statusCode = error instanceof HttpError ? error?.statusCode : 500

	logger.debug({
		error: details,
		message: errorMessage,
	}, '[Report Error] Reporting new error')

	const isLocal = process.env.IS_LOCAL === 'true' || process.env.NODE_ENV === 'development'

	try {
		!isLocal && await sentryClient.captureError(error, {
			statusCode,
			errorMessage,
			errorDetails,
			...details
		})
	} catch (error) {
		logger.error({ error }, '[Report Error] Failed to report error to Sentry')
	}
}
