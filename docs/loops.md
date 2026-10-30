# Building an `AgentLoop`

An `AgentLoop` decides how your agent thinks and acts: when it answers directly, when it uses tools, when it asks the user. `openloops` ships `AgiLoop`, which is the one to use for general agents, and you can write your own for anything else.

```typescript
import { AgentLoop, AgentStatus, Harness, RunContext } from 'openloops/core'
import { AgiLoop } from 'openloops/loops'
```

## `AgiLoop`

`AgiLoop` is a reasoning loop. It answers directly when it can, and otherwise works in cycles of think, act and observe until it can give a final answer.

| Node | What it does |
| --- | --- |
| `fast_responder` | Initial node. Answers directly when no tools or memory are needed, and when it cannot, says in one sentence what the agent will do. It is skipped in an autonomous run. |
| `reasoning_engine` | Reads the situation or the results of the last actions, rewrites its working state, decides the next actions, reports the language of the conversation and says in one sentence what is happening until its next answer. |
| `action_engine` | Runs the actions the reasoning engine asked for, asks the user for confirmation when needed, delivers the final answer. |

The sentences of both nodes become `state.currentActivity`, written in the language of the conversation, so a client can show what the agent is doing instead of a generic `Thinking...`. They are optional: when a node leaves it out or writes something unusable (not a text, empty, `running`, `stopped`), the loop shows the generic activity of that moment. The text is cleaned of markup and line breaks and cut at 80 characters, and each one is kept in the turn that produced it (`turns[].activity`) to audit what the user saw.

The loop works within a budget per task (20 reasoning turns and 40 tool calls) and stops with an honest answer when the model repeats itself, keeps only reading notes, or runs out of budget. It also rejects final answers that cite identifiers that never appeared in a result or in the user's words.

```typescript
const agent = new Agent({ loop: new AgiLoop() })
```

## The contract

```typescript
export class MyLoop extends AgentLoop {
    get initialNode () {
        return this.nodes.respond
    }

    get nodes () {
        return {
            respond: this.respond,
        }
    }

    get name () {
        return 'my-loop'
    }

    get version () {
        return '1.0.0'
    }

    get author () {
        return { name: 'You', email: 'you@example.com', website: 'https://example.com' }
    }

    private async respond (ctx: RunContext, harness: Harness): Promise<void> {
        harness.reply('Hello!')
        ctx.chat.state?.setStatus(AgentStatus.IDLE)
    }
}
```

- `nodes` is a getter, so it can reference node methods declared later in the class.
- `initialNode` is where a new task starts. Return a direct reference such as `this.nodes.respond` so a typo is caught by TypeScript.
- `name` is stored on the chat so `openloops` knows which loop drives it. Bump `version` every time the loop or its prompts change; it is recorded in the metadata of every turn.
- A node decides what runs next with `harness.setNextNode(...)`. The loop stops when a node leaves the status as `idle`, `failed`, `awaiting_user_input` or `awaiting_user_confirmation`.

Nodes are called with the loop as `this`, so private helpers work as usual.

## `RunContext`

The first argument of a node is everything it needs to read:

```typescript
ctx.currentMessage
ctx.currentUser
ctx.currentSession
ctx.identity
ctx.chat
ctx.task
ctx.chatOptions
ctx.tools
ctx.skillParams
ctx.baseParams
ctx.logger
```

- `ctx.chat` is the `Chat` entity: state, settings, messages and tasks.
- `ctx.task` is the active `AgentTask`, if one exists.
- `ctx.skillParams` is what you spread into `Skill.run`. See [skills](skills.md).
- `ctx.baseParams` is what a `Tool` receives next to its arguments.

## `Harness`

The second argument is the services of the [harness](harness.md) that the loop can call:

| Member | What it does |
| --- | --- |
| `reply(content)` | Sends a message to the user. |
| `executionMode` | `interactive` or `autonomous`, taken from the run. |
| `answerQuestion(question)` | In an autonomous run, answers a question of the model on behalf of the absent user and returns the answer, or `undefined` when it cannot. In an interactive run it always returns `undefined`, and the loop pauses and asks the user. |
| `setNextNode(node)` | Chooses the next node. `undefined` falls back to the initial node on the next message. |
| `toolCatalog()` | Returns the tools to declare to the model and the context that describes the rest. Handles discovery and MCP servers. |
| `searchTools(keywords, opts)` | Ranks the available tools by keyword. `opts.server` limits it to one MCP server. |
| `ensureTools()` | Loads the list of MCP servers and returns the tools known so far. |
| `runAction(action, opts)` | Runs an action through the tool pipeline. |
| `requiresApproval(action)` | Tells whether an action needs the user's confirmation before it can run. |
| `requestApproval(actions, { resumeAt })` | Asks the user to confirm and resumes at `resumeAt` once they answer. |
| `workspace` | Saves and reads notes and large outputs of the task. |

Always go through `runAction`. It applies validation, grounding checks, duplicate protection, output offloading and the approval rules described in [harness](harness.md#tool-pipeline). Do not call `tool.run` yourself.

## Tasks

A task is one thing the user asked the agent to do. A later "actually, search the web instead" starts a different task in the same chat.

```typescript
const task = ctx.task ?? ctx.chat.createTask(ctx.currentMessage)

ctx.chat.completeTask(task.id, 'summary')
ctx.chat.failTask(task.id)
ctx.chat.cancelTask(task.id)
ctx.chat.lastCompletedTask()
```

A task carries its ledger of actions (tool calls), the turns of the model, what the model learned and the schemas of the tools it has seen.

## Running skills

```typescript
const result = await mySkill.run({ ...ctx.skillParams, contextInjection: { goal: ctx.task?.goal } })
```

Every skill run is traced automatically. See [skills](skills.md).

## The shared skill

`openloops/loops` exports `fastResponder`, the skill that every loop can reuse as its first step: it answers general conversation directly, or says that it cannot and the loop continues with its reasoning.

The approvals and the answers of autonomous runs are written by skills that belong to the harness. They are internal, and you do not need to call them: `Agent` runs them for you when you use `harness.requestApproval` and `harness.answerQuestion`.
