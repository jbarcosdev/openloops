# Skills

A `Skill` is a typed, structured call to an LLM: the way a node inside your `AgentLoop` reasons about something. Where a `Tool` *does* something in the world, a `Skill` *decides* something.

```typescript
import { Skill } from 'openloops/skills'
```

## Defining a skill

```typescript
export type ResponseSchema = {
    canAnswer: boolean
    answer: string
    reasoning: string
}

export const myResponder = new Skill<ResponseSchema>({
    name: 'my_responder',
    version: '1.0.0',
    description: 'Decides whether the request can be answered directly.',
    temperature: 0.3,
    systemInstructions: {
        goal: 'Decide if the user message can be answered without any tools.',
        response_schema: {
            canAnswer: 'boolean',
            answer: 'string',
            reasoning: 'string',
        },
    },
})
```

`systemInstructions` is a plain object. Write it however makes the intent clearest to the model; there's no required shape beyond having something the LLM can follow.

## Running a skill

Inside a loop node:

```typescript
const result = await myResponder.run({
    ...ctx.skillParams,
    contextInjection: {
        // anything the skill needs beyond the user's message
    },
})

if (result.canAnswer) {
    ctx.reply(result.answer)
}
```

`ctx.skillParams` already carries `sessionId`, `answerId`, the user's message, `currentUser`, `currentSession`, and the current chat (used for automatic tracing and for injecting the agent's `identity` and detected conversation language). You only ever need to add `contextInjection`.

Every skill call is traced automatically, including on failure. You never need to log a skill call yourself.

## Detected language

If an earlier node in the same turn has already determined the conversation's language, every subsequent skill call receives it automatically as part of its context. You don't need to pass it manually, and skills shouldn't need to re-detect it from scratch.
