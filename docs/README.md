# openloops

**Build production-grade enterprise agents in minutes, not days, weeks, or months.**

```typescript
import { Agent } from 'openloops/core'
import { Logger } from 'openloops/common'
import { CurrentUser } from 'openloops/base'
import { PlanExecuteLoop } from 'openloops/loops'

const logger = new Logger()
const currentUser = await CurrentUser.asyncFromDB(userId)
const agent = new Agent({ loop: new PlanExecuteLoop() })

const result = await agent.run({
    input: { message: 'what is the current price of Bitcoin?' },
    currentUser,
})

logger.info(result.data.lastAnswer, '[Demo] Result')
```

That's it. The agent is persisted, resumable, and scoped to that one user, with tool execution, retries, and observability already wired in. No message table to design, no state machine to debug by hand, no MCP adapter to write.

## Pick a loop, or write your own

The logic that makes your agent *your* agent (how it plans, when it asks for confirmation, whether it answers in one shot or works through a sequence of tools) lives in an `AgentLoop`. `openloops` ships `PlanExecuteLoop` today, and it's built so any loop, yours or someone else's, is interchangeable.

Want a customer support agent?

```typescript
const agent = new Agent({ loop: new CustomerSupportLoop() })
```

Want a software development agent?

```typescript
const agent = new Agent({ loop: new CodeSpecialistLoop() })
```

Want a reasoning agent for deep analysis?

```typescript
const agent = new Agent({ loop: new ReactLoop() })
```

Don't see what you need in the marketplace? Build it yourself. A loop is a single file with a handful of node functions. Most people have their first working loop in an afternoon, not a sprint. See [Building an `AgentLoop`](docs/loops.md).

