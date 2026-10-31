# The harness

An agent is three things: a **model** that thinks, a **harness** that gives it hands, memory and rules, and a **loop** that decides what it is for. `openloops` is the harness, and it ships a loop. You can change the model or the loop and the harness stays the same.

The harness is everything between a loop and the outside world. A loop decides what to do. The harness makes sure it is done safely, remembers it and shows the result back to the model in a form it can use. You get all of this by using [`Agent`](agent.md) with any loop.

## The parts of the harness

| Part | What it does | Where it is explained |
| --- | --- | --- |
| **Transmission** | Takes the model to the outside world: the tools, found on demand and validated before they run. | [Tool pipeline](#tool-pipeline), [native tools](#native-tools), [tool discovery](#tool-discovery), [tools](tools.md), [MCP servers](mcp-servers.md) |
| **Brakes** | Stops the agent when it should stop: approvals, guardrails, timeouts and limits. | [Approvals](#approvals), [limits](#limits), [guardrails](guardrails.md), [timeouts](configuration.md#timeouts) |
| **Logbook** | Remembers and records: the workspace, the history of every task and the usage of every call. | [Workspace](#workspace), [observability](#observability), [chats](chats.md), [usage](usage.md) |
| **Steering** | Decides how the agent is driven: interactive or autonomous, scheduled, and with which model. | [Autonomous runs](#autonomous-runs), [language](#language), [the Agent](agent.md), [automations](automations.md) |

## Tool pipeline

Every action goes through the same pipeline before and after the tool runs:

| Step | What it does |
| --- | --- |
| Name resolution | Fixes a tool name written without its server prefix or with different case when there is only one match. |
| Approval | A destructive tool, or a tool of an MCP server the user has not approved, does not run until the user confirms. |
| References | Replaces `{{step_<ref>.output.<path>}}` and `{{context.<name>}}` placeholders in the arguments with real values. An unresolved reference fails the action with a clear message. |
| Validation | Checks the arguments against the tool's schema. |
| Grounding | Rejects identifiers (ids, uuids, hashes) that appear in the arguments but not in the user's messages nor in any previous result. Models invent ids, and this stops a made-up id from reaching a real system. The same check is applied to the final answer. |
| Duplicates | An identical call that already failed with a non transient error is blocked, so the model changes its approach instead of repeating it. |
| Execution | Runs the tool and records the output, the error and the timing. |
| Notes | Adds a short harness note to errors that say not found, validation failed or ambiguous match, telling the model what to do next. |
| Offloading | Large outputs are saved in the workspace and the model gets a stub it can read from. |

## Native tools

The model always has these tools, next to the ones you register:

| Tool | What it does |
| --- | --- |
| `search_tools` | Finds tools by keyword. With `server` it lists the tools of one MCP server. |
| `read_context` | Reads a workspace item. Supports a `path` into structured content, paging and `find` to locate an entry inside a large result without reading the whole list. |
| `save_context` | Keeps a note in the task workspace. It can be referenced later as `{{context.<name>}}`. |
| `ask_user` | Pauses the task to ask the user a question. The answer comes back as the result of the action. |
| `respond` | Delivers the final answer and ends the task. |

## Workspace

Tool outputs can be huge. When an output is longer than a few thousand characters it is saved in the workspace of the task. In the next cycle the model sees only a stub with its name, an outline of its shape and a preview, and loads what it needs with `read_context`. Outputs beyond a larger limit are never placed in the prompt at all. Notes the model saves with `save_context` live in the same place.

Workspace items belong to a chat and a task, so they survive between runs of the same conversation.

## Tool discovery

When your agent has more than 15 local tools, the model gets a summary per source instead of the full catalog and finds tools with `search_tools`. Tools found this way are declared from the next cycle on.

MCP tools are always discovered this way. The model sees an index of the user's servers and searches or lists them on demand. See [MCP servers](mcp-servers.md#how-the-agent-uses-the-servers).

## Approvals

Two things make an action wait for the user:

- The tool is destructive.
- The tool belongs to an MCP server that was never approved, or whose tools changed in a way that needs review.

The harness pauses the task, writes the question with a skill, stores the pending actions and leaves the chat as `awaiting_user_confirmation`. On the next message, a second skill reads the answer. When the user confirms, the pending actions run. When they decline, the task is cancelled. When the answer is unclear, the question is asked again.

Approving an MCP server through the chat records the decision on behalf of the user for that version of the server's manifest. If the server changes between the question and the answer, the approval is not applied and the user is asked again.

## Autonomous runs

When a run is autonomous (`executionMode: 'autonomous'`, see [agent](agent.md#autonomous-mode)) the harness stands in for the user in one place and refuses to in the rest:

- Questions the model asks with `ask_user` go to a small evaluator skill. It sees the goal, the message that created the task, what the agent learned and its latest results. It answers only when that context settles the question and never grants permissions. Its answer reaches the model with a note that it is automatic, it is not stored as something the user said and it does not count as a source for identifiers, so an id it invents is still rejected by the grounding check.
- Approvals are never given automatically beyond what an interactive run already does. When something needs the user, the task is paused in the chat and resumes when the user answers.

## Language

The reasoning engine reports in every turn the language in which it talks to the user, and the harness keeps it in `chat.state.language`. It is what every skill receives as `detected_language`. The model keeps the language of the conversation, changes it only when the user explicitly asks for another one, and ignores the language of pasted text, documents and tool results. A value that is not a two letter code is discarded and the previous language stays.

## Limits

| Limit | Value |
| --- | --- |
| Loop iterations per run | `maxIterations`, 50 by default |
| Reasoning turns per task (`AgiLoop`) | 20 |
| Automatic answers per autonomous task | 3 |
| Tool calls per task (`AgiLoop`) | 40 |
| Message length | `maxInputLength`, 100000 characters by default |

When a task hits a limit the agent answers with what it achieved and says what it could not do.

## Observability

Every node, skill and guard writes a trace with its reasoning. Every turn of a task records the model, mode, skill and loop versions, cost and number of blocks. Every action keeps its arguments, output and error. Together they answer why an agent did what it did.
