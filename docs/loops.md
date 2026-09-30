# Building an `AgentLoop`

This is the one piece of `openloops` you're expected to write yourself, and the only one that matters for what your agent actually does.

```typescript
import { AgentLoop, RunContext } from 'openloops/core'
```

## The mental model

An `AgentLoop` is a small state machine. It has a handful of **nodes** (plain async functions), and each node decides which node runs next. There's no graph to declare ahead of time, no edges to wire up: a node just calls `ctx.setNextNode(...)` with whichever node should run after it, and the runtime takes it from there.

Read a loop top to bottom and you should understand exactly what your agent does, without needing to trace through a separate graph definition.

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

    private async respond (ctx: RunContext): Promise<void> {
        ctx.reply('Hello!')
    }
}
```

`nodes` is a getter, not a plain field. Declaring it as a getter means it can be the very first thing in the class, before the node methods it references even exist yet, without any initialization-order issues.

`initialNode` is where a brand-new task starts. You can return either the node's key as a string, or (recommended) a direct reference such as `this.nodes.respond`, so a typo is caught by TypeScript instead of failing silently at runtime.

`name` and `version` identify the loop. `name` is what gets stored on a chat so `openloops` knows which loop is driving it. `version` is yours to bump however you version your own releases.

## `RunContext`

Every node receives a single `ctx: RunContext` argument. This is the entire surface area a node needs. Everything else the framework handles for you.

```typescript
ctx.currentMessage      // the user's message for this turn
ctx.currentUser         // the CurrentUser running this turn
ctx.task                // the active AgentTask, if one exists yet
ctx.chat                // the full Chat entity: state, tasks, context, messages

ctx.reply('...')                    // send a message back to the user
ctx.setNextNode(this.nodes.other)   // move to another node, or undefined to pause the turn

ctx.tools                           // Tool[] available this turn (native + MCP)
ctx.searchTools(keywords)           // rank available tools by keyword relevance

ctx.skillParams                     // pre-built params for calling a Skill.run()
ctx.baseParams                      // pre-built params for calling a Tool.run()

ctx.identity                        // the Agent's identity, if one was configured
```

### Tasks

A **task** represents one thing the user asked the agent to do. "Check the price of Bitcoin" and a later "actually, search the web instead" are two different tasks, even in the same chat. `ctx.chat` exposes everything you need to manage them:

```typescript
ctx.chat.createTask(goal)                 // start a new task, pausing whichever one was active
ctx.chat.reopenTask(taskId)               // resume a previously completed task
ctx.chat.completeTask(taskId, summary)    // mark a task done
ctx.chat.failTask(taskId)                 // mark a task failed
ctx.chat.cancelTask(taskId)               // mark a task cancelled by the user
ctx.chat.lastCompletedTask()              // the most recently completed task in this loop
```

A task carries its own ledger of actions (tool calls). See below.

### Running tools

```typescript
const tool = ctx.tools.find(t => t.name === 'web_search')
const action = await ctx.task.runTool({ name: 'web_search', args: { query: '...' } }, tool, ctx.chat.context, ctx.baseParams)
```

For a plan made of several steps with dependencies between them, enqueue them all first and let the runtime resolve which ones are ready to run:

```typescript
task.addAction({ name: 'get_price', stepId: '1', args: { symbol: 'BTC' } })
task.addAction({ name: 'convert', stepId: '2', args: { amount: '{{step_1.output}}' }, dependsOn: ['1'] })

const [next] = task.readyActions
await task.runReadyAction(next.id, tool, ctx.chat.context, ctx.baseParams)
```

`{{step_1.output}}` and `{{context.someName}}` placeholders inside `args` are resolved automatically against the task's own ledger and `ctx.chat.context`.

### Running skills

A `Skill` is a typed, structured call to an LLM. See [Skills](skills.md). Run one and branch on its result directly:

```typescript
const result = await mySkill.run({ ...ctx.skillParams, contextInjection: { goal: ctx.task?.goal } })

if (result.canAnswer) {
    ctx.reply(result.answer)
}
```

The call is automatically traced. You don't need to log anything yourself.

### Workspace (`ctx.chat.context`)

Anything your loop learns that another node (or a later task) might need, such as an extracted entity, a strategy, or a tool's output, can be stored and looked up by name:

```typescript
ctx.chat.context.addContext({
    taskId: task.id,
    meta: { name: 'strategy', type: 'artifact', shortDescription: '...' },
    content: someResult,
})

ctx.chat.context.selectContext({ taskId: task.id, name: 'strategy' })
```

## A complete example

`openloops` ships `PlanExecuteLoop` (`openloops/loops`) as a full reference implementation. It's a loop that tries to answer directly first, falls back to planning a sequence of tool calls when it can't, asks for confirmation before anything destructive, and replans if a step doesn't go as expected. Reading its source is the fastest way to see every piece above working together in a real loop.
