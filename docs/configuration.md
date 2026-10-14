# Configuration

`openloops` reads its configuration from environment variables. Copy `.env.example` and fill in what you use.

| Variable | Required | What it is for |
| --- | --- | --- |
| `OPENLOOPS_DB_URI` | yes | MongoDB connection string. |
| `OPENLOOPS_DB_NAME` | no | Database name. Defaults to `openloops`. |
| `SECRET_MANAGER_KEY` | yes | Key used to decrypt values that start with `ENC:`. The library throws when it loads without it. |
| `ANTHROPIC_API_KEY` | for the default model | API key of the default provider, `anthropic`. |
| `OPENAI_API_KEY`, `GEMINI_API_KEY` | for those providers | API keys of the other providers you choose per chat. |
| `JWT_SECRET` | for `login` | Secret that signs the tokens. See [authentication](authentication.md). |
| `SERPER_API_KEY` | for `webSearchTool` | See [tools](tools.md#built-in-tools). |
| `SENTRY_DSN` | no | Errors are reported to Sentry when set, unless `IS_LOCAL` is `true` or `NODE_ENV` is `development`. |
| `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_BASE_URL` | no | Traces every LLM call in Langfuse when all three are set. |
| `IS_LOCAL`, `NODE_ENV` | no | Local development switches. |

Any value can be stored encrypted by prefixing it with `ENC:`. It is decrypted with `SECRET_MANAGER_KEY` when it is read.

## Default model

The default provider is `anthropic` and the default model is `claude-haiku-5-5`. It is what a chat uses when you do not choose another one, so `ANTHROPIC_API_KEY` is the only model key you need to start.

It was chosen with the project's own evals (see `evals/`, results of 2026-10-12), in the default `plain_chat` mode and next to `gpt-6-luna`, `gpt-4o-mini` and `gemini-2.5-flash`. The skill rows use the real prompt of the reasoning engine:

| | `claude-haiku-5-5` | Others in the same evals |
| --- | --- | --- |
| Accuracy of the reasoning engine skill | 20 of 20 runs, in two executions | 20 of 20 for `gpt-6-luna`, 10 of 10 for `gpt-4o-mini` (one execution), 17 of 20 for `gemini-2.5-flash` |
| Accuracy on the 10 case model suite | 30 of 30 runs | 30 of 30 for `gpt-6-luna`, 27 of 30 for `gpt-4o-mini` |
| Prompt tokens read from the cache | 70% to 71% | 53% to 55% for `gpt-6-luna`, 62% for `gpt-4o-mini`, 44% to 73% for `gemini-2.5-flash` |
| Price per million tokens | $0.10 input, $0.50 output, $0.01 cached input | $0.10 and $0.50 for `gpt-6-luna`, $0.15 and $0.60 for `gpt-4o-mini` |

It is in the low price tier, it makes the most of the prompt cache, which matters because the prompt of an agent is large and repeats in every cycle, and it was among the most accurate. These are small samples (10 runs per setup in the skill evals, 3 repetitions per case in the model suite) and results change as providers update their models, so run the evals again before relying on the numbers for another prompt or model.

## Choosing the model

Pick another one for a chat when you run it:

```typescript
await agent.run({
    input: { message: 'hi' },
    options: { modelProvider: 'anthropic', modelName: 'claude-haiku-5-5' },
    currentUser,
})
```

The choice is stored in the chat settings and used for the rest of that chat. Set the API key variable that the provider expects.

The model call goes through a single client that retries, waits when the provider asks to slow down, drops a temperature setting the model rejects and turns provider errors into messages that are safe to show to the user.

## What is recorded

- Every LLM call, with its response, tokens and cost. See [usage](usage.md).
- A trace for every node and skill of a run, with the reasoning of the model. They are stored per chat for debugging and audit.
- The full ledger of actions of every task, with arguments, results and errors.
