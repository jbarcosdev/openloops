# LLM usage tracking

Every LLM call `openloops` makes, including every skill run and every reasoning step, is recorded automatically with its response, tokens and cost. You don't instrument anything yourself; you query it when you need it.

```typescript
import { getLLMUsage } from 'openloops/llmcalls'
```

## Current month usage (default)

```typescript
const result = await getLLMUsage({
    filters: {},
    currentUser,
})
```

With no filters, `getLLMUsage` returns the usage of the current calendar month.

## Usage for one chat

```typescript
const result = await getLLMUsage({
    filters: { sessionId: chatId },
    currentUser,
})
```

## Usage for one assistant answer

```typescript
const result = await getLLMUsage({
    filters: { messageId: assistantMessageId },
    currentUser,
})
```

`messageId` is the `answerId` of the assistant message. Everything the agent spent to produce that answer is added together.

## Usage for a date range

```typescript
const result = await getLLMUsage({
    filters: {
        fromDate: '2026-09-20',
        toDate: '2026-09-29',
    },
    currentUser,
})
```

Dates are read in the user's time zone. Filters can be combined.

## The result

```typescript
result.data.totalTokens
```

`result.data` has the user's `totalTokens` for the filter. When there is no usage in the range, `data` is empty. The cost of each call is stored with the call itself, and the cost of a skill run is also returned as `costInUsd` in the skill result and in the metadata of every turn of a task.
