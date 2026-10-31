import { autoInjectable, inject } from 'tsyringe'
import { Logger } from '@common/logger'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { AutomationProps, AutomationRunProps } from '../entities'
import { AutomationRepository, AutomationRunRepository } from '../repositories'
import { computeNextRun } from '../utils/next-run'
import { openRun } from '../utils/open-run'
import { leaseMs as defaultLeaseMs } from '../utils/settings'
import { findPausedRun } from '../utils/previous-run'
import { SyncAutomationRunUseCase } from './sync-automation-run.use-case'

const DEFAULT_LIMIT = 10

export interface Params extends BaseUseCaseParams {
	workerId: string
	limit?: number
	leaseMs?: number
	now?: Date
}

export interface ClaimedRun {
	automation: AutomationProps
	run: AutomationRunProps
}

export interface Output extends BaseUseCaseOutput {
	data: { claimed: ClaimedRun[], skipped: ClaimedRun[] }
}

@autoInjectable()
export class ClaimDueAutomationsUseCase extends BaseUseCase<Params, Output> {
	private readonly log = new Logger()

	constructor (
		@inject(AutomationRepository) private readonly automationRepository?: AutomationRepository,
		@inject(AutomationRunRepository) private readonly automationRunRepository?: AutomationRunRepository,
		@inject(SyncAutomationRunUseCase) private readonly syncRun?: SyncAutomationRunUseCase,
	) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { workerId } = params
		if (!workerId) throw new Error('The id of the worker is required')

		const now = params.now ?? new Date()
		const leaseMs = params.leaseMs ?? defaultLeaseMs()
		const due = await this.automationRepository!.findDue(now, params.limit ?? DEFAULT_LIMIT)

		const claimed: ClaimedRun[] = []
		const skipped: ClaimedRun[] = []

		for (const candidate of due) {
			const id = String(candidate._id)
			const scheduledFor = candidate.nextRunAt ? new Date(candidate.nextRunAt) : undefined

			const trigger = candidate.trigger
			if (trigger?.type !== 'schedule') continue

			let nextRunAt: Date | null = null

			try {
				nextRunAt = computeNextRun(trigger.recurrence, trigger.timezone, now)
			} catch (error: any) {
				this.log.error({ error: error?.message ?? error, automationId: id }, '[AUTOMATIONS] The recurrence of an automation cannot be calculated, skipping it')
				continue
			}

			const automation = await this.automationRepository!.claim({ id, workerId, now, leaseMs, nextRunAt: nextRunAt ?? undefined })
			if (!automation) continue

			const pending = await findPausedRun(this.automationRunRepository!, this.syncRun!, automation, now)

			if (pending) {
				const run = await openRun(this.automationRunRepository!, { automation, trigger: 'schedule', status: 'skipped', workerId, now, scheduledFor, skipReason: 'The previous run is still waiting for the user' })
				await this.automationRepository!.release(id, workerId, { activeRunId: pending._id as any })
				skipped.push({ automation, run: run.toJSON() })
				continue
			}

			const run = await openRun(this.automationRunRepository!, { automation, trigger: 'schedule', status: 'running', workerId, now, scheduledFor })
			await this.automationRepository!.setActiveRun(id, workerId, String(run._id))
			claimed.push({ automation, run: run.toJSON() })
		}

		return { data: { claimed, skipped } }
	}
}
