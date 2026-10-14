import { randomBytes } from 'node:crypto'
import { hostname } from 'node:os'
import { Logger } from '@common/logger'
import { CurrentUser, CurrentSession } from '@common/base'
import { Agent, AgentOptions } from '@harness/agent'
import { AgiLoop } from '@loops/agi/loop'
import { createChat } from '@services/chats'
import { Chat } from '@services/chats/entities/chat.entity'
import { AgenticJobProps, AgenticJobRunError, AgenticJobRunProps, AgenticJobRunStatus } from '../entities'
import { leaseMs as defaultLeaseMs, pollIntervalMs as defaultPollIntervalMs } from '../utils/settings'
import { ClaimDueAgenticJobsUseCase } from '../use-cases/claim-due-agentic-jobs.use-case'
import { StartAgenticJobRunUseCase } from '../use-cases/start-agentic-job-run.use-case'
import { FinishAgenticJobRunUseCase } from '../use-cases/finish-agentic-job-run.use-case'
import { AttachAgenticJobRunChatUseCase } from '../use-cases/attach-agentic-job-run-chat.use-case'
import { RenewAgenticJobLeaseUseCase } from '../use-cases/renew-agentic-job-lease.use-case'
import { SyncAgenticJobRunsUseCase } from '../use-cases/sync-agentic-job-runs.use-case'
import { container } from 'tsyringe'

const DEFAULT_MAX_CONCURRENT_RUNS = 3
const DEFAULT_STOP_TIMEOUT_MS = 30000
const PAUSED_STATUSES = ['awaiting_user_confirmation', 'awaiting_user_input']

export interface AgenticJobContext {
	job: AgenticJobProps
	currentUser: CurrentUser
}

export type AgenticJobAgentConfig = Partial<AgentOptions> | ((context: AgenticJobContext) => Partial<AgentOptions> | Promise<Partial<AgentOptions>>)

export interface AgenticJobRunFinished {
	job: AgenticJobProps
	run: AgenticJobRunProps
	chat?: Chat
}

export interface AgenticJobRunnerOptions {
	agent?: AgenticJobAgentConfig
	intervalMs?: number
	leaseMs?: number
	maxConcurrentRuns?: number
	stopTimeoutMs?: number
	workerId?: string
	onRunFinished?: (event: AgenticJobRunFinished) => void | Promise<void>
}

const newWorkerId = (): string => `${hostname()}-${process.pid}-${randomBytes(3).toString('hex')}`

export class AgenticJobRunner {
	readonly workerId: string

	private readonly logger = new Logger()
	private readonly inFlight = new Set<Promise<void>>()
	private running = false
	private timer?: NodeJS.Timeout
	private ticking?: Promise<void>
	private wake?: () => void

	constructor (private readonly options: AgenticJobRunnerOptions = {}) {
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
			await container.resolve(SyncAgenticJobRunsUseCase).execute({})
		} catch (error: any) {
			this.logger.error({ error: error?.message ?? error }, '[AGENTIC JOBS] Failed to sync the open runs')
		}

		if (capacity <= 0) return

		const { data } = await container.resolve(ClaimDueAgenticJobsUseCase).execute({ workerId: this.workerId, limit: capacity, leaseMs: this.options.leaseMs ?? defaultLeaseMs() })

		for (const { job, run } of data.skipped) await this.notify({ job, run })

		for (const { job, run } of data.claimed) this.track(this.execute(job, run))
	}

	async runNow (params: { jobId: string }): Promise<{ run: AgenticJobRunProps }> {
		const { data } = await container.resolve(StartAgenticJobRunUseCase).execute({ jobId: params.jobId, workerId: this.workerId, leaseMs: this.options.leaseMs ?? defaultLeaseMs() })

		this.track(this.execute(data.job, data.run))

		return { run: data.run }
	}

	private async loop (): Promise<void> {
		while (this.running) {
			this.ticking = this.tick().catch(error => {
				this.logger.error({ error: error?.message ?? error }, '[AGENTIC JOBS] The worker failed to check the due jobs')
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
			.catch(error => this.logger.error({ error: error?.message ?? error }, '[AGENTIC JOBS] A run could not be completed'))
			.finally(() => this.inFlight.delete(tracked))
		this.inFlight.add(tracked)
	}

	private async execute (job: AgenticJobProps, run: AgenticJobRunProps): Promise<void> {
		const leaseMs = this.options.leaseMs ?? defaultLeaseMs()
		const jobId = String(job._id)
		const runId = String(run._id)

		const heartbeat = setInterval(() => {
			container.resolve(RenewAgenticJobLeaseUseCase).execute({ jobId, workerId: this.workerId, leaseMs }).catch(error => {
				this.logger.error({ error: error?.message ?? error, jobId }, '[AGENTIC JOBS] Failed to renew the lease of a job')
			})
		}, Math.max(Math.floor(leaseMs / 3), 1000))

		let status: Extract<AgenticJobRunStatus, 'completed' | 'paused' | 'failed'> = 'failed'
		let error: AgenticJobRunError | undefined
		let chat: Chat | undefined

		try {
			const outcome = await this.runAgent(job, runId)

			status = outcome.status
			error = outcome.error
			chat = outcome.chat
		} catch (failure: any) {
			error = { code: failure?.code ?? 'RUNNER_ERROR', message: failure?.message ?? String(failure) }
			this.logger.error({ error: error.message, jobId, runId }, '[AGENTIC JOBS] A run failed')
		} finally {
			clearInterval(heartbeat)
		}

		const { data } = await container.resolve(FinishAgenticJobRunUseCase).execute({ runId, workerId: this.workerId, status, error })

		await this.notify({ job, run: data ?? run, chat })
	}

	private async runAgent (job: AgenticJobProps, runId: string): Promise<{ status: 'completed' | 'paused' | 'failed', error?: AgenticJobRunError, chat?: Chat }> {
		const currentUser = await CurrentUser.asyncFromDB(String(job.ownerId))
		if (!currentUser) return { status: 'failed', error: { code: 'OWNER_NOT_FOUND', message: 'The owner of the job does not exist' } }

		const configured = typeof this.options.agent === 'function' ? await this.options.agent({ job, currentUser }) : this.options.agent ?? {}
		const loop = configured.loop ?? new AgiLoop()
		const agent = new Agent({ ...configured, loop })

		const model = job.modelProvider && job.modelName ? { modelProvider: job.modelProvider, modelName: job.modelName } : {}

		const draft = Chat.withDefaults(loop.name)
		draft.settings?.setExecutionMode('autonomous')
		if (model.modelProvider) draft.settings?.setModelProvider(model.modelProvider)
		if (model.modelName) draft.settings?.setModelName(model.modelName)

		const { data: created } = await createChat({ payload: draft.toJSON(), currentUser })
		const chatId = String(created?._id)

		await container.resolve(AttachAgenticJobRunChatUseCase).execute({ runId, chatId })

		const result = await agent.run({
			input: { message: job.instructions as string, chatId },
			options: { executionMode: 'autonomous', ...model },
			currentUser,
			currentSession: CurrentSession.fromJSON({ location: { timezone: job.timezone } } as any),
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

	private async notify (event: AgenticJobRunFinished): Promise<void> {
		if (!this.options.onRunFinished) return

		try {
			await this.options.onRunFinished(event)
		} catch (error: any) {
			this.logger.error({ error: error?.message ?? error }, '[AGENTIC JOBS] The onRunFinished callback failed')
		}
	}
}

export function createAgenticJobRunner (options: AgenticJobRunnerOptions = {}): AgenticJobRunner {
	return new AgenticJobRunner(options)
}
