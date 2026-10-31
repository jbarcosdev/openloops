export type AutomationEventRejection = 'invalid' | 'expired' | 'revoked' | 'not_found' | 'disabled' | 'payload_too_large'

export class AutomationEventError extends Error {
	readonly statusCode: number

	constructor (readonly reason: AutomationEventRejection) {
		super(reason === 'payload_too_large' ? 'The payload of the event is too large' : 'Unauthorized')
		this.name = 'AutomationEventError'
		this.statusCode = reason === 'payload_too_large' ? 413 : 401
	}
}
