# Skills

A `Skill` is a typed, structured call to an LLM: the way a node inside your `AgentLoop` reasons about something. Where a `Tool` *does* something in the world, a `Skill` *decides* something.

```typescript
import { Skill } from 'openloops/skills'
```

## Defining a skill

```typescript
export type ResponseSchema = {
    can_answer: boolean
    answer: string
    reasoning: string
}

export const myResponder = new Skill<ResponseSchema>({
    name: 'my_responder',
    version: '1.0.0',
    description: 'Decides whether the request can be answered directly.',
    temperature: 0.3,
    systemInstructions: {
        instruction_set: {
            goal: 'Decide if the user message can be answered without any tools.',
            role: 'You are the first filter of an assistant.',
            logic_rules: [
                'OUTPUT_FORMAT: Every response is a single JSON object matching response_schema. Nothing outside that JSON.',
            ],
            response_schema: {
                can_answer: 'boolean',
                answer: 'string',
                reasoning: 'string',
            },
        },
    },
})
```

| Prop | Required | What it does |
| --- | --- | --- |
| `name` | yes | Identifies the skill in traces and usage records. |
| `systemInstructions` | yes | A plain object the model follows. The bundled skills use `instruction_set` with `goal`, `role`, `logic_rules` and `response_schema`, which is a good shape to copy. |
| `version` | no | Recorded in the metadata of every call. Bump it whenever the prompt changes. |
| `description` | no | What the skill is for. |
| `temperature` | no | Sampling temperature. Defaults to `0.7`. |
| `thinking` | no | How much the model thinks before it answers: `off`, `low`, `medium` or `high`. Thinking costs time and output tokens, so a skill that only classifies or answers briefly can set it low. When it is left out the provider default applies, which is high for the Claude models. The bundled `fast_responder` uses `low`. |
| `systemRole` | no | Default `true`: the instructions travel as a system message. |
| `mode` | no | How the model is called when tools are given. Defaults to `plain_chat`. |

## Running a skill

Inside a loop node:

```typescript
const result = await myResponder.run({
    ...ctx.skillParams,
    contextInjection: {
        goal: ctx.task?.goal,
    },
})

if (result.can_answer) {
    harness.reply(result.answer)
}
```

`ctx.skillParams` already carries the provider and model chosen for the chat, `sessionId`, `answerId`, the user's message, `currentUser`, `currentSession` and the current chat. You normally only add `contextInjection`.

| Run option | What it does |
| --- | --- |
| `contextInjection` | Extra keys placed under `CONTEXT`. |
| `input` | Extra keys placed under `INPUT`, next to `user_message`. |
| `history` | The conversation of a reasoning cycle, as messages. Used by loops that keep a state between cycles. |
| `chatHistory` | Previous user and assistant turns. Cannot be combined with `history`. |
| `tools` | Tool definitions to show the model. |
| `mode` | Overrides the mode of the skill for this call. |

`tools`, `mode`, `history` and `chatHistory` are run options. Putting them inside `contextInjection` throws.

## What the model always receives

Besides your `contextInjection`, every call gets the current UTC and local time, time zone, day of the week, the user's name and language, the session's device and location, and the conversation language (`detected_language`) when an earlier node has already detected it. Skills do not need to detect it again.

## The result

The parsed JSON object comes back with a few extras:

| Field | Meaning |
| --- | --- |
| `costInUsd` | Cost of the call. |
| `responseId` | Provider response id. |
| `opening` | The first message of the call, which loops store to keep the opening stable between cycles. |
| `callInfo` | `skill`, `skillVersion`, `mode`, `model`, `provider`, number of `blocks` and, when the model did not return JSON, `rawText`. |

Every call is traced, including failures. When a model sends several text blocks in one answer, the first complete one is used and the rest are discarded, which is noted in the trace.

## Call modes

| Mode | When to use it |
| --- | --- |
| `plain_chat` | Default. The tool list travels as text and the model answers with the JSON as text. It was the best or tied for best in the evals and works with any provider. |
| `function_calling` | One forced call per cycle with the whole response as arguments. Needs a provider with forced tool choice. |
| `function_calling_split` | Native function calling for each action. Experimental. |
| `legacy_tools_off` | Do not use. It scored 0 to 30% in the evals. |
