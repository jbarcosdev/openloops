import { randomBytes } from 'node:crypto'
import { hostname } from 'node:os'
import { Logger } from '@common/logger'
import { secretManager } from '@common/utils/secret-manager'
import { CurrentUser, CurrentSession } from '@common/base'
import { Agent, AgentOptions } from '@harness/agent'
import { AgiLoop } from '@loops/agi/loop'
import { createChat } from '@services/chats'
import { Chat } from '@services/chats/entities/chat.entity'
import { AutomationProps, AutomationRunError, AutomationRunProps, AutomationRunStatus } from '../entities'
import { leaseMs as defaultLeaseMs, pollIntervalMs as defaultPollIntervalMs } from '../utils/settings'
import { ClaimDueAutomationsUseCase } from '../use-cases/claim-due-automations.use-case'
import { StartAutomationRunUseCase } from '../use-cases/start-automation-run.use-case'
import { FinishAutomationRunUseCase } from '../use-cases/finish-automation-run.use-case'
import { AttachAutomationRunChatUseCase } from '../use-cases/attach-automation-run-chat.use-case'
import { RenewAutomationLeaseUseCase } from '../use-cases/renew-automation-lease.use-case'
import { SyncAutomationRunsUseCase } from '../use-cases/sync-automation-runs.use-case'
import { container } from 'tsyringe'

const DEFAULT_MAX_CONCURRENT_RUNS = 3
const DEFAULT_STOP_TIMEOUT_MS = 30000
const PAUSED_STATUSES = ['awaiting_user_confirmation', 'awaiting_user_input']

export interface AutomationContext {
	automation: AutomationProps
	currentUser: CurrentUser
}

export type AutomationAgentConfig = Partial<AgentOptions> | ((context: AutomationContext) => Partial<AgentOptions> | Promise<Partial<AgentOptions>>)

export interface AutomationRunFinished {
	automation: AutomationProps
	run: AutomationRunProps
	chat?: Chat
}

export interface AutomationRunnerOptions {
	agent?: AutomationAgentConfig
	intervalMs?: number
	leaseMs?: number
	maxConcurrentRuns?: number
	stopTimeoutMs?: number
	workerId?: string
	onRunFinished?: (event: AutomationRunFinished) => void | Promise<void>
}

const newWorkerId = (): string => `${hostname()}-${process.pid}-${randomBytes(3).toString('hex')}`

export class AutomationRunner {
	readonly workerId: string

	private readonly logger = new Logger()
	private readonly inFlight = new Set<Promise<void>>()
	private running = false
	private timer?: NodeJS.Timeout
	private ticking?: Promise<void>
	private wake?: () => void

	constructor (private readonly options: AutomationRunnerOptions = {}) {
		this.workerId = options.workerId ?? newWorkerId()
	}

	start (): void {
		if (this.running) return

		this.running = true
		void this.loop()
	}

	async stop (): Promise<void> {
		this.running = false
		if (this.timer) clearTimeout(this.timer)
		this.wake?.()

		await this.ticking

		const pending = Promise.allSettled([...this.inFlight])
		const timeoutMs = this.options.stopTimeoutMs ?? DEFAULT_STOP_TIMEOUT_MS
		let timer: NodeJS.Timeout | undefined

		await Promise.race([pending, new Promise(resolve => { timer = setTimeout(resolve, timeoutMs) })])
		clearTimeout(timer)
	}

	async tick (): Promise<void> {
		const capacity = (this.options.maxConcurrentRuns ?? DEFAULT_MAX_CONCURRENT_RUNS) - this.inFlight.size

		try {
			await container.resolve(SyncAutomationRunsUseCase).execute({})
		} catch (error: any) {
			this.logger.error({ error: error?.message ?? error }, '[AUTOMATIONS] Failed to sync the open runs')
		}

		if (capacity <= 0) return

		const { data } = await container.resolve(ClaimDueAutomationsUseCase).execute({ workerId: this.workerId, limit: capacity, leaseMs: this.options.leaseMs ?? defaultLeaseMs() })

		for (const { automation, run } of data.skipped) await this.notify({ automation, run })

		for (const { automation, run } of data.claimed) this.track(this.execute(automation, run))
	}

	async runNow (params: { automationId: string }): Promise<{ run: AutomationRunProps }> {
		const { data } = await container.resolve(StartAutomationRunUseCase).execute({ automationId: params.automationId, workerId: this.workerId, leaseMs: this.options.leaseMs ?? defaultLeaseMs() })

		this.track(this.execute(data.automation, data.run))

		return { run: data.run }
	}

	private async loop (): Promise<void> {
		while (this.running) {
			this.ticking = this.tick().catch(error => {
				this.logger.error({ error: error?.message ?? error }, '[AUTOMATIONS] The worker failed to check the due automations')
			})

			await this.ticking

			if (!this.running) break

			await new Promise<void>(resolve => {
				this.wake = resolve
				this.timer = setTimeout(resolve, this.options.intervalMs ?? defaultPollIntervalMs())
			})
		}
	}

