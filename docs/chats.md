# Chats

Every conversation with an agent is a chat. The `Agent` creates and updates chats by itself, so you only use these functions to build the surrounding experience: a list of conversations, loading one, deleting it.

```typescript
import { createChat, getChatById, listChatsByUser, updateChat, deleteChat } from 'openloops/chats'
```

## The chat record

| Field | Meaning |
| --- | --- |
| `state` | `status`, detected `language`, `activeTaskId`, `currentActivity`, `lastError` and `stopRequested`. See [agent](agent.md#the-result) for the statuses. |
| `settings` | `modelProvider`, `modelName`, `loopName`, `notifyOnCompletion` and `isPrivateSession`. |
| `messages` | The conversation. Each message has `role` (`user` or `assistant`), `content`, `answerId` and `excludeFromContext`. |

Every assistant message of one answer shares an `answerId`. It is the id you pass as `messageId` to [usage](usage.md).

Messages blocked by a [guardrail](guardrails.md) have `excludeFromContext` set, so you can decide whether to show them.

## Listing a user's chats

```typescript
const result = await listChatsByUser({
    options: { page: 1, limit: 10 },
    currentUser,
})
```

Sorted by last update, newest first. Defaults to page 1 and 10 chats.

## Getting one chat

```typescript
const result = await getChatById({ id: chatId, currentUser })

const state = await getChatById({ id: chatId, select: { state: 1 }, currentUser })
```

`select` limits the fields that come back, which is handy for polling the status of a long run.

## Creating and updating

```typescript
const created = await createChat({ payload: { settings: { loopName: 'agi' } }, currentUser })

await updateChat({ id: chatId, payload: { settings: { modelName: 'gpt-4o' } }, currentUser })
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
