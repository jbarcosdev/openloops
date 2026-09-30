# The `Agent` runtime

`Agent` is the runtime that drives an `AgentLoop`. It owns everything a loop shouldn't have to think about: loading and saving the chat, dispatching to the right node, resolving tools (native and MCP), handling interruption requests, and tracking usage.

```typescript
import { Agent } from 'openloops/core'
```

## Creating an agent

```typescript
const agent = new Agent({
    loop: new MyLoop(),
    tools: [],       // optional, additional native Tool instances
    identity: {      // optional, see "Identity" below
        name: 'Sofi',
        gender: 'Female',
        role: 'Personal assistant and daily companion',
    },
})
```

`loop` is the only required option. It must be an instance of a class extending `AgentLoop` (see [Building an `AgentLoop`](loops.md)).

## Running a turn

```typescript
const result = await agent.run({
    input: {
        message: 'hi, how are you?',
        chatId: undefined,   // optional, omit to start a new chat
        messageId: undefined,
    },
    options: {
        notifyOnCompletion: true,
        isPrivateSession: false,
        modelName: undefined,
        loopName: undefined,
    },
    currentUser,
    currentSession, // optional
})
```

Omit `chatId` to start a brand-new chat. Pass an existing `chatId` to continue a conversation: `openloops` loads it, appends the new message, and resumes the loop exactly where it left off, including mid-plan, mid-confirmation, or mid-clarification.

`result.data` is the full `Chat` instance after the turn finished. The most common thing you'll want from it:

```typescript
result.data.lastAnswer   // the assistant's latest reply, as a string
result.data.messages     // the full message history
result.data.tasks        // every task this chat has worked on, with its ledger of actions
```

## Identity

Pass `identity` once when constructing the `Agent`, and it's injected into every skill's context automatically. There's no need to hardcode a name, gender, or role inside any skill's prompt. This is how you reskin an agent (change its name, personality framing, etc.) without touching a single line of loop or skill code.

## Tools

```typescript
agent.addTool(myCustomTool)
agent.tools // Tool[] currently registered
```

Tools you add here are available to the loop for the entire turn, alongside anything auto-loaded from the user's connected MCP servers. See [Tools](tools.md) and [MCP servers](mcp-servers.md).

## MCP servers

You never call anything MCP-related directly on `Agent`. At the start of every turn, `openloops` looks up the current user's configured MCP servers, connects to each one, and converts their exposed tools into regular `Tool` instances. The loop never knows the difference. See [MCP servers](mcp-servers.md) for how a user registers one.

```typescript
agent.mcps // McpServer[] connected during this turn
```

Connections are closed automatically at the end of the turn, including if the turn throws.

## Hooks

```typescript
agent.addHook('pre_execution', () => {
    // runs once, right before the loop starts
})

agent.addHook('post_execution', async () => {
    // runs once, right after the loop finishes (success or failure)
    if (agent.notifyOnCompletion) {
        // send a push notification, etc.
    }
})
```

`agent.notifyOnCompletion` reflects whatever was passed in `options.notifyOnCompletion` for this turn.

## Interrupting a running turn

```typescript
import { Agent } from 'openloops/core'

await Agent.interruptExecution(chatId, currentUser)
```

This is designed to be called from a separate request while `agent.run()` is still executing elsewhere, for example when the user hits "stop" in your UI. The running loop checks for this request between every node and stops cleanly, resuming from the beginning of the current task the next time the user sends a message.

## Error handling

If a turn throws for any reason, `Agent` marks the chat as failed, saves it, and disconnects any open MCP sessions before the error propagates. You don't need a `try`/`finally` around `agent.run()` to avoid leaking connections. It's already handled.
