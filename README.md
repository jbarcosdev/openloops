# openloops

**Build production-grade enterprise agents in minutes, not days, weeks, or months.**

`openloops` is an open source **harness** for AI agents. An agent is three things: a **model** that thinks (the engine), a **harness** that gives it hands, memory and rules (the chassis), and a **loop** that decides what it is for (the body). `openloops` is the harness, and it ships the loop. Change the model, or the loop, and the rest stays the same.

<p align="center">
  <img src="https://raw.githubusercontent.com/jbarcosdev/openloops/main/docs/assets/harness-car.svg" alt="A car made of an engine (the AI model), a chassis (the harness) and a body (the loop). The body changes between a personal assistant, an analyst, customer support and a programmer, while the engine and the chassis stay the same." width="560">
</p>

```typescript
import { Agent } from 'openloops/core'
import { Logger } from 'openloops/common'
import { CurrentUser } from 'openloops/base'
import { AgiLoop } from 'openloops/loops'
import { webSearchTool } from 'openloops/tools'

const logger = new Logger()
const currentUser = await CurrentUser.asyncFromDB(userId)
const agent = new Agent({ loop: new AgiLoop() })

agent.addTool(webSearchTool) // needs SERPER_API_KEY, see "Web search" below

const result = await agent.run({
    input: { message: 'what is the current price of Bitcoin?' },
    currentUser,
})

logger.info(result.data.lastAnswer, '[Demo] Result')
```

That's it. The agent is persisted, resumable, and scoped to that one user, with tool execution, guardrails, and observability already wired in. No message table to design, no state machine to debug by hand, no MCP adapter to write.

## What the harness gives your agent

A model alone only chats. The harness is what lets it act, safely, for many users:

| Part | What it does | In `openloops` |
| --- | --- | --- |
| **Transmission** | Takes the model to the outside world | Your tools and MCP servers, found on demand and validated before they run. See [tools](docs/tools.md) and [MCP servers](docs/mcp-servers.md) |
| **Brakes** | Stops the agent when it should stop | Confirmation of destructive tools, approval of MCP servers, input guardrails, timeouts and a budget per task. See [guardrails](docs/guardrails.md) and [the harness](docs/harness.md) |
| **Logbook** | Remembers and records everything | Chats, tasks, every tool call, traces, and usage and cost per call. See [chats](docs/chats.md) and [usage](docs/usage.md) |
| **Steering** | Decides how the agent is driven | Interactive and autonomous runs, scheduled jobs, stopping a run, and the model per chat and per user. See [the Agent](docs/agent.md), [agentic jobs](docs/agentic-jobs.md) and [configuration](docs/configuration.md) |

## Why it is a good harness

Not adjectives, mechanisms that you can read in the code and in the tests:

