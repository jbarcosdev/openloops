# Configuration

`openloops` reads its configuration from environment variables. Copy `.env.example` and fill in what you use.

| Variable | Required | What it is for |
| --- | --- | --- |
| `OPENLOOPS_DB_URI` | yes | MongoDB connection string. |
| `OPENLOOPS_DB_NAME` | no | Database name. Defaults to `openloops`. |
| `SECRET_MANAGER_KEY` | yes | Key used to decrypt values that start with `ENC:`. The library throws when it loads without it. |
| `OPENAI_API_KEY` | for OpenAI models | API key of the default provider. |
| `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` | for those providers | API keys of the other providers you choose per chat. |
| `JWT_SECRET` | for `login` | Secret that signs the tokens. See [authentication](authentication.md). |
| `SERPER_API_KEY` | for `webSearchTool` | See [tools](tools.md#built-in-tools). |
| `SENTRY_DSN` | no | Errors are reported to Sentry when set, unless `IS_LOCAL` is `true` or `NODE_ENV` is `development`. |
| `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_BASE_URL` | no | Traces every LLM call in Langfuse when all three are set. |
| `IS_LOCAL`, `NODE_ENV` | no | Local development switches. |

Any value can be stored encrypted by prefixing it with `ENC:`. It is decrypted with `SECRET_MANAGER_KEY` when it is read.

## Choosing the model

The default provider is `openai` and the default model is `gpt-4o-mini`. Pick another one for a chat when you run it:

```typescript
await agent.run({
    input: { message: 'hi' },
    options: { modelProvider: 'google', modelName: 'gemini-2.5-flash' },
    currentUser,
})
```

The choice is stored in the chat settings and used for the rest of that chat. Set the API key variable that the provider expects.

The model call goes through a single client that retries, waits when the provider asks to slow down, drops a temperature setting the model rejects and turns provider errors into messages that are safe to show to the user.

## What is recorded

- Every LLM call, with its response, tokens and cost. See [usage](usage.md).
- A trace for every node and skill of a run, with the reasoning of the model. They are stored per chat for debugging and audit.
- The full ledger of actions of every task, with arguments, results and errors.
