export interface HttpErrorProps {
	statusCode: number
	errorMessage: string
	errorDetails?: any
}

export class HttpError {
	readonly statusCode: number
	readonly errorMessage: string
	readonly errorDetails?: any

	constructor (props: HttpErrorProps) {
		this.statusCode = props.statusCode
		this.errorMessage = props.errorMessage
		this.errorDetails = props.errorDetails
	}
}
