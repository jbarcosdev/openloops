# LLM usage tracking

Every LLM call `openloops` makes, including every skill run and every reasoning step, is tracked automatically. You don't instrument anything yourself; you just query it when you need it.

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

With no filters, `getLLMUsage` returns the total usage for the current calendar month.

## Usage for one chat

```typescript
const result = await getLLMUsage({
    filters: { sessionId: chatId },
    currentUser,
})
```

## Usage for a specific assistant answer

```typescript
const result = await getLLMUsage({
    filters: { messageId: assistantMessageId },
    currentUser,
})
```

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

`result.data` gives you the aggregated cost and token counts matching whatever filter you passed.