- **It rejects what the model invents.** An identifier that is not in the messages of the user or in a previous result never reaches a real system, and the same check applies to the final answer.
- **It does not let the model loop.** An identical call that already completed or failed is blocked, so the agent changes its approach.
- **It keeps the prompt small.** Large tool outputs go to a workspace and the model reads them on demand.
- **It keeps the prompt stable**, so the provider's cache is used. With the default model, about 70% of the prompt tokens were read from the cache in the project's evals. See [configuration](docs/configuration.md#which-model-a-chat-uses).
- **Nobody changes what your agent does in silence.** An MCP server must be approved before its first tool runs, and a change in its tools is reviewed again.
- **A call that never answers does not block a run.** It is cancelled and repeated, and a tool call that may have changed something is never repeated by itself.
- **It is measured.** The `evals/` folder compares models, call modes and the prompts of the skills with the same cases.

## Building a backend with it

If you or your coding agent are going to build the backend that uses `openloops`, start with the [integration guide](docs/integration-guide.md). It lists which endpoint calls which use case, what authorization is left to you (the package has no HTTP layer), how to run agents and scheduled jobs, and a security checklist. The whole documentation is also shipped inside the package, in `node_modules/openloops/docs`, with an index for tools in [`docs/llms.txt`](docs/llms.txt).

To make sure that your coding agent reads it in every session, add this to the `CLAUDE.md` or `AGENTS.md` of your backend:

```
This project uses the `openloops` package. Before writing code that uses it, read
`node_modules/openloops/docs/integration-guide.md`. Its full documentation is in
`node_modules/openloops/docs` and its examples are in `node_modules/openloops/examples`.
The package has no controllers: the authorization of every endpoint is the responsibility of this backend.
```

## Pick a loop, or write your own

The logic that makes your agent *your* agent (how it reasons, when it asks for confirmation, whether it answers in one shot or works through a sequence of tools) lives in an `AgentLoop`. `openloops` ships `AgiLoop`, a reasoning loop that answers directly when it can and otherwise works in cycles of think, act and observe until it has a final answer. Any loop, yours or someone else's, is interchangeable.

Want a customer support agent?

```typescript
const agent = new Agent({ loop: new CustomerSupportLoop() })
```

Want a software development agent?

```typescript
const agent = new Agent({ loop: new CodeSpecialistLoop() })
```

A loop is a single file with a handful of node functions, so writing your own is a matter of an afternoon, not a sprint. See [Building an `AgentLoop`](docs/loops.md).

## Built for products, not for one person

If you've stood up [OpenClaw](https://github.com/openclaw/openclaw), [Hermes Agent](https://github.com/NousResearch/hermes-agent), or [ZeroClaw](https://github.com/zeroclaw-labs/zeroclaw), you already know how good a single, always-on personal agent can feel. You also know what happens the moment you try to make it serve more than one person: there's no clean boundary between "my agent" and "your agent." Conversations, memory, and connected tools were never designed to be scoped per user in the first place.

`openloops` starts from the opposite assumption. Every chat, every task, every piece of context, and every connected MCP server is scoped to a `currentUser` from the ground up, not bolted on later. Two users, same deployment, completely separate agents, with zero risk of one seeing the other's history or tools.

## If you've already tried LangGraph or CrewAI

You know the pattern: before you write a single line of what your agent actually *does*, you're declaring a graph, wiring a checkpointer, and figuring out how tool retries and error states are supposed to work. Weeks in, you have an agent that technically runs, and a mental model of *why* it does what it does that only lives in your head, because the framework itself is a black box the moment something goes wrong in production.

`openloops` gives you one file to read to understand your agent's behavior: the loop itself. Persistence and tracing aren't something you configure. They're just already there. See the full comparison further down.

## What you get out of the box

- **Multi-user by design.** Chat history, task state, and MCP server configuration are all scoped per user, so the same deployment safely serves every one of your customers.
- **Zero-boilerplate persistence.** Messages, tasks, and every tool call your agent makes are saved automatically to MongoDB, and a conversation resumes exactly where it stopped, including in the middle of a confirmation or a question. You never write a `save()` call.
- **Safe tool execution.** Arguments are validated against the tool's schema, destructive tools wait for the user's confirmation, identical failing calls are blocked, identifiers the model invented are rejected before they reach a real system, and large outputs are kept out of the prompt. LLM calls retry with backoff and wait out rate limits.
- **Native MCP support with a trust flow.** Connect any MCP server and its tools become regular tools. Each server must be approved by the user before its first tool runs, and a server that changes its tools is reviewed again, so a third party cannot quietly change what your agent does.
- **Autonomous runs.** The same agent can work without a person in the chat, for scheduled tasks. Whatever needs the user pauses the run in the chat, and the user answers there to continue. See [autonomous mode](docs/agent.md#autonomous-mode).
- **Agentic jobs.** Schedule tasks that the agent runs by itself, daily, weekly, monthly or once, in the timezone of the user. A worker runs what is due, safely across several instances, and keeps a history of every run with its chat. See [agentic jobs](docs/agentic-jobs.md).
- **Guardrails.** Input guards block messages with card numbers, emails, code or anything you define, before the model sees them. See [guardrails](docs/guardrails.md).
- **Usage and cost tracking.** Every LLM call is recorded. Get the tokens and cost of a chat or an answer, and per-user statistics by model and by period. See [usage](docs/usage.md).
- **Users and authentication included.** User management and login with tokens, so you don't need a parallel system just to have an identity to hand the `Agent`.
- **Any LLM provider, including local ones.** Built on [`@earendil-works/pi-ai`](https://www.npmjs.com/package/@earendil-works/pi-ai), so OpenAI, Anthropic, Google, and self-hosted models (e.g. via Ollama) all work the same way, chosen per chat.
- **Observability without ceremony.** Sentry and Langfuse are built in. Set the environment variables and they turn on, no SDK wiring required. Every node, skill and guard also writes a trace you can read back.

On the roadmap: **sub-agent orchestration**, where an agent launches and coordinates other agents to split up a problem. A guide will come with it.

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

The next time that user talks to *any* agent, the server is there. The first time one of its tools is about to run, the agent asks the user to approve it.

An MCP server of your own solution, one the user never sees, is declared in code with `internalMcps` and called with the token of the user in each run. See [MCP servers](docs/mcp-servers.md#internal-mcp-servers).

Blocking sensitive input:

```typescript
import { inputGuards } from 'openloops/guardrails'

agent.addGuard(inputGuards.blockCard)
agent.addGuard(inputGuards.blockEmail)
```

## How it compares to other frameworks

This is a comparison against the self-hosted, open-source versions of LangGraph and CrewAI, not their paid managed offerings, which do handle persistence and infrastructure for you the same way `openloops` does, at a cost. The columns for the other frameworks reflect their public documentation at the time of writing, so check their current docs before you decide.

| | `openloops` | LangGraph (self-hosted OSS) | CrewAI (self-hosted OSS) |
|---|---|---|---|
| Persistence | Built in, zero config (MongoDB) | You choose and configure a checkpointer: in-memory, SQLite or Postgres, the last two in separate packages | Memory is opt-in and stored as local files (ChromaDB and SQLite, or LanceDB in newer versions), tied to the machine |
| Multi-user scoping | Built in: chats, tasks, context, and MCP servers are per-user from the start | Conversations are scoped by a `thread_id`. Mapping them to users, and scoping memory and tools per user, is up to you | Not a concept of the framework, you build it |
| Tool execution & retries | Validation, confirmation of destructive tools, duplicate and invented-id protection, and LLM and MCP connection retries are built into the harness. A failed step goes back to the model, which decides how to continue | Per-node `RetryPolicy` and error handling that you configure | Retry limits are configured per agent or task |
| MCP support | Native: servers are a per-user record, tools load on demand, and every server goes through an approval flow | A separate package (`langchain-mcp-adapters`) with a client that you wire into the graph | Native `mcps` field on agents, or `MCPServerAdapter`. Servers are declared in code, not loaded per user |
| User management | Included (`openloops/users`, `openloops/authentication`) | Not included, you build your own | Not included, you build your own |
| LLM usage/cost tracking | Included (`openloops/llmcalls`): per answer, per chat, and per-user statistics | Not included in OSS, available via paid LangSmith | Third-party integrations such as OpenLIT report token usage and cost |
| Observability | Sentry + Langfuse, enabled via env vars, plus traces stored per chat | Your own tracing setup, or paid LangSmith | Third-party integrations (Langfuse, OpenLIT, Arize Phoenix, Opik, Weave) that you set up |
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

# Default model provider (anthropic, claude-haiku-5-5)
ANTHROPIC_API_KEY=

# Other providers, only if you choose them per chat
OPENAI_API_KEY=
GEMINI_API_KEY=

# Required for login
JWT_SECRET=

# Optional, see docs/configuration.md
LLM_FALLBACK_PROVIDER=
LLM_FALLBACK_MODEL=

# Optional, in milliseconds
AGENTIC_JOBS_POLL_INTERVAL_MS=
AGENTIC_JOBS_LEASE_MS=
LLM_CALL_TIMEOUT_MS=
MCP_TOOL_TIMEOUT_MS=

# Optional, most MongoDB connections per process (default 3)
OPENLOOPS_MONGO_MAX_POOL_SIZE=

# Optional, see "Observability" below
SENTRY_DSN=
LANGFUSE_SECRET_KEY=
LANGFUSE_PUBLIC_KEY=
LANGFUSE_BASE_URL=

# Optional, see "Web search" and "Slack" below
SERPER_API_KEY=
SLACK_BOT_TOKEN=
```

Every variable is described in [`docs/configuration.md`](docs/configuration.md).

### Database

By default, `openloops` uses a database named `openloops` if `OPENLOOPS_DB_NAME` isn't set. You can point it at an existing database instead, but if that database already has other collections, we recommend using a **separate database** to avoid name collisions with your own collections. If you're starting a project from scratch, using a single unified database for everything (your app's data and `openloops`'s data together) is fine and often simpler.

### Web search

The built-in `webSearchTool` uses [Serper](https://serper.dev). Create a free API key there and set `SERPER_API_KEY` in your `.env`. See [`docs/tools.md`](docs/tools.md).

### Slack

The built-in `sendSlackMessageTool` posts a message to a channel. Create a Slack app with the `chat:write` scope, install it in your workspace, invite the bot to the channel and set `SLACK_BOT_TOKEN` in your `.env`. See [`docs/tools.md`](docs/tools.md).

### Observability

- **Sentry**: set `SENTRY_DSN` and error tracking turns on automatically.
- **Langfuse**: set `LANGFUSE_SECRET_KEY`, `LANGFUSE_PUBLIC_KEY`, and `LANGFUSE_BASE_URL` and every LLM call is traced automatically.

Neither requires any code changes. They're opt-in purely through environment variables.

## More examples

Every pattern above, and a lot more, lives as a runnable example in [`examples/`](examples), organized by domain: `run-agent`, `loops`, `tools`, `guardrails`, `agentic-jobs`, `mcps`, `chats`, `usage`, `users`, and `authentication`.

## Package structure

`openloops` is a single package with organized subpath exports, so you only pull in what you use:

| Subpath | What's in it |
|---|---|
| `openloops/core` | `Agent`, `AgentLoop`, `RunContext`, `Harness`: the harness |
| `openloops/loops` | Built-in loops (`AgiLoop`) and the skills shared by loops |
| `openloops/tools` | `Tool`, `BaseParams`, and built-in tools |
| `openloops/skills` | `Skill`, for writing LLM-backed reasoning steps inside a loop |
| `openloops/guardrails` | `Guard` and the ready-made input guards |
| `openloops/mcps` | MCP server management, connection check and trust decisions |
| `openloops/agentic-jobs` | Scheduled tasks, their runs and the runner that executes them |
| `openloops/chats` | Chats and their messages: list, read, update, delete |
| `openloops/users` | User management |
| `openloops/authentication` | Login and token issuing |
| `openloops/llmcalls` | LLM usage and cost tracking |
| `openloops/base` | `CurrentUser`, `CurrentSession` |
| `openloops/common` | `Logger` and shared utilities |
| `openloops/clients` | `LLMClient` and the HTTP clients used by built-in tools (e.g. Serper) |

## Learn more

- [Integration guide](docs/integration-guide.md)
- [Documentation index](docs/README.md)
- [The `Agent`](docs/agent.md)
- [Building an `AgentLoop`](docs/loops.md)
- [How the harness works](docs/harness.md)
- [Tools](docs/tools.md)
- [Skills](docs/skills.md)
- [Guardrails](docs/guardrails.md)
- [MCP servers](docs/mcp-servers.md)
- [Agentic jobs](docs/agentic-jobs.md)
- [Chats](docs/chats.md)
- [User management](docs/users.md)
- [Authentication](docs/authentication.md)
- [LLM usage tracking](docs/usage.md)
- [Configuration](docs/configuration.md)

## License

Apache-2.0, free and open source, including for commercial and enterprise use.

Questions? Reach out at jose@openloops.xyz.
