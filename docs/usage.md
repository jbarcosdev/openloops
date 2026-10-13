# LLM usage tracking

Every LLM call `openloops` makes, including every skill run and every reasoning step, is recorded automatically with the raw response of the provider. Tokens, cache usage, reasoning tokens and cost are all read from that stored response, so nothing has to be instrumented.

```typescript
import { getLLMUsage, getLLMUsageStats } from 'openloops/llmcalls'
```

There are two functions:

- `getLLMUsage` answers how much one chat or one answer used.
- `getLLMUsageStats` answers how much a user used in a period, by model and over time.

## Usage of one chat or one answer

```typescript
const chat = await getLLMUsage({
    filters: { sessionId: chatId },
    currentUser,
})

const answer = await getLLMUsage({
    filters: { messageId: assistantMessageId },
    currentUser,
})
```

`messageId` is the `answerId` of the assistant message. Everything the agent spent to produce that answer is added together. Pass `sessionId`, `messageId` or both. Without either, every value is zero.

```typescript
result.data
// {
//     input, output, cacheRead, cacheWrite, reasoning, totalTokens, totalCost
// }
```

| Field | Meaning |
| --- | --- |
| `input`, `output` | Tokens sent and generated. |
| `cacheRead`, `cacheWrite` | Tokens read from and written to the provider's prompt cache. |
| `reasoning` | Reasoning tokens, when the provider reports them. They are already inside `output`, so do not add them again. |
| `totalTokens` | Total tokens as the provider counts them. |
| `totalCost` | Cost in USD. |

When there are no matching calls, every field is `0`.

## Usage statistics of a user

```typescript
const result = await getLLMUsageStats({
    filters: {
        fromDate: '2026-09-01',
        toDate: '2026-09-30',
        groupBy: 'day',
        provider: 'openai',
        model: 'gpt-4o-mini',
    },
    currentUser,
})
```

All filters are optional. The statistics are always those of `currentUser`.

| Filter | Default | Meaning |
| --- | --- | --- |
| `fromDate`, `toDate` | First and last day of the current month | Local days in the format `YYYY-MM-DD`, both included. |
| `groupBy` | `day` | Size of each period of the series: `day` or `month`. |
| `provider`, `model` | none | Only calls of that provider or model. |

Days and periods are calculated in the time zone of the user (UTC when the user has none), and daylight saving time is respected. A range can have at most 366 periods.

### The result

```typescript
result.data.summary
// { calls, totalTokens, totalCost }

result.data.models
// [{ provider, model, calls, totalTokens, totalCost, tokensPercentage, costPercentage }]

result.data.series
// [{ period, input, output, cacheRead, cacheWrite, reasoning, totalTokens, totalCost }]
```

- `models` is sorted by tokens, highest first. The two percentages are the share of that model in the total tokens and in the total cost, and each one adds up to 100.
- `series` has one entry for every period of the range, in order, including the periods without calls, which come with zeros. `period` is `2026-09-15` for `day` and `2026-09` for `month`.
