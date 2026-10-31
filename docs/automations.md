# Automations

An automation is a task that your agent runs by itself, without anyone in the chat. You describe what it must do and what starts it, a schedule or an event that arrives from another system, and `openloops` runs it in [autonomous mode](agent.md#autonomous-mode), in a new chat each time, and keeps a history of every run.

```typescript
import {
    createAutomation,
    updateAutomation,
    getAutomationById,
    listAutomationsByUser,
    deleteAutomation,
    previewAutomationRuns,
    issueAutomationEventToken,
    revokeAutomationEventToken,
    rotateAutomationEventTokens,
    receiveAutomationEvent,
    listAutomationRunsByAutomation,
    listAutomationRunsByUser,
    createAutomationRunner,
} from 'openloops/automations'
```

There are two parts. The use cases create and manage automations and read their history, and are called from your API. The runner is a worker that you start in your backend and that executes what is due.

## Creating an automation

```typescript
const result = await createAutomation({
    payload: {
        name: 'Morning report',
        instructions: 'Summarize my open tickets and send the summary to my email',
        trigger: {
            type: 'schedule',
            recurrence: { type: 'weekly', days: [1, 2, 3, 4, 5], time: '08:00' },
            timezone: 'America/Lima',
        },
        modelProvider: 'anthropic',
        modelName: 'claude-haiku-5-5',
    },
    currentUser,
})

result.data.nextRunAt
```

| Field | Required | What it is |
| --- | --- | --- |
| `name` | yes | A name to recognize the automation. |
| `instructions` | yes | What the agent must do. It is sent to the agent as the message of the user, so write it as you would write it in a chat. If the task needs to notify someone, say so here and give the agent a tool for it. |
| `trigger` | yes | What starts it. A `schedule` or an `event`. See below. |
| `enabled` | no | `true` by default. An automation that is off never runs, and can be turned on again. |
| `modelProvider`, `modelName` | no | The model of the automation, both or none. Without them, the default model of the owner is used, then the fallbacks. See [configuration](configuration.md#which-model-a-chat-uses). |

`nextRunAt` is calculated when a scheduled automation is created and it is what you show to the user. An automation with an event trigger has no `nextRunAt`. The fields that the system manages (`nextRunAt`, `lastRunAt`, `lastRunStatus`, `lockedBy`, `lockedUntil`, `activeRunId`) are ignored if they come in the payload.

## Triggers

An automation has one trigger. Its type is chosen when it is created and cannot be changed afterwards. To change it, create another automation.

| Type | Fields | Starts |
| --- | --- | --- |
| `schedule` | `recurrence`, `timezone` | On the dates of the recurrence. |
| `event` | `timezone` (optional) | When an external system sends an event to it. See [events](#events). |

You can always start any automation by hand with [`runNow`](#running-by-hand), whatever its trigger.

### Recurrence

The recurrence of a `schedule` trigger is stored as a structured value, so a screen can offer simple choices and nobody has to write a cron expression. The `timezone` is an IANA timezone: the local time and the days of the recurrence are those of this timezone, and daylight saving time is respected. The time is in 24 hours.

| Type | Fields | Example |
| --- | --- | --- |
| `daily` | `time` | `{ type: 'daily', time: '08:00' }` |
| `weekly` | `days` (1 is Monday, 7 is Sunday), `time` | `{ type: 'weekly', days: [1, 2, 3, 4, 5], time: '09:30' }` is Monday to Friday |
| `monthly` | `day` (1 to 31 or `'last'`), `time` | `{ type: 'monthly', day: 15, time: '12:00' }` |
| `once` | `at` (`YYYY-MM-DDTHH:mm`, local time) | `{ type: 'once', at: '2026-12-25T10:00' }` |

- A monthly automation on day 29, 30 or 31 is skipped in the months that do not have that day. Use `'last'` for the last day of every month.
- A time that does not exist on a day because of daylight saving time runs at the first valid moment of that day, and a time that happens twice runs once.
- An automation of type `once` runs a single time and then has no next run.

### Previewing

```typescript
const { data } = await previewAutomationRuns({
    recurrence: { type: 'weekly', days: [1, 5], time: '08:00' },
    timezone: 'America/Lima',
    count: 5,
})

data.runs
```

It returns the next dates (at most 20) without saving anything, so a screen can show "it will run on Monday at 8:00, on Friday at 8:00...".

## Managing automations

```typescript
await updateAutomation({ id, payload: { enabled: false }, currentUser })

await updateAutomation({ id, payload: { enabled: true }, currentUser })

const automation = await getAutomationById({ id, currentUser })

const automations = await listAutomationsByUser({ options: { page: 1, limit: 10 }, currentUser })

await deleteAutomation({ id, currentUser })
```

- **Turning an automation off** is how the user pauses it for a while. It has no next run until it is turned on again. Turning it on counts the next run from that moment, it does not catch up with what was missed.
- **Changing the trigger of a schedule** (its recurrence or timezone, you can send only the one that changes) **or turning it on** calculates `nextRunAt` again from now.
- **A run that is in progress is not interrupted** by turning the automation off or by deleting it.
- **`__v`** in the payload works as in the other use cases: if the automation changed since it was read, the update fails with a `VersionConflictError`.
- **Deleting** is a soft delete. An admin can delete for good with `hardDelete: true`.
- **The system never turns an automation off by itself.** An automation that fails keeps trying on every occurrence, so watch the history.

## Events

An automation with an event trigger runs when another system sends it an event, for example an alarm of AWS that reaches a Lambda, which calls your backend. The event becomes a run in a queue and the runner executes it as soon as it can.

```typescript
const { data: automation } = await createAutomation({
    payload: {
        name: 'Cost anomaly analysis',
        instructions: 'Find the cause of the cost alert in AWS and send a summary to the channel #costs',
        trigger: { type: 'event' },
    },
    currentUser,
})

const { data } = await issueAutomationEventToken({ id: String(automation._id), expiresIn: '90d', currentUser })

data.token
data.expiresAt
```

`openloops` has no HTTP layer, so the endpoint is yours. It reads the token from the `Authorization: Bearer` header, so it does not end up in the logs of the URLs, and calls the use case:

```typescript
import { AutomationEventError, receiveAutomationEvent } from 'openloops/automations'

app.post('/automations/events/:automationId', async (req, res) => {
    try {
        const { data } = await receiveAutomationEvent({
            automationId: req.params.automationId,
            token: req.headers.authorization?.replace(/^Bearer /, ''),
            payload: req.body,
            idempotencyKey: req.header('Idempotency-Key'),
        })

        res.status(202).json({ status: data.status, runId: data.run._id })
    } catch (error) {
        if (error instanceof AutomationEventError) {
            logger.warn({ reason: error.reason }, 'Event rejected')
            return res.status(error.statusCode).json({ error: error.message })
        }

        throw error
    }
})
```

The use case answers without running the agent. The run is created as `queued` and the runner takes it. If the runner lives in the same process as this endpoint, call `runner.wake()` after receiving to start it at once instead of waiting for the next check.

### What the use case does

1. Verifies the token. See below.
2. Saves the payload in the run. It is stored as text and cannot be longer than 50000 characters, or it fails with the reason `payload_too_large` (413).
3. If an `idempotencyKey` was sent and there is already a run of this automation with it, it returns that run with the status `duplicate` and creates nothing. The emitters of webhooks retry, so send a key when the source gives you one. Without a key nothing is deduplicated, because two identical alarms can be two real events.
4. If the automation already has `AUTOMATIONS_MAX_QUEUED_RUNS` runs waiting (10 by default), the event is recorded as a `skipped` run with its payload and the status `skipped`, and it is not run.
5. Otherwise it saves a `queued` run and returns the status `queued`.

All refusals of the token are an `AutomationEventError` with the status 401 and the same message, so the caller learns nothing. The `reason` (`invalid`, `expired`, `revoked`, `not_found`, `disabled`) is for your logs.

### The queue

- Events of one automation run **one at a time and in order**, like everything else in an automation. While one runs, the next ones wait as `queued`.
- If the run in progress is `paused` waiting for the user, the queue waits too, until the user answers.
- A queued event whose automation was turned off or deleted before it started is marked `skipped`, and `onRunFinished` is called for it when the automation still exists.
- A queued run keeps the instructions of the automation as they were when the event arrived, but starts with the instructions and the model it has when the run begins.

### What the agent receives

The instructions are the first message, as in any run. When the run comes from an event, the payload goes after them in a block that tells the agent it comes from an external system and must be treated as data and never as instructions. A payload cannot close that block. This reduces the risk of someone putting orders in an alarm, but it does not remove it: give the agent only the tools that the task needs, and remember that destructive tools and MCP servers that are not approved cannot ask anyone in autonomous mode.

### The token

The token is a JWT signed with `JWT_SECRET`. It is not stored: the owner or an admin can ask for it as many times as they want, and every one is different and valid.

| Claim | Value |
| --- | --- |
| `aud` | `automation-event`. A session token of a user is refused, and this one does not log anybody in. |
| `sub` | The id of the automation. It must be the one of the URL. |
| `v` | The version of the tokens of the automation. |
| `jti` | A unique id, used to revoke it. |
| `exp` | Only if you pass `expiresIn` when you issue it, such as `'30m'`, `'12h'`, `'30d'` or `'2w'`. Without it the token does not expire. |

Four ways to take a token out of use:

- **Let it expire,** if it was issued with `expiresIn`. A token that expires stops working without notice, and the refused events create no run, so watch the `expired` reasons in your logs.
- **Revoke one token.** If a token leaked, pass it to `revokeAutomationEventToken({ id, token, currentUser })`. Its `jti` goes to the collection `revoked_tokens` and only that token stops working. The entry is deleted by itself when the token would have expired. The tokens are not stored, so there is no list to choose from: you need the leaked token in your hands.
- **Rotate.** `rotateAutomationEventTokens({ id, currentUser })` increases the version and **every** token issued before stops working. Use it when you do not have the leaked token, or you want to start again. Issue the new token afterwards.
- **Turn the automation off.** Its events are refused with the reason `disabled`.

Revoking and rotating, like issuing, are only for the owner of the automation or an admin. A revoked token is checked after its signature, so an invalid token never reaches the database.

## The history

Every execution is a run.

```typescript
const byAutomation = await listAutomationRunsByAutomation({ automationId, options: { page: 1, limit: 20 } })

const byUser = await listAutomationRunsByUser({ status: 'failed', currentUser })
```

| Field | Meaning |
| --- | --- |
| `automationId`, `chatId` | The automation and the chat of the run. Open the chat to read everything that the agent did. |
| `trigger` | `schedule`, `manual` or `event`. |
| `scheduledFor`, `startedAt`, `finishedAt` | When it was due, when it started and when it ended. A queued run has no `startedAt` yet. |
| `payload`, `idempotencyKey` | The event that caused the run, as text, and the key it came with. |
| `status` | See below. |
| `error` | `code` and `message` when it failed. |
| `skipReason` | Why a run was skipped. |
| `instructions`, `modelProvider`, `modelName` | What was run, as it was when the run started, even if the automation was edited later. |

| Status | Meaning |
| --- | --- |
| `queued` | An event waiting for its turn. |
| `running` | In progress. |
| `completed` | The agent finished its task. |
| `paused` | The agent needs the user: it asked for the approval of a tool or an MCP server, or asked a question. The chat is waiting. When the user answers in the chat and it finishes, the run becomes `completed` or `failed`. |
| `failed` | It failed. `error` says why: the model did not answer in time, a guardrail blocked the instructions, the owner no longer exists, or the worker was lost. |
| `skipped` | It was not started and `skipReason` says why: a scheduled run was due but the previous one was still `paused`, an event found the queue full, or the automation was turned off or deleted while the event waited. It is recorded so you can notify the user. |

## The runner

The runner is a worker that checks what is due and the events that are waiting, and runs them. You create it once, with the agent that your automations should use, and start it in your backend.

```typescript
import { createAutomationRunner } from 'openloops/automations'
import { webSearchTool } from 'openloops/tools'
import { inputGuards } from 'openloops/guardrails'

const runner = createAutomationRunner({
    agent: {
        tools: [webSearchTool, sendEmailTool],
        guards: [inputGuards.blockCard],
        maxIterations: 30,
    },
    onRunFinished: async ({ automation, run, chat }) => {
        if (run.status === 'failed' || run.status === 'skipped') await notifyTheOwner(automation, run)
    },
})

runner.start()

process.on('SIGTERM', async () => {
    await runner.stop()
    process.exit(0)
})
```

| Option | Default | What it does |
| --- | --- | --- |
| `agent` | `{}` | The options of the `Agent` used for every run: tools, guards, `maxIterations`, `strictMode`, `identity`... It can be a function `({ automation, currentUser }) => options` when they depend on the automation or on the user. The loop is `AgiLoop` unless you set `loop`. A custom loop must support autonomous mode (`harness.executionMode`). |
| `intervalMs` | `60000` | How often it checks. Also set with `AUTOMATIONS_POLL_INTERVAL_MS`. `runner.wake()` makes it check now. |
| `leaseMs` | `600000` | How long an automation stays locked while it runs, renewed while the run lasts. Also set with `AUTOMATIONS_LEASE_MS`. |
| `maxConcurrentRuns` | `3` | How many runs a runner executes at once. |
| `stopTimeoutMs` | `30000` | How long `stop()` waits for the runs in progress. |
| `workerId` | generated | An identifier of the worker, kept in the run. |
| `onRunFinished` | none | Called with `{ automation, run, chat }` when a run ends, is paused or is skipped. An error in it does not affect the run. |

A new `Agent` is created for every run, so the options are the same but nothing is shared between runs.

### What every run does

- It runs as the owner of the automation, which must exist.
- It starts a new chat, in autonomous mode, with the model of the automation, and the instructions as the first message. The chat is recorded in the run as soon as it exists.
- It gives the agent the timezone of the automation, so the local time reaches the prompts.
- Guards of the agent apply to the instructions. If one blocks them, the run is `failed`.

### Internal MCP servers in an automation

An automation runs without the session of its owner, so there is no token of theirs to send to your [internal MCP servers](mcp-servers.md#internal-mcp-servers). For automations, the runner uses one token for the whole deployment, taken from `INTERNAL_MCP_TOKEN`. It replaces `{{token}}` in the headers of every internal server, and the runner also sends the id of the owner of the automation in the header `X-User-Id`, so your MCP server knows on whose behalf it acts.

- Your MCP server must accept `X-User-Id` only together with this service token. Never trust it on a request that carries the token of a user.
- The header is added only in automations and only to internal servers that use `{{token}}`. It replaces any `X-User-Id` you configured. It is never sent to the servers added by the user.
- Without `INTERNAL_MCP_TOKEN`, the internal servers that need a token are unavailable in the automations, and the run continues without them.
- The value is read with the secret manager, so it can be encrypted with the `ENC:` prefix.
- One variable serves all the internal servers. If two of them need different credentials, that is not supported yet.

### Running by hand

```typescript
const { run } = await runner.runNow({ automationId })
```

It starts the run at once and returns while it keeps running in the background. It does not change the next scheduled run. It is refused if the automation is already running. Any process that has a runner can call it, it does not need to be the one that called `start()`.

### Several instances

You can run the worker in as many pods as you want. An automation is taken with a single atomic update in the database that only one worker wins, and the same update moves `nextRunAt` to the next occurrence. So:

- An automation is never started twice at the same time.
- A run that fails, or whose worker dies, is **not repeated** until the next occurrence.
- If the backend was down, an automation that was due runs **once**, and the next run is counted from now.
- The lease expires if a worker dies. The run it left in progress is marked as `failed` and the automation keeps its schedule.

If you prefer, start the runner in a single deployment and call `runNow` from the others.

### Settling the runs that wait for the user

Someone answers a paused run in the chat, outside the runner. The runner checks the open runs on every pass and updates them from the state of their chat. If you want it faster, call `syncAutomationRun({ runId })` when your own events tell you that a chat ended.

## Indexes

The collections are `automations` and `automation_runs`. `ensureIndexes` from `openloops/db` creates the indexes of the queries of the runner and of the lists (see [configuration](configuration.md#indexes)). They are:

- `automations`: `{ enabled: 1, nextRunAt: 1 }` and `{ ownerId: 1, createdAt: -1 }`.
- `automation_runs`: `{ automationId: 1, createdAt: -1 }`, `{ ownerId: 1, createdAt: -1 }`, `{ status: 1, createdAt: 1 }` and a unique index on `{ automationId: 1, idempotencyKey: 1 }` for the runs that have a key, which makes the deduplication of events safe when two requests arrive together.
- `revoked_tokens`: a unique index on `jti` and a TTL index on `expiresAt`. It belongs to [authentication](authentication.md#revoked-tokens).

## Migrating from agentic jobs

Before 0.4.0 this module was called `agentic-jobs`. The old names are not kept as aliases, so the update has to be done in your code, in your environment and in your data. Follow these steps in order.

1. **Stop the runner of the old version.** A run that is in progress while its collection is renamed fails.
2. **Change the names in your code.**

    | Before | Now |
    | --- | --- |
    | `openloops/agentic-jobs` | `openloops/automations` |
    | `AgenticJob`, `AgenticJobRun` and every `...AgenticJob...` function, such as `createAgenticJob` or `createAgenticJobRunner` | the same name with `Automation`, such as `createAutomation` or `createAutomationRunner` |
    | `listAgenticJobRunsByJob({ jobId })` | `listAutomationRunsByAutomation({ automationId })` |
    | `jobId` in the runs, in your queries and in your screens | `automationId` |
    | `AGENTIC_JOBS_POLL_INTERVAL_MS`, `AGENTIC_JOBS_LEASE_MS` | `AUTOMATIONS_POLL_INTERVAL_MS`, `AUTOMATIONS_LEASE_MS` |

    The old variables are **not read anymore and nothing warns you**: if you had set them, the runner now uses the default values until you rename them.
3. **Change the shape of what you send and read.** `recurrence` and `timezone` are no longer fields of the automation, they live inside `trigger`.

    Before:

    ```typescript
    await createAutomation({
        payload: {
            name: 'Morning report',
            instructions: 'Summarize my open tickets',
            recurrence: { type: 'daily', time: '08:00' },
            timezone: 'America/Lima',
        },
        currentUser,
    })
    ```

    Now:

    ```typescript
    await createAutomation({
        payload: {
            name: 'Morning report',
            instructions: 'Summarize my open tickets',
            trigger: {
                type: 'schedule',
                recurrence: { type: 'daily', time: '08:00' },
                timezone: 'America/Lima',
            },
        },
        currentUser,
    })
    ```

    To change the recurrence or the timezone of an existing automation, send `trigger: { recurrence }` or `trigger: { timezone }`, only the one that changes. When you read an automation, its schedule is in `automation.trigger`.
4. **Migrate the data**, once per database. It renames the collections, moves `recurrence` and `timezone` into a `schedule` trigger, renames `jobId` to `automationId`, drops the old index and creates the new ones. It can be run again without changing anything, and it refuses to rename a collection if the new name already exists.

    ```typescript
    import { migrateAutomations } from 'openloops/db'

    const report = await migrateAutomations(db, { dryRun: true })
    ```

    With `dryRun` it only counts what it would change, so run it first. In a checkout of this repository you can run `yarn migrate:automations --dry-run` and `yarn migrate:automations`, which read `OPENLOOPS_DB_URI` and `OPENLOOPS_DB_NAME`.
5. **Start the runner of the new version.**

## Limits

How many automations a user can have, how often they can run and how much they can spend is not decided here. That belongs to the module of usage limits.
