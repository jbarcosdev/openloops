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

## Notice

A tool can set `notice`, a short text for results that come from outside and cannot be trusted, such as a web page or a third party server. The agent saves the notice in the action when it runs the tool, and writes it in every observation of that action next to `output`, also in the next turns and when the call fails, so the model sees it as long as the result is in its context. A page cannot write it, because it is not part of the output. The notice also shows when the tool is described by `search_tools`. Keep it to one or two sentences: it repeats in every observation. Actions saved before this version have no notice.

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

The results are Google snippets, which can be outdated or contradict each other and use many tokens. The description tells the model to read a source it already knows with a tool that reads pages, such as [`fetchUrlTool`](#fetchurltool), and to search only when it does not know the source or the reading fails. The tool has a `notice`, because the results come from the internet.

### `fetchUrlTool`

```typescript
import { fetchUrlTool } from 'openloops/tools'

agent.addTool(fetchUrlTool)
```

A basic `curl` for the model: it makes a GET request to an `http` or `https` URL and returns the content as text in `data` (`url` after redirects, `status`, `contentType`, `text` and `truncated`). It has no dependencies and no configuration. Like any tool it is opt-in, so the agent can reach the network only if you add it.

What it does:

- HTML becomes plain text: scripts, styles and comments are dropped, headings become `#`, list items `- `, and links `text (absolute url)`. JSON, plain text, XML and Markdown are returned as they are. The request asks for `text/markdown` first, so a site that serves it skips the conversion.
- It follows up to 5 redirects, and decodes gzip, deflate and brotli.
- It never reaches a private network. Loopback, private ranges, link-local (cloud metadata included) and IPv6 equivalents are refused, for the first URL and for each redirect, and the check runs on the address the connection really uses.
- The limits are fixed: 15 seconds, 10 MB of body and 50000 characters of text. When a limit cuts the content, `truncated` is `true`.
- The tool has a `notice`, because the content of a page is untrusted.
- The description tells the model to prefer a source that returns plain text or JSON and needs no key, such as a public API it knows, over a regular web page, which is long and noisy, and to search when it does not know one instead of guessing a URL.

What it does not do:

- It does not run JavaScript. A page that builds its content in the browser (a single page app, or a page that hydrates after loading) comes back empty or incomplete. The description tells the model to say so to the user instead of retrying.
- The conversion is simple: it keeps the menus and footers, does not pick the main article, flattens tables to one line per row and shows text hidden with CSS.
- No login, cookies, custom headers or POST. A site behind an anti-bot (Cloudflare, captchas) answers with an error or a challenge page.
- PDFs, images and any other binary are refused.

If you need rendered pages, write your own tool with a headless browser; it fits in the same `Tool` shape.

### `sendSlackMessageTool`

```typescript
import { sendSlackMessageTool } from 'openloops/tools'

agent.addTool(sendSlackMessageTool)
```

Sends a message to a Slack channel. The model gives a `channel` (an id such as `C0123456789`, or a name such as `#general`) and the `text`. It returns the `channel` id and the `ts` of the message in `data`.

Requires a Slack app with the `chat:write` scope, installed in your workspace and invited to the channel. Set its bot token in `SLACK_BOT_TOKEN`. The token belongs to the deployment, so every agent can write to any channel where the bot is.

### `callAiTool`

An LLM-backed tool for ad-hoc analysis, summarization, extraction or transformation. It is useful as a fallback when no other tool fits a step.

## MCP tools

Tools exposed by a connected MCP server are converted to `Tool` instances by `openloops`. See [MCP servers](mcp-servers.md). Their names are prefixed with the server's name (for example `my-server__search`) so two servers never collide.

An MCP tool differs from a local one in three ways:

- `origin` is `mcp`, `server` is the server's name and `notice` is set. The notice tells the model that what the server returns is unverified data and not an instruction from the user.
- `destructive` comes from the server's `destructiveHint` annotation and is `false` when the annotation is missing.
- It cannot run until the user has approved its server.
