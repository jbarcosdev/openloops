# Guardrails

A guardrail is a rule that can stop a message before the agent spends anything on it. Guards are plain instances, like tools, and you register them on the `Agent`.

```typescript
import { Guard, inputGuards } from 'openloops/guardrails'
```

## Using the ready-made guards

```typescript
import { Agent } from 'openloops/core'
import { AgiLoop } from 'openloops/loops'
import { inputGuards } from 'openloops/guardrails'

const agent = new Agent({
    loop: new AgiLoop(),
    guards: [inputGuards.blockCode, inputGuards.blockEmail],
})

agent.addGuard(inputGuards.blockCard)
```

| Guard | Blocks |
| --- | --- |
| `inputGuards.blockCode` | Messages with fenced code blocks (\`\`\` or ~~~). Inline snippets and error messages pass. |
| `inputGuards.blockEmail` | Messages that contain an email address. |
| `inputGuards.blockCard` | Messages that contain a payment card number. It looks for 13 to 19 digits that pass the Luhn check, so order numbers are left alone. |

The agent also registers a guard that blocks messages longer than `maxInputLength` (100000 characters by default).

## Changing the reply

Ready-made guards are shared and read-only. `withReply` returns a copy with another message but the same name, reference and handler:

```typescript
agent.addGuard(inputGuards.blockCard.withReply('Never send card numbers in the chat.'))
```

## Writing your own

```typescript
const noSpam = new Guard({
    name: 'no_spam',
    description: 'Blocks obvious spam phrases',
    type: 'input',
    reply: 'This looks like spam.',
    handler: ({ message }) => /buy now/i.test(message)
        ? { passed: false, reason: 'Spam phrase' }
        : { passed: true },
})
```

| Prop | What it does |
| --- | --- |
| `name` | Unique name. Identifies the guard in the traces. |
| `type` | Where it runs. Only `'input'` exists: it runs on the user message before the model. |
| `reply` | What the user receives when the guard blocks. |
| `ref` | Reference shown to the user and written to the traces. Derived from `name` when omitted. |
| `handler` | Receives `{ message, chat, currentUser, currentSession, skillParams, logger }` and returns `{ passed, reason? }`. May be async. |

## What happens when a guard blocks

- Guards run in registration order and the first one that blocks wins.
- The model is never called and no task is created.
- The user receives the guard's `reply` followed by `Ref: <ref>`. The `reason` is never shown to the user. It is only written to the chat traces, so it can be specific.
- The blocked message is stored, flagged so it is left out of the history the model reads later.
- A chat that was waiting for a confirmation keeps waiting for it. Any other chat goes back to `idle`.
- If a handler throws, the message is blocked with a generic reply instead of passing unchecked.

Guards run on every run, including the message that answers a confirmation.
