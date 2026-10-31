# Chats

Every conversation with an agent is a chat. The `Agent` creates and updates chats by itself, so you only use these functions to build the surrounding experience: a list of conversations, loading one, deleting it.

```typescript
import { createChat, getChatById, listChatsByUser, updateChat, deleteChat } from 'openloops/chats'
```

## The chat record

| Field | Meaning |
| --- | --- |
| `state` | `status`, detected `language`, `activeTaskId`, `lastError` and `stopRequested`. See [agent](agent.md#the-result) for the statuses. It also has `currentActivity`, which is deprecated (see below). |
| `settings` | `modelProvider` and `modelName` (the model the chat uses, saved on every run), `thinkingEffort` (only when a run sent it), `loopName`, `executionMode`, `notifyOnCompletion` and `isPrivateSession`. |
| `messages` | The conversation. Each message has `role` (`user` or `assistant`), `source`, `content`, `answerId` and `excludeFromContext`. |

### `state.currentActivity` is deprecated

Since 0.3.0 the activity of a run is no longer saved with the chat, and `currentActivity` will be removed in 0.4.0. Follow a run with [`agent.onActivity`](agent.md#activity-updates), which tells every change as it happens.

For the clients that still poll the chat and read `state.currentActivity`, `getChatById` adds a generic word to it, such as `Thinking...` or `Cooking...`, only while the run is `processing`. It is one word per chat that changes every few seconds. It says nothing about what the agent is really doing, and it is not there in any other status. Move those clients to the listener before 0.4.0.

Every assistant message of one answer shares an `answerId`. It is the id you pass as `messageId` to [usage](usage.md).

`role` says on which side of the conversation a message is, and `source` says who produced it:

| `source` | Meaning |
| --- | --- |
| `user` | Written by the person. |
| `model` | Written by the model: the answers and questions of the agent. |
| `harness` | Written by the harness: the reply of a [guardrail](guardrails.md), the question that asks for an approval, the acknowledgement of a cancelled task and, in an autonomous run, the answer of the automatic evaluator, which has `role: 'user'`. |

A message saved before `source` existed has none.

Messages with `excludeFromContext` are shown in the history but never sent to the model. They are the ones blocked by a guardrail and, in an autonomous run, the questions of the model together with the automatic answers.

## Listing a user's chats

```typescript
const result = await listChatsByUser({
    options: { page: 1, limit: 10 },
    currentUser,
})
```

Sorted by last update, newest first. Defaults to page 1 and 10 chats.

```typescript
const autonomous = await listChatsByUser({ executionMode: 'autonomous', currentUser })

const interactive = await listChatsByUser({ executionMode: 'interactive', currentUser })
```

`executionMode` is optional. `autonomous` returns the chats that were created by an autonomous run and `interactive` returns the rest, including the chats saved before the mode existed. Combine it with `state.status` to show the autonomous runs that need attention: `awaiting_user_confirmation` or `awaiting_user_input` mean the run is paused until the user answers in the chat, and `failed` means it failed.

## Getting one chat

```typescript
const result = await getChatById({ id: chatId, currentUser })

const state = await getChatById({ id: chatId, select: { state: 1 }, currentUser })
```

`select` limits the fields that come back, which is handy for polling the status of a long run.

## Creating and updating

```typescript
const created = await createChat({ payload: { settings: { loopName: 'agi' } }, currentUser })

await updateChat({ id: chatId, payload: { settings: { modelProvider: 'anthropic', modelName: 'claude-haiku-5-5' } }, currentUser })
```

You rarely need `createChat`: `agent.run` creates the chat when you omit `chatId`.

## Deleting a chat

```typescript
await deleteChat({ id: chatId, currentUser })

await deleteChat({ id: chatId, hardDelete: true, currentUser })
```

The first one is a soft delete. A hard delete is for admins only.

## Stopping a running chat

```typescript
import { Agent } from 'openloops/core'

await Agent.interruptExecution(chatId, currentUser)
```

See [agent](agent.md#stopping-a-running-turn).
