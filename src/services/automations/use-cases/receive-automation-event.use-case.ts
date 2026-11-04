import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { isTokenRevoked } from '@services/authentication'
import { AutomationRunProps } from '../entities'
import { AutomationRepository, AutomationRunRepository } from '../repositories'
import { AutomationEventError } from '../utils/automation-event-error'
import { readEventToken } from '../utils/event-token'
import { openRun } from '../utils/open-run'
import { maxQueuedRuns } from '../utils/settings'
import { eventScope } from '../utils/runner-scope'

const MAX_PAYLOAD_CHARS = 50000
const MAX_KEY_CHARS = 200

export type AutomationEventStatus = 'queued' | 'duplicate' | 'skipped'

export interface Params extends BaseUseCaseParams {
	automationId: string
	token: string
	payload?: unknown
	idempotencyKey?: string
	now?: Date
}

export interface Output extends BaseUseCaseOutput {
	data: { status: AutomationEventStatus, run: AutomationRunProps }
}

const serialize = (payload: unknown): string | undefined => {
	const text = typeof payload === 'string' ? payload : JSON.stringify(payload)

	return text || undefined
}

export class ReceiveAutomationEventUseCase extends BaseUseCase<Params, Output> {
	constructor (
		private readonly automationRepository = new AutomationRepository(),
		private readonly automationRunRepository = new AutomationRunRepository(),
	) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { automationId, token } = params
		const now = params.now ?? new Date()

		const claims = readEventToken(token)
		if (claims.sub !== automationId) throw new AutomationEventError('invalid')

		const automation = await this.automationRepository!.findById(automationId, eventScope)
		if (!automation) throw new AutomationEventError('not_found')
		const event = automation.triggers?.event
		if (!event || automation.eventTokenVersion !== claims.v) throw new AutomationEventError('invalid')
		if (!event.enabled) throw new AutomationEventError('disabled')

		const { data: { revoked } } = await isTokenRevoked({ jti: claims.jti })
		if (revoked) throw new AutomationEventError('revoked')

		const payload = serialize(params.payload)
		if (payload && payload.length > MAX_PAYLOAD_CHARS) throw new AutomationEventError('payload_too_large')

		const idempotencyKey = params.idempotencyKey?.trim() || undefined
		if (idempotencyKey && idempotencyKey.length > MAX_KEY_CHARS) throw new Error(`The idempotency key cannot be longer than ${MAX_KEY_CHARS} characters`)

		if (idempotencyKey) {
			const duplicate = await this.automationRunRepository!.findByIdempotencyKey(automationId, idempotencyKey, eventScope)
			if (duplicate) return { data: { status: 'duplicate', run: duplicate } }
		}

		if (await this.automationRunRepository!.countQueued(automationId, eventScope) >= maxQueuedRuns()) {
			const skipped = await openRun(this.automationRunRepository!, { scope: eventScope, automation, trigger: 'event', status: 'skipped', now, payload, skipReason: 'The queue of this automation is full' })
			return { data: { status: 'skipped', run: skipped.toJSON() } }
		}

		try {
			const run = await openRun(this.automationRunRepository!, { scope: eventScope, automation, trigger: 'event', status: 'queued', now, payload, idempotencyKey })
			return { data: { status: 'queued', run: run.toJSON() } }
		} catch (error: any) {
			if (!idempotencyKey || error?.code !== 11000) throw error

			const duplicate = await this.automationRunRepository!.findByIdempotencyKey(automationId, idempotencyKey, eventScope)
			if (!duplicate) throw error

			return { data: { status: 'duplicate', run: duplicate } }
		}
	}
}
