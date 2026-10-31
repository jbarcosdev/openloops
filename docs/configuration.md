# Configuration

`openloops` reads its configuration from environment variables. Copy `.env.example` and fill in what you use.

| Variable | Required | What it is for |
| --- | --- | --- |
| `OPENLOOPS_DB_URI` | yes | MongoDB connection string. |
| `OPENLOOPS_DB_NAME` | no | Database name. Defaults to `openloops`. |
| `OPENLOOPS_MONGO_MAX_POOL_SIZE` | no | Most connections each process keeps open to MongoDB. Defaults to `3`, which suits serverless functions, where every instance handles one request at a time. Raise it for a long-running server. |
| `SECRET_MANAGER_KEY` | yes | Key used to decrypt values that start with `ENC:`. The library throws when it loads without it. |
| `ANTHROPIC_API_KEY` | for the default model | API key of the default provider, `anthropic`. |
| `OPENAI_API_KEY`, `GEMINI_API_KEY` | for those providers | API keys of the other providers you choose per chat. |
| `JWT_SECRET` | for `login` | Secret that signs the tokens. See [authentication](authentication.md). |
| `SERPER_API_KEY` | for `webSearchTool` | See [tools](tools.md#built-in-tools). |
| `SLACK_BOT_TOKEN` | for `sendSlackMessageTool` | See [tools](tools.md#built-in-tools). |
| `INTERNAL_MCP_TOKEN` | for internal MCP servers in agentic jobs | Token sent to the internal MCP servers when a job runs without the session of its owner. See [agentic jobs](agentic-jobs.md#internal-mcp-servers-in-a-job). |
| `AGENTIC_JOBS_POLL_INTERVAL_MS` | no | How often the runner of [agentic jobs](agentic-jobs.md) checks what is due, in milliseconds. Defaults to `60000`. |
| `AGENTIC_JOBS_LEASE_MS` | no | How long a job stays locked while it runs, in milliseconds. Defaults to `600000`. |
| `LLM_FALLBACK_PROVIDER`, `LLM_FALLBACK_MODEL` | no | The model to use when nothing else chooses one, for the whole deployment. Set both or neither. See [Which model a chat uses](#which-model-a-chat-uses). |
| `LLM_CALL_TIMEOUT_MS` | no | Longest time to wait for one attempt of a model call, in milliseconds. Defaults to `60000`, and calls with the `high` thinking effort get twice as much. See [Timeouts](#timeouts). |
| `MCP_TOOL_TIMEOUT_MS` | no | Longest time to wait for a tool of an MCP server, in milliseconds. Defaults to `60000`. See [Timeouts](#timeouts). |
| `SENTRY_DSN` | no | Errors are reported to Sentry when set, unless `IS_LOCAL` is `true` or `NODE_ENV` is `development`. |
| `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_BASE_URL` | no | Traces every LLM call in Langfuse when all three are set. |
| `IS_LOCAL`, `NODE_ENV` | no | Local development switches. |

Any value can be stored encrypted by prefixing it with `ENC:`. It is decrypted with `SECRET_MANAGER_KEY` when it is read.

## Which model a chat uses

Every time an agent runs, the model is the first one of this list that exists:

1. **The model sent in that run** (`modelProvider` and `modelName`, always together). It is saved in the chat as the last one used.
2. **The model saved in the chat.** If a run does not send one, the chat keeps using the last one that was sent, even if the user changed it between runs.
3. **The default model of the user** (`preferences.defaultModel`, see [users](users.md#default-model)). It is used when the chat has no model yet, and it is saved in the chat.
4. **The `fallbackModel` of the agent** (`new Agent({ fallbackModel: { provider, model } })`).
5. **The fallback of the backend**: the variables `LLM_FALLBACK_PROVIDER` and `LLM_FALLBACK_MODEL`, which must be set together.
6. **The fallback of the client**: `anthropic` with `claude-haiku-5-5`.

The model that is chosen is always saved in the chat, so changing the preference of a user or a fallback only affects the chats that start afterwards. Calls that are not made by an agent, such as the `call_ai` tool, use the default model of the user, then the fallback of the backend, then the one of the client.

### The fallback of the client

The last fallback is `anthropic` with `claude-haiku-5-5`, so `ANTHROPIC_API_KEY` is the only model key you need to start.

It was chosen with the project's own evals (the `evals/` folder of the repository, results of 2026-10-12), in the default `plain_chat` mode and next to `gpt-6-luna`, `gpt-4o-mini` and `gemini-2.5-flash`. The skill rows use the real prompt of the reasoning engine:

| | `claude-haiku-5-5` | Others in the same evals |
| --- | --- | --- |
| Accuracy of the reasoning engine skill | 20 of 20 runs, in two executions | 20 of 20 for `gpt-6-luna`, 10 of 10 for `gpt-4o-mini` (one execution), 17 of 20 for `gemini-2.5-flash` |
| Accuracy on the 10 case model suite | 30 of 30 runs | 30 of 30 for `gpt-6-luna`, 27 of 30 for `gpt-4o-mini` |
| Prompt tokens read from the cache | 70% to 71% | 53% to 55% for `gpt-6-luna`, 62% for `gpt-4o-mini`, 44% to 73% for `gemini-2.5-flash` |
| Price per million tokens | $0.10 input, $0.50 output, $0.01 cached input | $0.10 and $0.50 for `gpt-6-luna`, $0.15 and $0.60 for `gpt-4o-mini` |

It is in the low price tier, it makes the most of the prompt cache, which matters because the prompt of an agent is large and repeats in every cycle, and it was among the most accurate. These are small samples (10 runs per setup in the skill evals, 3 repetitions per case in the model suite) and results change as providers update their models, so run the evals again before relying on the numbers for another prompt or model.

## Timeouts

A model call that never answers would block the whole run, so every attempt has a time limit:

- **Model calls.** An attempt that does not answer within `LLM_CALL_TIMEOUT_MS` (60 seconds by default) is cancelled and the same call is made again, up to 3 attempts in total. A call with the `high` thinking effort, which thinks for longer, gets twice that time. When all of them time out, the run fails with the error code `LLM_TIMEOUT` and a message for the user, and the chat is left as `failed` so the user can send the message again. Waiting for a provider that asks to slow down is a separate mechanism and is not affected.
- **Tools of MCP servers.** A tool that does not answer within `MCP_TOOL_TIMEOUT_MS` (60 seconds by default) fails. The time starts again every time the server reports progress, so a long tool that is alive is not cut off. A tool call is never repeated automatically, because it may have changed something. The model is told that the result is unknown and that it must check before repeating it.
- **Langfuse.** Sending the trace of a call to Langfuse waits at most 5 seconds. If it takes longer or fails, the run continues without it.

A value that is not a positive whole number is ignored and the default is used.

## Choosing the model

Choose the model of a chat when you run it:

```typescript
await agent.run({
    input: { message: 'hi' },
    options: { modelProvider: 'anthropic', modelName: 'claude-haiku-5-5' },
    currentUser,
})
```

The provider and the model go together: sending only one of them is an error. The choice is saved in the chat and used for its next runs until you send another one. Set the API key variable that the provider expects.

The model call goes through a single client that retries, cancels and repeats an attempt that does not answer in time, waits when the provider asks to slow down, drops a temperature setting the model rejects and turns provider errors into messages that are safe to show to the user.

## Indexes

The collections of the package are queried by owner, chat, task and date, so they need indexes. Without them every query reads the whole collection. Create them once per deployment, and again after upgrading the package, with the helper that lists them all:

```ts
import { MongoClient } from 'mongodb'
import { ensureIndexes } from 'openloops/db'

const client = new MongoClient(process.env.OPENLOOPS_DB_URI as string)
await client.connect()
console.log(await ensureIndexes(client.db(process.env.OPENLOOPS_DB_NAME || 'openloops')))
await client.close()
```

It covers `llm_calls`, `chats`, `agent_tasks`, `agent_actions`, `agent_traces`, `workspace_items`, `mcp_servers`, `agentic_jobs` and `agentic_job_runs`. It is safe to run again: an index that already exists is left as it is. Collections of your own application are not included.

## What is recorded

- Every LLM call, with its response, tokens and cost. See [usage](usage.md).
- A trace for every node and skill of a run, with the reasoning of the model. They are stored per chat for debugging and audit.
- The full ledger of actions of every task, with arguments, results and errors.
