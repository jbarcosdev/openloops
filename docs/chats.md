# Chats

Every conversation with an agent is a chat. The `Agent` creates and updates chats by itself, so you only use these functions to build the surrounding experience: a list of conversations, loading one, deleting it.

```typescript
import { createChat, getChatById, listChatsByUser, updateChat, deleteChat } from 'openloops/chats'
```

## The chat record

| Field | Meaning |
| --- | --- |
| `title` | A short text that names the chat. See [the title](#the-title). |
| `state` | `status`, detected `language`, `activeTaskId`, `lastError` and `stopRequested`. See [agent](agent.md#the-result) for the statuses. Follow the activity of a run with [`agent.onActivity`](agent.md#activity-updates), it is not part of the chat. |
| `settings` | `modelProvider` and `modelName` (the model the chat uses, saved on every run), `thinkingEffort` (only when a run sent it), `loopName`, `executionMode`, `notifyOnCompletion` and `isPrivateSession`. |
| `messages` | The conversation. Each message has `role` (`user` or `assistant`), `source`, `content`, `answerId` and `excludeFromContext`. |

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

Sorted by last update, newest first. Defaults to page 1 and 10 chats. The result has `items` and `hasMore`, which is `true` when there is a next page.

```typescript
const autonomous = await listChatsByUser({ executionMode: 'autonomous', currentUser })

const interactive = await listChatsByUser({ executionMode: 'interactive', currentUser })
```

`executionMode` is optional. `autonomous` returns the chats that were created by an autonomous run and `interactive` returns the rest, including the chats saved before the mode existed. Combine it with `state.status` to show the autonomous runs that need attention: `awaiting_user_confirmation` or `awaiting_user_input` mean the run is paused until the user answers in the chat, and `failed` means it failed.

```typescript
const found = await listChatsByUser({ search: 'netflix', currentUser })
```

`search` is optional. It returns the chats whose title or at least one message contains the text, ignoring case, in the same order and with the same pagination. The text is matched literally, so characters such as `(` or `.` have no special meaning. It reads the messages without an index, which is fine for the chats of one user. An empty text is ignored.

```typescript
const history = await listChatsByUser({ search: 'netflix', select: { title: 1, updatedAt: 1 }, currentUser })
```

`select` is optional and limits the fields that come back, as in `getChatById`. Without it every chat comes complete, with all its messages. A history list only needs a few fields, and `_id` always comes. `search` does not depend on `select`: it still looks in the messages when they are not returned, and the chat that the user picks is loaded with `getChatById`. A history without messages cannot show the first message of a chat that has no title, so [migrate the old chats](#migrating-to-080).

## The title

In an interactive run the first node, `fast_responder`, writes a title for a chat that has none: at most 50 characters, in the language of the first message. The loop saves it on one line, without tags and cut to 80 characters, and never replaces a title that already exists. If the model returns nothing usable the chat stays without a title and the next message asks again. An autonomous run skips that node, so set the title yourself when you create its chat if you want one.

```typescript
await updateChat({ id: chatId, payload: { title: 'Trip to Lisbon' }, currentUser })

await updateChat({ id: chatId, payload: { settings: { notifyOnCompletion: true } }, unset: { title: '' }, currentUser })
```

The first call renames the chat, and the agent keeps that title from then on. The second removes the title, so the next message gets a new one.

## Migrating to 0.8.0

Chats saved with a version before 0.8.0 have no title. **Run `migrateChatTitles` once per database when you update.** It gives each chat without a title its first message of the user, on one line, without HTML tags and cut to 80 characters. Without it those chats stay untitled until they receive another message, and a history that lists with `select` has nothing to show for them, because it does not read the messages.

1. **Take a backup**, and run it with `dryRun` first. It only counts.

    ```typescript
    import { migrateChatTitles } from 'openloops/db'

    const report = await migrateChatTitles(db, { dryRun: true })
    ```

    The report has `titled` (chats that get a title) and `skipped` (chats without a message of the user, which the first message they receive will title).
2. **Run it for real**, with `dryRun: false` or without the option. It can be run again without changing anything, because it only touches chats without a title, and it skips the deleted ones. In a checkout of this repository you can run `yarn migrate:chat-titles --dry-run` and `yarn migrate:chat-titles`, which read `OPENLOOPS_DB_URI` and `OPENLOOPS_DB_NAME`.
3. **Show something for a chat with no title**, such as "Untitled": a new chat has none until its first message is processed, a chat whose title the model did not return gets it in the next message, and an autonomous chat has none unless you set it.
4. **Stop reading `state.currentActivity`.** It is gone from the chat and `getChatById` no longer adds a generic word while a run is `processing`. Follow the run with [`agent.onActivity`](agent.md#activity-updates) and use `state.status` to know whether it is still going. The versions of your app that still poll the chat need to be updated before you update `openloops`.
5. **Handle the new error codes** in `state.lastError.code`: `LLM_AUTH_FAILED`, `LLM_CONTEXT_TOO_LONG`, `LLM_CONTENT_FILTERED` and `LLM_INCOMPLETE_RESPONSE` used to be `LLM_FAILED`. See [the list](agent.md#error-handling).

The changelog also lists two smaller changes of this version: `sanitizeString` no longer decodes HTML entities, and `pino-pretty` is now a dev dependency.

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