**Launching this week at [openloops.xyz/marketplace](https://openloops.xyz/marketplace):** a growing library of free, community-maintained loops, including `ReactLoop`, `CodeSpecialistLoop`, `CustomerSupportLoop`, and more on the way for domains like cybersecurity and finance. Building an agent for a new use case becomes a matter of picking the right loop, not writing a new framework underneath it every time.

## Built for products, not for one person

If you've stood up [OpenClaw](https://github.com/openclaw/openclaw), [Hermes Agent](https://github.com/NousResearch/hermes-agent), or [ZeroClaw](https://github.com/zeroclaw-labs/zeroclaw), you already know how good a single, always-on personal agent can feel. You also know what happens the moment you try to make it serve more than one person: there's no clean boundary between "my agent" and "your agent." Conversations, memory, and connected tools were never designed to be scoped per user in the first place.

`openloops` starts from the opposite assumption. Every chat, every task, every piece of context, and every connected MCP server is scoped to a `currentUser` from the ground up, not bolted on later. Two users, same deployment, completely separate agents, with zero risk of one seeing the other's history or tools.

## If you've already tried LangGraph or CrewAI

You know the pattern: before you write a single line of what your agent actually *does*, you're declaring a graph, wiring a checkpointer, and figuring out how tool retries and error states are supposed to work. Weeks in, you have an agent that technically runs, and a mental model of *why* it does what it does that only lives in your head, because the framework itself is a black box the moment something goes wrong in production.

`openloops` gives you one file to read to understand your agent's behavior: the loop itself. Persistence, retries, and tracing aren't something you configure. They're just already there. See the full comparison against LangGraph further down.

## What you get out of the box

- **Multi-user by design.** Chat history, task state, and MCP server configuration are all scoped per user, so the same deployment safely serves every one of your customers.
- **Zero-boilerplate persistence.** Messages, tasks, and every tool call your agent makes are saved automatically to MongoDB. You never write a `save()` call.
- **Production-grade tool execution.** Retries on failed steps, confirmation prompts before destructive actions, and graceful resume after a crash are all built into the runtime.
- **Native MCP support.** Connect any MCP server and its tools become regular tools instantly. No adapter package, no manual schema mapping.
- **Sub-agent orchestration.** An agent can launch and coordinate other agents to split up a problem. Full guide coming soon.
- **Any LLM provider, including local ones.** Built on [`@earendil-works/pi-ai`](https://www.npmjs.com/package/@earendil-works/pi-ai), so OpenAI, Anthropic, and self-hosted models (e.g. via Ollama) all work the same way.
- **Observability without ceremony.** Sentry and Langfuse are built in. Set the environment variables and they turn on, no SDK wiring required.
- **A loop marketplace.** Don't write a customer-support agent from scratch. Install one.

## See how little code this actually takes

Adding a custom tool:

```typescript
import { Tool, BaseParams } from 'openloops/tools'

export const greetUserTool = new Tool({
    name: 'greet_user',
    description: 'Greet the user',
    destructive: false,
    parameters: {
        type: 'object',
        properties: { firstName: { type: 'string', description: 'First name of the user' } },
        required: ['firstName'],
    },
    handler: async (params: BaseParams & { firstName: string }) => {
        return { data: { greeting: `Hi ${params.firstName}` } }
    },
})

agent.addTool(greetUserTool)
```

Connecting an MCP server for a user takes no code, just a record:

```typescript
import { createMcpServer } from 'openloops/mcps'

await createMcpServer({
    payload: { name: 'my-mcp', type: 'http', url: 'https://example.dev/api/mcp' },
    currentUser,
})
```

The next time that user talks to *any* agent, its tools are already there.

## How it compares to other frameworks

This is an honest comparison against the self-hosted, open-source versions of LangGraph and CrewAI, not their paid managed offerings, which do handle persistence and infrastructure for you the same way `openloops` does, at a cost.

| | `openloops` | LangGraph (self-hosted OSS) | CrewAI (self-hosted OSS) |
|---|---|---|---|
| Persistence | Built in, zero config (MongoDB) | Requires configuring a checkpointer (e.g. Postgres) yourself | Local memory (ChromaDB + SQLite) by default, machine-bound and scoped to a single run |
| Multi-user scoping | Built in: chats, context, and MCP servers are per-user from the start | Not a concept of the framework, you build it | Not natively supported by default |
| Tool execution & retries | Built into the runtime | You write the retry/error-handling logic | Configured per task, not automatic |
| MCP support | Native: MCP tools become `Tool` instances automatically | Requires a separate adapter package and manual wiring | Available through a separate tools integration, not automatic per-user loading |
| User management | Included (`openloops/users`) | Not included, you build your own | Not included |
| LLM usage/cost tracking | Included (`openloops/llmcalls`) | Not included in OSS, available via paid LangSmith | Not included as a first-class module |
| Observability | Sentry + Langfuse, enabled via env vars | Requires your own tracing setup, or paid LangSmith | Requires a third-party tracing integration |
| Pre-built agents | Growing marketplace of ready-to-use loops | You build every agent from primitives | No built-in agent marketplace |
| What you write | Node functions (plain async functions) | Nodes and the graph's edges, explicitly | Agents, tasks, and crew orchestration, declared per role |
| Mental model | A state machine your loop drives itself | A graph you declare and compile ahead of time | A crew of role-based agents coordinated for you |

Neither approach is "wrong." LangGraph's explicit graph declaration is a deliberate design choice that gives you visual tooling (LangGraph Studio) and fine-grained control over parallel execution, and CrewAI's role-based model is a natural fit for problems that map cleanly onto a team of specialists. `openloops` trades some of that explicitness for a much shorter path from "I have an idea for an agent" to "it's running in production, for all my users."

## Quick start (local)

```bash
npm install openloops
# or
yarn add openloops
```

Spin up a local MongoDB with the included `docker-compose.yml`:

```bash
docker compose up -d
```

Create a `.env` file:

```bash
IS_LOCAL=true
NODE_ENV=development

OPENLOOPS_DB_URI="mongodb://localhost:27017/"
OPENLOOPS_DB_NAME='openloops'

SECRET_MANAGER_KEY=secret

OPENAI_API_KEY=

# Optional, see "Observability" below
SENTRY_DSN=
LANGFUSE_SECRET_KEY=
LANGFUSE_PUBLIC_KEY=
LANGFUSE_BASE_URL=

# Optional, see "Web search" below
SERPER_API_KEY=
```

### Database

By default, `openloops` creates a database named `openloops` if `OPENLOOPS_DB_NAME` isn't set. You can point it at an existing database instead, but if that database already has other collections, we recommend using a **separate database** to avoid name collisions with your own collections. If you're starting a project from scratch, using a single unified database for everything (your app's data and `openloops`'s data together) is fine and often simpler.

### Web search

The built-in `webSearchTool` uses [Serper](https://serper.dev). Create a free API key there and set `SERPER_API_KEY` in your `.env`. See [`docs/tools.md`](docs/tools.md).

### Observability

- **Sentry**: set `SENTRY_DSN` and error tracking turns on automatically.
- **Langfuse**: set `LANGFUSE_SECRET_KEY`, `LANGFUSE_PUBLIC_KEY`, and `LANGFUSE_BASE_URL` and every LLM call is traced automatically.

Neither requires any code changes. They're opt-in purely through environment variables.

## More examples

Every pattern above, and a lot more, lives as a runnable example in [`examples/`](examples), organized by domain: `users`, `chats`, `run-agent`, `mcps`, `usage`.

## Package structure

`openloops` is a single package with organized subpath exports, so you only pull in what you use:

| Subpath | What's in it |
|---|---|
| `openloops/core` | `Agent`, `AgentLoop`, `RunContext`: the runtime |
| `openloops/loops` | Built-in loops, starting with `PlanExecuteLoop` |
| `openloops/tools` | `Tool`, `BaseParams`, and built-in tools |
| `openloops/skills` | `Skill`, for writing LLM-backed reasoning steps inside a loop |
| `openloops/mcps` | MCP server CRUD and connection handling |
| `openloops/users` | User management |
| `openloops/llmcalls` | LLM usage/cost tracking |
| `openloops/base` | `CurrentUser`, `CurrentSession` |
| `openloops/common` | `Logger` and shared utilities |
| `openloops/clients` | HTTP clients used by built-in tools (e.g. Serper) |
| `openloops/authentication` | Authentication utilities |
| `openloops/chats` | Chat/conversation persistence internals |

## Learn more

- [Building an `AgentLoop`](docs/loops.md)
- [The `Agent` runtime](docs/agent.md)
- [Tools](docs/tools.md)
- [Skills](docs/skills.md)
- [MCP servers](docs/mcp-servers.md)
- [User management](docs/users.md)
- [LLM usage tracking](docs/usage.md)

## License

Apache-2.0, free and open source, including for commercial and enterprise use.

Questions? Reach out at jose@openloops.xyz.
