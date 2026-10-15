# LLM usage tracking

Every LLM call `openloops` makes, including every skill run and every reasoning step, is recorded automatically with the raw response of the provider. Tokens, cache usage, reasoning tokens and cost are all read from that stored response, so nothing has to be instrumented.

```typescript
import { getLLMUsageByMessage, getLLMUsageByChat, getLLMUsageStats } from 'openloops/llmcalls'
```

There are three functions:

- `getLLMUsageByMessage` answers how much one answer of the agent used.
- `getLLMUsageByChat` answers how much a whole chat used.
- `getLLMUsageStats` answers how much a user used in a period, by model and over time.

## Usage of one answer and of one chat

```typescript
const answer = await getLLMUsageByMessage({
    messageId: assistantMessageId,
    currentUser,
})

const chat = await getLLMUsageByChat({
    chatId,
    currentUser,
})
```

`messageId` is the `answerId` of the assistant message, and everything the agent spent to produce that answer is added together. Both functions only count the calls of `currentUser`, and both return the same shape:

```typescript
result.data.summary
// { calls, input, output, cacheRead, cacheWrite, reasoning, totalTokens, totalCost }

result.data.models
// [{ provider, model, calls, input, output, cacheRead, cacheWrite, reasoning, totalTokens, totalCost }]
```

`summary` is the total, and `models` has one entry for every provider and model that was used, with the same fields. A chat can use several models, because the user can change it between runs, so the detail by model tells how much each one cost. The answer of one message will usually have a single model. `summary` is always the sum of `models`, and `models` is sorted by tokens, highest first.

| Field | Meaning |
| --- | --- |
| `calls` | Number of calls to the model. |
| `input`, `output` | Tokens sent and generated. |
| `cacheRead`, `cacheWrite` | Tokens read from and written to the provider's prompt cache. |
| `reasoning` | Reasoning tokens, when the provider reports them. They are already inside `output`, so do not add them again. |
| `totalTokens` | Total tokens as the provider counts them. |
| `totalCost` | Cost in USD. |

When there are no matching calls, `summary` has every field in `0` and `models` is empty. A call that was stored without provider or model appears as `unknown`. `messageId` and `chatId` are required, and the call fails if they are missing or are not valid ids.

## Usage statistics of a user

```typescript
const result = await getLLMUsageStats({
    filters: {
        fromDate: '2026-09-01',
        toDate: '2026-09-30',
        groupBy: 'day',
        provider: 'anthropic',
        model: 'claude-haiku-5-5',
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
