# Reporting errors

`openloops` does not choose a tool to report errors. You declare one function, once, and the package calls it every time it catches an error that would otherwise only be written in the log. What the function does is up to you: Sentry, Datadog, Slack, a file.

- [Declaring the reporter](#declaring-the-reporter)
- [What you do not have to do](#what-you-do-not-have-to-do)
- [A run that fails](#a-run-that-fails)
- [What the reporter receives](#what-the-reporter-receives)
- [What is reported and what is not](#what-is-reported-and-what-is-not)
- [Rules of the reporter](#rules-of-the-reporter)
- [Filtering and adding context](#filtering-and-adding-context)
- [Lambdas and other serverless deployments](#lambdas-and-other-serverless-deployments)
- [Tests](#tests)
- [Moving from `SENTRY_DSN`](#moving-from-sentry_dsn)

## Declaring the reporter

```typescript
import * as Sentry from '@sentry/node'
import { setErrorReporter } from 'openloops/common'

Sentry.init({ dsn: process.env.MY_SENTRY_DSN })

setErrorReporter((error, details) => {
    Sentry.withScope(scope => {
        scope.setTag('source', details.source)
        scope.setExtras(details)
        Sentry.captureException(error)
    })
})
```

**Declare it once.** Do it when the process starts, before the first request: at the top of the file that starts your server, or in a file of its own that your server imports first. That is all the setup there is.

- It is global to the process. Every `Agent`, every use case and the runner of the [automations](automations.md) that run in that process use it, with nothing to pass to them.
- Do not declare it inside a request, a use case or next to each `Agent`. It would work, but it would be a function replaced on every request for nothing.
- If you declare it twice, the second one replaces the first. There is only one reporter at a time.
- `setErrorReporter(undefined)` removes it. Without a reporter, the errors only go to the log, unless you still use the deprecated [`SENTRY_DSN`](#moving-from-sentry_dsn).
- A deployment with several processes (several servers, or lambdas) needs the declaration in each process. See [lambdas](#lambdas-and-other-serverless-deployments).

## What you do not have to do

After the declaration the rest of your code stays as it was. There is no option in the `Agent`, no wrapper around the use cases and no `try/catch` added only to report.

```typescript
import './error-reporting'
import { Agent } from 'openloops/core'
import { AgiLoop } from 'openloops/loops'

const agent = new Agent({ loop: new AgiLoop() })

const result = await agent.run({ input: { message: 'hi, how are you?' }, currentUser })
```

The first line is the file that declares the reporter. If this run fails, the reporter is called without anything else in this code. The [example](../examples/errors/error-reporting.ts) has the declaration at the top and the code that runs below it, in one file.

## A run that fails

Take a run whose provider rejects the API key. `agent.run` does not throw: it saves the chat as `failed`, returns the message for the user in `result.error` and calls the reporter. Your reporter receives something like this (the `code` depends on what the provider answers):

```typescript
error   // the LLMError, with the message of the provider
details // { source: 'agent', code: 'LLM_AUTH_FAILED', chatId: '6abc454162624f9e01929cd8', userId: '6ab56894eb20887d1ef7942c' }
```

The chat is saved before the reporter is called, so a slow reporter never delays that. A run that goes well never calls the reporter.

## What the reporter receives

The function has two parameters:

| Parameter | Meaning |
| --- | --- |
| `error` | The `Error` that was caught, or an `HttpError` if the code threw one. A text becomes an `Error`. |
| `details` | An object that tells where it happened. It always has `source`. The other fields appear when they exist. |

The fields of `details`:

| Field | Meaning |
| --- | --- |
| `source` | Where the error was caught: `agent`, `automations`, `mongo` or `openloops`. See the next table. |
| `code` | For a failure of the model, the code that is also saved in `state.lastError.code`, such as `LLM_RATE_LIMITED` or `LLM_CONTEXT_TOO_LONG`. See [error handling](agent.md#error-handling). |
| `chatId`, `userId` | The chat and the user of the run, when there is one. |
| `collection` | In `mongo`, the collection of the call that failed. |
| `stage` | Where in the process it failed, in `agent` and in `automations`. See the next table. |
| `guard` | In `agent`, the name of the guard that threw. |
| `automationId`, `runId` | In `automations`, the automation and the run. |
| `listener` | In `agent`, `activity` when a listener of `onActivity` threw. |

The values of `source`:

| `source` | What happened | Extra fields |
| --- | --- | --- |
| `agent` | A run failed, a listener of `onActivity` threw, a [guard](guardrails.md) threw, or the agent could not save the traces or the failed state of the chat. `stage` is `guard`, `traces` or `persist` in the last three, and it is missing when the run itself failed. | `chatId`, `userId`, `code` if the model failed, `stage`, `guard` and `listener` as they apply. |
| `automations` | The runner of the [automations](automations.md#the-runner) caught an error. `stage` is `sync` (checking the open runs), `tick` (looking for what is due), `run` (a run threw) or `onRunFinished` (your own callback threw). | `stage`, and `automationId` and `runId` in `run`. |
| `mongo` | A call to the database failed, or the connection did. | `collection` in a call. |
| `openloops` | Any other error that is reported without more detail. | |

## What is reported and what is not

The reporter gets what the package catches **by itself**: places where, if it did not report, nobody would ever know.

- **A failed run.** `agent.run` returns the error instead of throwing it, so without the reporter you would only see it if you read `result.error`.
- **A listener of `onActivity` that throws.** The run goes on, so the error would be lost.
- **A guard that throws.** The request is closed with a generic reply, so the real error would only be in the log.
- **Traces or the failed state that cannot be saved.** The run does not stop for them, so you would lose them without knowing.
- **The runner of the automations.** It runs in the background, with nobody waiting for an answer.
- **A failed call to the database.** The repository reports it and then throws it. You receive it in both places, see below.

What is not reported are the errors that the use cases throw, such as a missing resource (`404`), a conflict (`409`) or invalid data (`400`). Those reach the code that called the use case, and that code answers your client and decides whether it is worth reporting.

```typescript
try {
    await updateChat({ id, payload: { title }, currentUser })
} catch (error) {
    res.status(error.statusCode ?? 500).json({ message: error.errorMessage })
}
```

**A failure of the database arrives twice** if you report it in your own `catch` too: once from the repository, with `source: 'mongo'`, and once from your code. Choose one. The simplest is to report in the reporter only, and in your `catch` only answer your client.

## Rules of the reporter

- **It is awaited.** `openloops` waits for the function to finish, so an `async` reporter that sends the event to a service holds the caller until it ends. Keep it quick, or do not `await` the slow part if you do not need to.
- **It is protected.** An error thrown by the reporter, synchronous or not, is written in the log and ignored. A reporter that fails never breaks a run or a use case.
- **It receives only `error` and `details`.** The package does not pass the request, the messages of the user or the arguments of the tools.
- **It receives more than you may want.** Failures that are not a problem of yours, such as `LLM_RATE_LIMITED` or `LLM_QUOTA_EXCEEDED`, arrive too. Filter them, see the next section.

## Filtering and adding context

Because the reporter is a plain function, filtering is an `if`:

```typescript
setErrorReporter((error, details) => {
    if (details.code === 'LLM_RATE_LIMITED' || details.code === 'LLM_QUOTA_EXCEEDED') return
    if (details.source === 'automations' && details.stage === 'onRunFinished') return

    Sentry.withScope(scope => {
        scope.setTag('source', details.source)
        if (details.userId) scope.setUser({ id: details.userId })
        scope.setExtras(details)
        Sentry.captureException(error)
    })
})
```

Send `userId` and `chatId` if your privacy rules allow it: they are the way to find the chat that failed. `details` never carries the messages of the user or the arguments of the tools.

## Lambdas and other serverless deployments

Every function is its own process and does not share memory with the others. A declaration in one of them does not reach the rest, so each handler that uses `openloops` must run the declaration.

The simple way is a file of its own that declares the reporter, `error-reporting-lambda.ts`:

```typescript
import * as Sentry from '@sentry/node'
import { setErrorReporter } from 'openloops/common'

Sentry.init({ dsn: process.env.MY_SENTRY_DSN })

setErrorReporter(async (error, details) => {
    Sentry.withScope(scope => {
        scope.setTag('source', details.source)
        scope.setExtras(details)
        Sentry.captureException(error)
    })

    await Sentry.flush(2000)
})
```

Imported at the top of every handler:

```typescript
import './error-reporting-lambda'
import { listChatsByUser } from 'openloops/chats'

export const handler = async (event: any) => {
    const result = await listChatsByUser({ options: { page: 1, limit: 10 }, currentUser })

    return { statusCode: 200, body: JSON.stringify(result) }
}
```

- Importing the same file from many handlers is fine: it runs once in each process.
- Put the import in a module that every file that calls `openloops` already imports, if you have one (a helper that builds the current user, for example), and you will not forget it in a new handler.
- A lambda can be frozen as soon as the handler returns. Wait for your tool to send the event inside the reporter (with Sentry, `await Sentry.flush(2000)`), because `openloops` awaits the reporter and that keeps the handler alive until then.

## Tests

The reporter lives in the process, so a test that declares one must remove it:

```typescript
const reporter = jest.fn()

beforeEach(() => setErrorReporter(reporter))
afterEach(() => setErrorReporter(undefined))

it('reports a failed run', async () => {
    await agent.run({ input: { message: 'hi' }, currentUser })

    expect(reporter).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ source: 'agent' }))
})
```

## Moving from `SENTRY_DSN`

Reporting to Sentry with `SENTRY_DSN` still works, but it is deprecated and will be removed in a future version. Two things changed:

- `@sentry/node` is no longer installed with the package. It is an optional peer dependency, loaded only when `SENTRY_DSN` is set and no reporter is registered. If you rely on `SENTRY_DSN`, install it in your project: `yarn add @sentry/node`.
- The package no longer starts Sentry when it is imported. It starts it the first time it has an error to report, and it warns once in the log that this way is deprecated.

To move to the reporter:

1. Install `@sentry/node` in your project and call `Sentry.init` yourself.
2. Declare the reporter as shown [above](#declaring-the-reporter).
3. Remove `SENTRY_DSN` from the environment of `openloops`.

A registered reporter turns the old way off, so nothing is sent twice while you move. If your application already starts Sentry by itself, this also ends the second start that `openloops` made when `SENTRY_DSN` was set.
