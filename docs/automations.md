# Automations

An automation is a task that your agent runs by itself, on a schedule, without anyone in the chat. You describe what it must do and when, and `openloops` runs it in [autonomous mode](agent.md#autonomous-mode), in a new chat each time, and keeps a history of every run.

```typescript
import {
    createAutomation,
    updateAutomation,
    getAutomationById,
    listAutomationsByUser,
    deleteAutomation,
    previewAutomationRuns,
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
        recurrence: { type: 'weekly', days: [1, 2, 3, 4, 5], time: '08:00' },
        timezone: 'America/Lima',
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
| `recurrence` | yes | When it runs. See below. |
| `timezone` | yes | An IANA timezone. The local time of the recurrence and the days are those of this timezone, and daylight saving time is respected. |
| `enabled` | no | `true` by default. An automation that is off never runs, and can be turned on again. |
| `modelProvider`, `modelName` | no | The model of the automation, both or none. Without them, the default model of the owner is used, then the fallbacks. See [configuration](configuration.md#which-model-a-chat-uses). |

`nextRunAt` is calculated when the automation is created and it is what you show to the user. The fields that the system manages (`nextRunAt`, `lastRunAt`, `lastRunStatus`, `lockedBy`, `lockedUntil`, `activeRunId`) are ignored if they come in the payload.

### Recurrence

The recurrence is stored as a structured value, so a screen can offer simple choices and nobody has to write a cron expression. The time is the local time of the timezone of the automation, in 24 hours.

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
- **Changing the recurrence, the timezone or turning it on** calculates `nextRunAt` again from now.
- **A run that is in progress is not interrupted** by turning the automation off or by deleting it.
- **`__v`** in the payload works as in the other use cases: if the automation changed since it was read, the update fails with a `VersionConflictError`.
- **Deleting** is a soft delete. An admin can delete for good with `hardDelete: true`.
- **The system never turns an automation off by itself.** An automation that fails keeps trying on every occurrence, so watch the history.

## The history

Every execution is a run.

```typescript
const byJob = await listAutomationRunsByAutomation({ automationId, options: { page: 1, limit: 20 } })

const byUser = await listAutomationRunsByUser({ status: 'failed', currentUser })
```

| Field | Meaning |
| --- | --- |
| `automationId`, `chatId` | The automation and the chat of the run. Open the chat to read everything that the agent did. |
| `trigger` | `schedule` or `manual`. |
| `scheduledFor`, `startedAt`, `finishedAt` | When it was due, when it started and when it ended. |
| `status` | See below. |
| `error` | `code` and `message` when it failed. |
| `skipReason` | Why a run was skipped. |
| `instructions`, `modelProvider`, `modelName` | What was run, as it was when the run started, even if the automation was edited later. |

| Status | Meaning |
| --- | --- |
| `running` | In progress. |
| `completed` | The agent finished its task. |
| `paused` | The agent needs the user: it asked for the approval of a tool or an MCP server, or asked a question. The chat is waiting. When the user answers in the chat and it finishes, the run becomes `completed` or `failed`. |
| `failed` | It failed. `error` says why: the model did not answer in time, a guardrail blocked the instructions, the owner no longer exists, or the worker was lost. |
| `skipped` | It was due, but the previous run was still `paused`, so it was not started. It is recorded so you can notify the user. |

## The runner

The runner is a worker that checks what is due and runs it. You create it once, with the agent that your automations should use, and start it in your backend.

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
| `intervalMs` | `60000` | How often it checks. Also set with `AUTOMATIONS_POLL_INTERVAL_MS`. |
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
- `automation_runs`: `{ automationId: 1, createdAt: -1 }`, `{ ownerId: 1, createdAt: -1 }` and `{ status: 1, createdAt: 1 }`.

## Limits

How many automations a user can have, how often they can run and how much they can spend is not decided here. That belongs to the module of usage limits.
