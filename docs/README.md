# openloops documentation

Start with the [README](../README.md) for what `openloops` is and how to run it. These pages go deeper, grouped by what you are trying to do.

## Start here

| Page | What it covers |
| --- | --- |
| [Integration guide](integration-guide.md) | What to write in a backend: which endpoint calls what, the authorization you own and a security checklist. |

## Run an agent

| Page | What it covers |
| --- | --- |
| [The `Agent`](agent.md) | Options, running a turn, the result and its statuses, confirmations, autonomous mode, hooks and interruption. |
| [Configuration](configuration.md) | Environment variables, choosing the model and what is recorded. |
| [Automations](automations.md) | Tasks that the agent runs by itself on a schedule: recurrence, the history of runs and the runner that executes them. |
| [Chats](chats.md) | The chat record, its messages and their `source`, listing, reading and deleting chats. |

## Shape how the agent works

| Page | What it covers |
| --- | --- |
| [Building an `AgentLoop`](loops.md) | `AgiLoop`, the contract of a loop, `RunContext`, `Harness` and tasks. |
| [Skills](skills.md) | Writing and running LLM-backed reasoning steps and their call modes. |
| [Tools](tools.md) | Writing tools, validation, built-in tools and how MCP tools differ. |
| [Guardrails](guardrails.md) | Blocking input before the model sees it, ready-made guards and writing your own. |
| [The harness](harness.md) | The tool pipeline, native tools, the workspace, discovery, approvals, language and limits. |

## Connect to the outside world

| Page | What it covers |
| --- | --- |
| [MCP servers](mcp-servers.md) | Registering servers, the trust flow, approving and blocking, and how the agent uses them. |

## Users and cost

| Page | What it covers |
| --- | --- |
| [User management](users.md) | `CurrentUser`, creating, listing, updating and deleting users. |
| [Authentication](authentication.md) | Login and tokens. |
| [LLM usage tracking](usage.md) | Tokens and cost per chat or answer, and per-user statistics. |

## Examples

Runnable examples for every page live in [`examples/`](../examples), organized by domain.
