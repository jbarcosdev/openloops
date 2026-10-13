# Tools

A `Tool` is a single capability your agent can call, such as searching the web, creating a record, or sending a message. Loops never care whether a tool is native to your code or came from a connected MCP server; both are the same `Tool` class by the time a loop sees them.

```typescript
import { Tool, BaseParams } from 'openloops/tools'
```

## Writing a custom tool

```typescript
interface Params extends BaseParams {
    firstName: string
}

interface Output {
    data: { greeting: string }
}

export const greetUserTool = new Tool({
    name: 'greet_user',
    description: 'Greet the user',
    destructive: false,
    parameters: {
        type: 'object',
        properties: {
            firstName: { type: 'string', description: 'First name of the user' },
        },
        required: ['firstName'],
    },
    handler: async (params: Params): Promise<Output> => {
        const { currentUser, sessionId, answerId, firstName } = params
        return { data: { greeting: `Hi ${firstName}` } }
    },
})
```

| Prop | What it does |
| --- | --- |
| `name` | Letters, numbers, `_` and `-`, up to 64 characters. This is the name the model writes in an action. |
| `description` | What the tool does. Write it for the model. |
| `parameters` | JSON schema of the arguments. |
| `destructive` | `true` makes the agent ask the user to confirm before it runs. Defaults to `false`, so set it explicitly for anything that changes or deletes data. |
| `handler` | Receives the arguments plus `BaseParams` and returns `{ data }`. |

`BaseParams` (`currentUser`, `sessionId`, `answerId`) is always merged into the arguments your handler receives. Destructure and ignore the ones you don't need.

A `Tool` instance is shared. Never write to `this` inside a handler. Everything that varies between calls comes in through `params`.

## Argument validation

Arguments are validated against `parameters` before the handler runs: required arguments, types and `enum` values. An invalid call comes back to the model as a failed action with a message it can use to correct itself. Tools from MCP servers are validated strictly, so an argument that is not in the schema is rejected.

## Registering a tool

```typescript
import { Agent } from 'openloops/core'
import { AgiLoop } from 'openloops/loops'

const agent = new Agent({ loop: new AgiLoop() })
agent.addTool(greetUserTool)
```

When your agent has more than 15 local tools, the model no longer receives the whole catalog. It sees a summary per source and finds the tools it needs with the native `search_tools`. See [harness](harness.md#tool-discovery).

## Built-in tools

### `webSearchTool`

```typescript
import { webSearchTool } from 'openloops/tools'

agent.addTool(webSearchTool)
```

Requires a [Serper](https://serper.dev) API key. Set `SERPER_API_KEY` in your `.env`.

### `callAiTool`

An LLM-backed tool for ad-hoc analysis, summarization, extraction or transformation. It is useful as a fallback when no other tool fits a step.

## MCP tools

Tools exposed by a connected MCP server are converted to `Tool` instances by `openloops`. See [MCP servers](mcp-servers.md). Their names are prefixed with the server's name (for example `my-server__search`) so two servers never collide.

An MCP tool differs from a local one in three ways:

- `origin` is `mcp`, `server` is the server's name and `notice` is set. The notice tells the model that the description was written by a third party and is not an instruction from the user.
- `destructive` comes from the server's `destructiveHint` annotation and is `false` when the annotation is missing.
- It cannot run until the user has approved its server.
