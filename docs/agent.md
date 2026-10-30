# The `Agent`

`Agent` is the entry point of the [harness](harness.md), and it drives an `AgentLoop`. It owns everything a loop shouldn't have to think about: loading and saving the chat, dispatching to the right node, running guardrails, resolving tools (native and MCP), asking for confirmation, handling interruption requests, and tracking usage.

```typescript
import { Agent } from 'openloops/core'
import { AgiLoop } from 'openloops/loops'
```

## Creating an agent

```typescript
const agent = new Agent({
    loop: new AgiLoop(),
    tools: [],
    guards: [],
    identity: {
        name: 'Sofi',
        gender: 'Female',
        role: 'Personal assistant and daily companion',
    },
    maxInputLength: 100_000,
    maxIterations: 50,
    strictMode: false,
})
```

| Option | Required | Default | What it does |
| --- | --- | --- | --- |
| `loop` | yes | none | An instance of a class extending `AgentLoop`. Use `AgiLoop` unless you wrote your own. See [loops](loops.md). |
| `tools` | no | `[]` | Extra native `Tool` instances. See [tools](tools.md). |
| `guards` | no | `[]` | Input guards that run before the model sees a message. See [guardrails](guardrails.md). |
| `identity` | no | none | Name, gender and role injected into every skill. |
| `maxInputLength` | no | `100000` | Longest message accepted, in characters. Longer messages are blocked by a built-in guard. |
| `maxIterations` | no | `50` | Hard limit of loop iterations in one run. When reached, the run fails with `AGENT_MAX_ITERATIONS_REACHED`. |
| `fallbackModel` | no | none | `{ provider, model }` used when neither the run, the chat nor the user chose a model. See [configuration](configuration.md#which-model-a-chat-uses). |
| `internalMcps` | no | none | MCP servers of your own solution that the user never registers. Also added with `agent.addInternalMcp(mcp)`. See [MCP servers](mcp-servers.md#internal-mcp-servers). |
| `strictMode` | no | `false` | When `true`, the user is always asked before the agent uses an MCP server whose tools changed after being approved. See [MCP servers](mcp-servers.md#how-the-agent-uses-the-servers). |

An `Agent` instance holds the state of the run it is executing, so run one conversation at a time per instance and create another instance for concurrent runs.

## Running a turn

```typescript
const result = await agent.run({
    input: {
        message: 'hi, how are you?',
        chatId: undefined,
    },
    options: {
        notifyOnCompletion: true,
        modelProvider: 'anthropic',
        modelName: 'claude-haiku-5-5',
    },
    currentUser,
    currentSession,
})
```

Omit `chatId` to start a brand-new chat. Pass an existing `chatId` to continue a conversation: `openloops` loads it, appends the new message, and resumes the loop exactly where it left off, including mid-confirmation or mid-question.

`options` are stored in the chat settings, so they stick for the following turns of that chat:

| Option | What it does |
| --- | --- |
| `modelProvider`, `modelName` | Model for this run, always together. It is saved in the chat and used by the next runs that do not send one. Without it, the model comes from the chat, the preference of the user and the fallbacks. See [configuration](configuration.md#which-model-a-chat-uses). |
| `loopName` | Name of the loop driving the chat. Set automatically from the loop. |
| `executionMode` | `interactive` (default) or `autonomous`. See [Autonomous mode](#autonomous-mode). |
| `notifyOnCompletion` | Exposed as `agent.notifyOnCompletion` so a post execution hook can notify the user. |
| `isPrivateSession` | Stored in the chat settings for your application to use. |

`currentSession` is optional. It carries device, location and locale, which skills use to answer in the right time zone and language.

`mcpTokens` is optional. It gives the token of the user to each [internal MCP server](mcp-servers.md#internal-mcp-servers), by name. It is never saved. `serviceToken` is the token that the runner of [agentic jobs](agentic-jobs.md#internal-mcp-servers-in-a-job) passes when there is no session of the user. You do not need it unless you write your own scheduler.

## Autonomous mode

An autonomous run is one where nobody is in the chat while the agent works, for example a scheduled task. Pass the mode in the run:

```typescript
await agent.run({
    input: { message: 'Every morning, summarize my open tickets' },
    options: { executionMode: 'autonomous' },
    currentUser,
})
```

`currentUser` is still required: it owns the chat and the MCP servers. What changes while a run is autonomous:

- The model is told that nobody is present, so it plans the whole task and writes a complete final answer.
- Questions the model sends with `ask_user` are answered by an automatic evaluator, a skill that only knows the context of the task. The model receives the answer marked as automatic and is told to use its judgment. The evaluator never grants permissions and says it cannot decide when the context does not settle the question. At most 3 questions per task are answered this way.
- Whatever needs the user (a destructive tool, an MCP server that was not approved or that changed in a way that needs review, a question the evaluator cannot answer) pauses the run. The chat stays in `awaiting_user_confirmation` or `awaiting_user_input` with the question as its last message. The user opens the chat and answers, and the task continues where it stopped.
- Small changes in an approved MCP server are still approved by the review skill, as in an interactive run. A server used for the first time, or any change with `strictMode: true`, always pauses the run.

The mode is saved in `chat.settings.executionMode` when the chat is created and is not changed later. Each run takes its mode only from its own `executionMode` option and is interactive when it is not given, so a user who continues an autonomous chat by hand is working interactively and the chat is still listed as autonomous. See [chats](chats.md#listing-a-users-chats).

- The first step of the loop, the one that answers conversation directly, is skipped: the task goes straight to the reasoning engine.
- Each question of the model and its automatic answer are saved in the chat history so the user can see them later, marked with `source` and excluded from the context of the model.

Only `AgiLoop` supports autonomous mode.

To run an agent on a schedule, see [agentic jobs](agentic-jobs.md).

## The result

`agent.run` does not throw for failures inside the run. It returns:

```typescript
const { data, error } = await agent.run({ input, currentUser })

data?.lastAnswer
data?.messages
data?.tasks
data?.state?.status
```

- `data` is the `Chat` after the turn, or `undefined` if the chat could not even be created.
- `error` is a message you can show to the user, present only when the run failed. The chat is marked as `failed` and saved.

`data.state.status` tells you where the conversation is:

| Status | Meaning |
| --- | --- |
| `idle` | The task finished and the agent is ready for a new request. |
| `processing` | A run is in progress. |
| `awaiting_user_input` | The agent asked a question. Send the answer as the next message. |
| `awaiting_user_confirmation` | The agent asked the user to approve an action. Send the answer as the next message. |
| `failed` | The run failed. `data.state.lastError` has the code and message. |

## Confirmations

When the loop is about to run a tool that is destructive, or a tool from an MCP server the user has not approved yet, the agent stops, asks the user in the chat and leaves the status as `awaiting_user_confirmation`. The user's next message is read by the `confirmation_gate` skill:

- A yes runs the pending actions. For an MCP server, the harness records the approval on behalf of the user.
- A no cancels the task. For an MCP server, it is blocked.
- An unclear answer makes the agent ask again.

You do not implement any of this. See [harness](harness.md#approvals).

## Identity

Pass `identity` once when constructing the `Agent` and it is injected into every skill's context. This is how you reskin an agent (name, personality framing) without touching a single line of loop or skill code.

## Tools

```typescript
agent.addTool(myCustomTool)
agent.tools
```

Tools you add are available for the whole run, next to the tools of the user's MCP servers. `agent.tools` also includes the MCP tools that have been loaded so far in the current run. See [tools](tools.md) and [MCP servers](mcp-servers.md).

## MCP servers

You never call anything MCP-related on `Agent`. At the start of a turn the agent looks up the user's registered servers and shows them to the model as an index (name, description, state). It connects to a server only when the model asks for its tools, checks that its manifest is the one the user approved, and disconnects every session at the end of the turn, including when the turn fails.

```typescript
agent.mcps
```

`agent.mcps` is the list of `McpServer` entities known during the current turn. See [MCP servers](mcp-servers.md).

## Guardrails

```typescript
import { inputGuards } from 'openloops/guardrails'

agent.addGuard(inputGuards.blockCard)
```

Guards run on the user message before any model call. See [guardrails](guardrails.md).

## Hooks

```typescript
agent.addHook('pre_execution', () => {
    // runs once, right before the loop starts
})

agent.addHook('post_execution', async () => {
    if (agent.notifyOnCompletion) {
        // send a push notification, etc.
    }
})
```

Hooks do not run when a guard blocks the message, because the loop never starts.

## Activity updates

```typescript
const stop = agent.onActivity(activity => {
    stream.write(`event: activity\ndata: ${JSON.stringify({ activity })}\n\n`)
})

await agent.run({ input: { chatId, message }, currentUser })

stop()
```

The listener receives every change of `state.currentActivity` while the run is in progress, and a last `stopped` when the run ends. It does not receive a value that repeats the previous one. With `AgiLoop` the value is a short sentence written by the model in the language of the conversation, such as `Buscando tus gastos de vuelos de agosto`, shown from the answer that asked for the actions until the next answer. When the model gives none, the generic ones appear: `Starting...`, `Analyzing requirement...`, `Thinking...` or `Running search...`. See [loops](loops.md#agiloop).

- The listener belongs to that `Agent` instance and to the chat of its current run. Nothing is shared between instances, so concurrent runs in the same process, even of different users, never hear each other. As always, create one `Agent` per run and do not share it between concurrent requests.
- It is called synchronously from the loop, so keep it fast and do not await inside it. An error thrown by a listener is logged and ignored, the run goes on and the other listeners still run.
- `onActivity` returns a function that removes the listener.
- When a listener is registered, a change of `currentActivity` alone is not written to the saved chat: the listener already delivered it, and the chat is written only when something else changes (a message, the status, the task) and when the run ends. Without a listener every change is still saved, so a client that polls the chat keeps seeing the activity.
- Past values are not replayed. If a client connects late or loses its connection, read `state.currentActivity` of the chat, which is saved with it.

## Stopping a running turn

```typescript
await Agent.interruptExecution(chatId, currentUser)
```

Call it from a separate request while `agent.run()` is still executing, for example when the user presses stop. The running loop checks for the request before every node and stops cleanly. The next message in that chat starts again from the initial node of the loop.

`agent.stopAgent()` stops the loop of the same instance from your own code.

## What gets stored

For every chat, `openloops` persists the chat and its messages, the tasks, every action (tool call) with its result, the traces of each node and skill, and the workspace items that hold large tool outputs and notes. Every LLM call is recorded with its cost, see [usage](usage.md).

## Error handling

If a turn fails for any reason, `Agent` marks the chat as failed, saves it, closes any open MCP session and returns the error in `result.error`. LLM failures such as rate limits, exhausted quota or a model that does not answer in time (`LLM_TIMEOUT`) carry a user-facing message and a retryable flag in `data.state.lastError`.
