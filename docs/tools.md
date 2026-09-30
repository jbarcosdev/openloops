# Tools

A `Tool` is a single capability your agent can call, such as searching the web, creating a record, or sending a message. Loops never care whether a tool is native to your code or came from a connected MCP server; both are the same `Tool` instance by the time a loop sees them.

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

`BaseParams` (`currentUser`, `sessionId`, `answerId`) is always merged into whatever arguments your handler receives. Destructure and ignore the ones you don't need.

`destructive: true` means the agent will ask the user to confirm before running it. Default it to `true` for anything that isn't obviously safe and read-only.

A `Tool` instance is stateless and shared. Never write to `this` inside a handler. Everything that varies between calls comes in through `params`.

## Registering a tool

```typescript
import { Agent } from 'openloops/core'

const agent = new Agent({ loop: new MyLoop() })
agent.addTool(greetUserTool)
```

## Built-in tools

### `webSearchTool`

```typescript
import { webSearchTool } from 'openloops/tools'

agent.addTool(webSearchTool)
```

Requires a [Serper](https://serper.dev) API key. Create a free one and set `SERPER_API_KEY` in your `.env`.

### `callAiTool`

An LLM-backed tool for ad-hoc analysis, summarization, extraction, or transformation, useful as a fallback when no other tool fits a step.

## MCP tools

Tools exposed by a connected MCP server are converted to `Tool` instances automatically by `openloops`. See [MCP servers](mcp-servers.md). Their names are namespaced by the server's own name (e.g. `my-server__search`) so two servers can never collide, even if they expose a tool with the same name.
