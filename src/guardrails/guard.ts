import { createHash } from 'crypto'
import type { CurrentUser, CurrentSession } from '@common/base'
import type { Logger } from '@common/logger'
import type { Chat } from '@services/chats/entities/chat.entity'
import type { RunContext } from '@harness/agent-loop'

export type GuardType = 'input'

export interface InputGuardContext {
    message: string
    chat: Chat
    currentUser: CurrentUser
    currentSession?: CurrentSession
    skillParams: RunContext['skillParams']
    logger: Logger
}

export interface GuardContextMap {
    input: InputGuardContext
}

/**
 * What a guard handler returns.
 * - `passed: true` lets the message continue.
 * - `passed: false` blocks it. The user receives the guard's `reply`, never `reason`.
 * - `reason` is internal. It is only written to the chat traces, so it is safe to be specific.
 */
export interface GuardResult {
    passed: boolean
    reason?: string
}

export interface GuardProps<T extends GuardType = GuardType> {
    /** Unique name. It identifies the guard in the traces and derives the default `ref`. */
    name: string
    /** Short explanation of what the guard checks. */
    description?: string
    /** Where the guard runs. Only `'input'` (the user message, before the model) exists for now. */
    type: T
    /** Text sent to the user when the guard blocks. The harness appends `Ref: <ref>` to it. */
    reply: string
    /** Identifier attached to every blocked exchange. If omitted, it is derived from `name`. */
    ref?: string
    /** Decides whether the message passes. May be async. If it throws, the request is blocked. */
    handler: (context: GuardContextMap[T]) => Promise<GuardResult> | GuardResult
}

/**
 * A rule that can block part of an agent run. Its `type` says where it runs.
 * Only `'input'` exists for now: it runs on the user message, before the model sees it.
 *
 * Guards are plain instances, like tools. Register them with `agent.addGuard(guard)` or the `guards`
 * option of the agent. Guards of the same type run in registration order and the first one that blocks
 * wins. For an input guard the model is never called, no task is created, and the user gets the guard's
 * `reply` followed by `Ref: <ref>`. The blocked exchange is stored, flagged with `excludeFromContext`, and is left out of the
 * history the model reads later.
 *
 * Create your own with `new Guard`:
 *
 * ```ts
 * const noSpam = new Guard({
 *     name: 'no-spam',
 *     type: 'input',
 *     reply: 'This looks like spam.',
 *     handler: ({ message }) => /buy now/i.test(message) ? { passed: false, reason: 'Spam phrase' } : { passed: true },
 * })
 * ```
 *
 * The handler receives the message plus the chat, the user, the session and a logger.
 * Ready made guards are imported from `openloops/guardrails`, grouped by type (`inputGuards`).
 */
export class Guard<T extends GuardType = GuardType> {
    readonly name: string
    readonly description?: string
    readonly type: T
    readonly reply: string
    /** Reference shown to the user in the reply and written to the traces, so a blocked message can be traced back to this guard. */
    readonly ref: string
    private readonly handler: GuardProps<T>['handler']

    constructor (props: GuardProps<T>) {
        this.name = props.name
        this.description = props.description
        this.type = props.type
        this.reply = props.reply
        this.ref = props.ref ?? Guard.refFor(props.type, props.name)
        this.handler = props.handler
    }

    /** Derives a stable 32 character reference from a guard type and name. Used when no `ref` is given. */
    static refFor (type: GuardType, name: string): string {
        return createHash('sha256').update(`guard:${type}:${name}`).digest().subarray(0, 24).toString('base64')
    }

    /**
     * Returns a copy of this guard with another reply. Name, `ref` and handler stay the same.
     * Ready made guards are shared instances and `reply` is read only, so use this to change
     * their message (translate it, change the tone) without writing a new guard:
     *
     * ```ts
     * agent.addGuard(inputGuards.blockCode.withReply('Please describe the problem in plain text.'))
     * ```
     */
    withReply (reply: string): Guard<T> {
        return new Guard({ name: this.name, description: this.description, type: this.type, reply, ref: this.ref, handler: this.handler })
    }

    /** Runs the handler. The harness calls this, so there is rarely a reason to call it directly. */
    async run (context: GuardContextMap[T]): Promise<GuardResult> {
        return this.handler(context)
    }
}
