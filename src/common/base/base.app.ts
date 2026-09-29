import { Logger } from '@common/logger'
import { reportError } from '@common/error'
import { HttpError, HttpErrorProps } from '@common/error'
import { secretManager } from '@common/utils/secret-manager'
import { CurrentSessionProps } from '@common/core'

export abstract class BaseApp {
    public logger: Logger = new Logger()
    public secretManager = secretManager

    public reportError = reportError

    public async onCatch (error: Error) {
        await reportError(error)
        throw error
    }

    public throwHttpError (error: HttpErrorProps) {
        throw new HttpError(error)
    }

    public throwError401 (currentSession?: CurrentSessionProps) {
		this.throwHttpError({
			statusCode: 401,
			errorMessage: '{{invalid_token}}: {{not_authenticated_error_details}}',
			errorDetails: JSON.stringify(currentSession ?? {}),
		})
	}

    public throwError403 (currentSession?: CurrentSessionProps) {
        this.throwHttpError({
            statusCode: 403,
            errorMessage: '{{forbidden_error}}: {{forbidden_error_details}}',
            errorDetails: JSON.stringify(currentSession ?? {}),
        })
    }
}
