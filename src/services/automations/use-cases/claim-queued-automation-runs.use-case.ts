import { autoInjectable, inject } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { AutomationRun, AutomationProps, AutomationRunProps } from '../entities'
import { AutomationRepository, AutomationRunRepository } from '../repositories'
import { findPausedRun } from '../utils/previous-run'
import { leaseMs as defaultLeaseMs } from '../utils/settings'
import { SyncAutomationRunUseCase } from './sync-automation-run.use-case'

const SCAN_LIMIT = 200

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
export class ClaimQueuedAutomationRunsUseCase extends BaseUseCase<Params, Output> {
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
		const limit = params.limit ?? SCAN_LIMIT
		const queued = await this.automationRunRepository!.findByStatus('queued', SCAN_LIMIT)

		const claimed: ClaimedRun[] = []
		const skipped: ClaimedRun[] = []
		const seen = new Set<string>()

		for (const run of queued) {
			if (claimed.length >= limit) break

			const automationId = String(run.automationId)
			if (seen.has(automationId)) continue
			seen.add(automationId)

			const existing = await this.automationRepository!.findById(automationId)
			const reason = !existing ? 'The automation no longer exists' : !existing.enabled ? 'The automation is turned off' : undefined

			if (reason) {
				const settled = await this.automationRunRepository!.update(AutomationRun.fromJSON({ ...run, status: 'skipped', finishedAt: now, skipReason: reason }))
				if (existing && settled) skipped.push({ automation: existing, run: settled })
				continue
			}

			const automation = await this.automationRepository!.claimManual({ id: automationId, workerId, now, leaseMs })
			if (!automation) continue

			const paused = await findPausedRun(this.automationRunRepository!, this.syncRun!, automation, now)

			if (paused) {
				await this.automationRepository!.release(automationId, workerId, { activeRunId: paused._id as any })
				continue
			}

			const started = await this.automationRunRepository!.claimQueued(String(run._id), {
				workerId,
				startedAt: now,
				instructions: automation.instructions,
				modelProvider: automation.modelProvider,
				modelName: automation.modelName,
			})

			if (!started) {
				await this.automationRepository!.release(automationId, workerId, {})
				continue
			}

			await this.automationRepository!.setActiveRun(automationId, workerId, String(started._id))
			claimed.push({ automation, run: started })
		}

		return { data: { claimed, skipped } }
	}
}
