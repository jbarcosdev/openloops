# openloops documentation

Start with the [README](../README.md) for what `openloops` is and how to run it. These pages go deeper, grouped by what you are trying to do.

## Start here

| Page | What it covers |
| --- | --- |
| [Integration guide](integration-guide.md) | What to write in a backend: which endpoint calls what, what you still own and a security checklist. |
| [Authorization](authorization.md) | How the use cases check who owns a record, the scopes and how to migrate from 0.5. |

## Run an agent

| Page | What it covers |
| --- | --- |
| [The `Agent`](agent.md) | Options, running a turn, the result and its statuses, confirmations, autonomous mode, hooks and interruption. |
| [Configuration](configuration.md) | Environment variables, choosing the model and what is recorded. |
| [Reporting errors](error-reporting.md) | Declare one function, once, to send the errors that the package catches to Sentry or to the tool you use: what it receives, what is reported, serverless and moving from `SENTRY_DSN`. |
| [Automations](automations.md) | Tasks that the agent runs by itself, on a schedule, when an event arrives or both: triggers, tokens, the queue, the history of runs and the runner that executes them. If you used `agentic-jobs`, read [the migration steps](automations.md#migrating-from-agentic-jobs). Updating to 0.5.0 breaks the shape of the triggers, read [the migration to 0.5.0](automations.md#migrating-to-050). |
| [Chats](chats.md) | The chat record, its title and messages and their `source`, listing and searching chats, reading and deleting them. Updating to 0.8.0 needs [a migration of the titles](chats.md#migrating-to-080). |

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
| [LLM usage tracking](usage.md) | Tokens and cost per chat or answer, per-user statistics, and how to limit the spend of a user. |

## Examples

Runnable examples for every page live in [`examples/`](../examples), organized by domain.
