# Integration guide

This page is for whoever builds the backend that uses `openloops`, a person or a coding agent. It tells you what to write. The other pages explain each piece in detail, and the [index](README.md) lists them.

## What the package is, and what it is not

`openloops` gives you a runtime for agents and a set of use cases that read and write MongoDB. It does **not** include an HTTP server, routes, controllers, sessions or authorization. Your backend owns those, and calls `openloops` from its own handlers.

Requirements: Node 22 or newer and a MongoDB database. Install it with `npm install openloops` or `yarn add openloops`, set the environment variables of [configuration](configuration.md), and import from the subpaths (`openloops/core`, `openloops/mcps`, and so on).

## Tell your coding agent where this is

A coding agent only finds this documentation if something points it here. Add this to the `CLAUDE.md` or `AGENTS.md` of your backend, once:

```
This project uses the `openloops` package. Before writing code that uses it, read
`node_modules/openloops/docs/integration-guide.md`. Its full documentation is in
`node_modules/openloops/docs` and its examples are in `node_modules/openloops/examples`.
The package has no controllers: the authorization of every endpoint is the responsibility of this backend.
```

## The rule that matters most: authorization is yours

The use cases trust the `currentUser` you pass and the ids you give them.

- Functions that list by user (`listChatsByUser`, `listMcpServersByUser`, `listAgenticJobsByUser`, `listAgenticJobRunsByUser`) only return records of that user.
- Functions that take an **id** (`getChatById`, `updateChat`, `deleteChat`, `getMcpServerById`, `updateMcpServer`, `deleteMcpServer`, `decideMcpServerTrust`, `getAgenticJobById`, `updateAgenticJob`, `deleteAgenticJob`, `listAgenticJobRunsByJob`, `runner.runNow`) **do not check who owns the record**.

So, before calling any of the second kind, load the record and check that `ownerId` is the user of the request. Do it in one place, a middleware or a helper, and never pass an id from a request straight to a use case.

Also note that `getChatById` returns `{}` in `data` when the chat does not exist, so check for `data._id`.

## Which endpoint calls what

| Your endpoint | `openloops` call |
| --- | --- |
| Send a message | `new Agent({ loop, tools, guards }).run({ input: { message, chatId? }, currentUser })` |
| Stop a running message | `Agent.interruptExecution(chatId, currentUser)` |
| List, read, delete chats | `listChatsByUser` (with `executionMode` to separate interactive from autonomous), `getChatById`, `deleteChat` |
| Poll the state of a chat | `getChatById({ id, select: { state: 1 } })` |
| Manage MCP servers | `createMcpServer`, `listMcpServersByUser`, `getMcpServerById`, `updateMcpServer`, `deleteMcpServer`, `verifyMcpServerConnection` |
| Approve or block an MCP server from a screen | `decideMcpServerTrust` |
| Usage of a chat or of an answer | `getLLMUsageByChat`, `getLLMUsageByMessage` |
| Usage statistics of a user | `getLLMUsageStats` |
| Create the schedule of an agent | `createAgenticJob`, `updateAgenticJob`, `listAgenticJobsByUser`, `getAgenticJobById`, `deleteAgenticJob`, `previewAgenticJobRuns` |
| History of scheduled runs | `listAgenticJobRunsByJob`, `listAgenticJobRunsByUser` |
| "Run now" | `runner.runNow({ jobId })` |
| Sign in, users | `login`, `createUser`, `getUserById`, `updateUser`, `deleteUser` |

## Running the agent for a message

```typescript
import { Agent } from 'openloops/core'
import { AgiLoop } from 'openloops/loops'
import { CurrentUser } from 'openloops/base'
import { inputGuards } from 'openloops/guardrails'

const currentUser = await CurrentUser.asyncFromDB(userIdFromYourAuth)

const agent = new Agent({
    loop: new AgiLoop(),
    tools: yourTools,
    guards: [inputGuards.blockCard],
})

const { data, error } = await agent.run({
    input: { message, chatId },
    currentUser,
})
```