	private track (execution: Promise<void>): void {
		const tracked: Promise<void> = execution
			.catch(error => this.logger.error({ error: error?.message ?? error }, '[AUTOMATIONS] A run could not be completed'))
			.finally(() => this.inFlight.delete(tracked))
		this.inFlight.add(tracked)
	}

	private async execute (automation: AutomationProps, run: AutomationRunProps): Promise<void> {
		const leaseMs = this.options.leaseMs ?? defaultLeaseMs()
		const automationId = String(automation._id)
		const runId = String(run._id)

		const heartbeat = setInterval(() => {
			container.resolve(RenewAutomationLeaseUseCase).execute({ automationId, workerId: this.workerId, leaseMs }).catch(error => {
				this.logger.error({ error: error?.message ?? error, automationId }, '[AUTOMATIONS] Failed to renew the lease of an automation')
			})
		}, Math.max(Math.floor(leaseMs / 3), 1000))

		let status: Extract<AutomationRunStatus, 'completed' | 'paused' | 'failed'> = 'failed'
		let error: AutomationRunError | undefined
		let chat: Chat | undefined

		try {
			const outcome = await this.runAgent(automation, runId)

			status = outcome.status
			error = outcome.error
			chat = outcome.chat
		} catch (failure: any) {
			error = { code: failure?.code ?? 'RUNNER_ERROR', message: failure?.message ?? String(failure) }
			this.logger.error({ error: error.message, automationId, runId }, '[AUTOMATIONS] A run failed')
		} finally {
			clearInterval(heartbeat)
		}

		const { data } = await container.resolve(FinishAutomationRunUseCase).execute({ runId, workerId: this.workerId, status, error })

		await this.notify({ automation, run: data ?? run, chat })
	}

	private async runAgent (automation: AutomationProps, runId: string): Promise<{ status: 'completed' | 'paused' | 'failed', error?: AutomationRunError, chat?: Chat }> {
		const currentUser = await CurrentUser.asyncFromDB(String(automation.ownerId))
		if (!currentUser) return { status: 'failed', error: { code: 'OWNER_NOT_FOUND', message: 'The owner of the automation does not exist' } }

		const configured = typeof this.options.agent === 'function' ? await this.options.agent({ automation, currentUser }) : this.options.agent ?? {}
		const loop = configured.loop ?? new AgiLoop()
		const agent = new Agent({ ...configured, loop })

		const model = automation.modelProvider && automation.modelName ? { modelProvider: automation.modelProvider, modelName: automation.modelName } : {}

		const draft = Chat.withDefaults(loop.name)
		draft.settings?.setExecutionMode('autonomous')
		if (model.modelProvider) draft.settings?.setModelProvider(model.modelProvider)
		if (model.modelName) draft.settings?.setModelName(model.modelName)

		const { data: created } = await createChat({ payload: draft.toJSON(), currentUser })
		const chatId = String(created?._id)

		await container.resolve(AttachAutomationRunChatUseCase).execute({ runId, chatId })

		const result = await agent.run({
			input: { message: automation.instructions as string, chatId },
			options: { executionMode: 'autonomous', ...model },
			currentUser,
			currentSession: CurrentSession.fromJSON({ location: { timezone: automation.trigger?.timezone } } as any),
			serviceToken: process.env.INTERNAL_MCP_TOKEN ? secretManager.get('INTERNAL_MCP_TOKEN') : undefined,
		})

		const chat = result.data as Chat | undefined
		const state = chat?.state

		if (result.error) return { status: 'failed', error: { code: state?.lastError?.code ?? 'AGENT_RUN_FAILED', message: result.error }, chat }
		if (state?.status === 'failed') return { status: 'failed', error: { code: state.lastError?.code ?? 'AGENT_RUN_FAILED', message: state.lastError?.message ?? 'The run failed' }, chat }
		if (state?.status && PAUSED_STATUSES.includes(state.status)) return { status: 'paused', chat }

		const blocked = (chat?.tasks.length ?? 0) === 0 && chat?.messages?.at(-1)?.source === 'harness'
		if (blocked) return { status: 'failed', error: { code: 'BLOCKED_BY_GUARDRAIL', message: chat?.lastAnswer ?? 'The instructions were blocked by a guardrail' }, chat }

		return { status: 'completed', chat }
	}

	private async notify (event: AutomationRunFinished): Promise<void> {
		if (!this.options.onRunFinished) return

		try {
			await this.options.onRunFinished(event)
		} catch (error: any) {
			this.logger.error({ error: error?.message ?? error }, '[AUTOMATIONS] The onRunFinished callback failed')
		}
	}
}

export function createAutomationRunner (options: AutomationRunnerOptions = {}): AutomationRunner {
	return new AutomationRunner(options)
}