- **Create an `Agent` for every run.** An instance keeps the state of the run it executes, so do not share one between requests that can overlap. Tools and guards are stateless and can be shared.
- **Choose the loop yourself.** There is no default. Use `AgiLoop`.
- **A run does not stream.** `agent.run` returns when the turn ends, which can take from seconds to minutes. Either give the request a long timeout, or start the run without waiting for it and let the client poll `getChatById` with `select: { state: 1 }` until the status stops being `processing`.
- **It does not throw for failures inside the run.** Read `error` and `data.state.status`. See [agent](agent.md#the-result).
- **Send the chat to your client with `data.toJSON()`**, after you have removed what the client must not see.

## What the client has to handle

Show `data.messages`, and look at `data.state.status`:

| Status | What your screen does |
| --- | --- |
| `idle` | Ready for a new message. |
| `processing` | A run is in progress. Show a loading state and offer to stop it. |
| `awaiting_user_input` | The agent asked a question. The answer is sent as a normal message in the same chat. |
| `awaiting_user_confirmation` | The agent needs an approval, for a destructive tool or for an MCP server. The question is the last message, and the answer is sent as a normal message in the same chat. |
| `failed` | Show `data.state.lastError.message` and let the user try again. |

Messages have a `source` (`user`, `model` or `harness`) and some have `excludeFromContext`. Messages with `source: 'harness'` are written by the system, for example a guardrail reply or an approval question, and you may want to style them differently. See [chats](chats.md).

## MCP servers

Your users register their own servers, and every server must be approved before the agent runs any of its tools. The approval normally happens in the chat. If you also want a screen, call `decideMcpServerTrust` with the hash of the manifest the user reviewed (`history[0].hash`). See [MCP servers](mcp-servers.md).

**Do not send `headers` or `history` of an MCP server to the client as they are.** `headers` hold credentials and `history` holds the full manifests. Mask the header values and send only what the screen needs, such as the name, `trust`, `status`, `lastError` and the hash of the latest manifest.

## Scheduled agents (agentic jobs)

Two parts, as described in [agentic jobs](agentic-jobs.md):

1. Endpoints that create and manage jobs and read their runs, from the table above.
2. A worker process that you start once, with the options of the agent your jobs should use:

```typescript
import { createAgenticJobRunner } from 'openloops/agentic-jobs'

const runner = createAgenticJobRunner({
    agent: { tools: yourTools, guards: yourGuards },
    onRunFinished: async ({ job, run }) => { /* notify the owner */ },
})

runner.start()
```

- It is safe to start the worker in several instances: a due job is taken by one of them.
- Stop it with `runner.stop()` when the process receives `SIGTERM`.
- Create the indexes listed in [agentic jobs](agentic-jobs.md#indexes).
- A job that needs the user (a destructive tool, an unapproved server, a question) pauses its run, and the user answers in the chat of that run. Show those runs, which you can list with `listAgenticJobRunsByUser({ status: 'paused' })`.

## Security checklist

- Check ownership before every call that takes an id.
- Mask `headers` and `history` of MCP servers.
- Add input guards for what your product must never receive, such as card numbers.
- Mark your own destructive tools with `destructive: true`. The agent asks for confirmation before running them. Do not rely on a tool being treated as destructive by default, because it is not.
- Use `strictMode: true` in the agent when the tools of an MCP server must be reviewed by the user on every change.
- Keep API keys and the secrets of [configuration](configuration.md) out of the code. Values can be stored encrypted with the `ENC:` prefix.
- Set limits on how many scheduled jobs and how often they run in your own layer, since `openloops` does not limit them yet.

## Common mistakes

- Sharing one `Agent` between concurrent requests.
- Waiting for `agent.run` inside a request with a short timeout.
- Passing `chatId`, `jobId` or `mcpServerId` from the client without checking the owner.
- Treating `error` as an exception that is thrown. It is returned.
- Forgetting that a run in `awaiting_user_confirmation` is waiting for the next message of the user, and that the next message is the answer.
- Starting the scheduled jobs worker without creating its indexes.
