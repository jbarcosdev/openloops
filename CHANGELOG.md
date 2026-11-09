# Changelog

All notable changes to `openloops` are written here, newest first. The format follows [Keep a Changelog](https://keepachangelog.com) and the versions follow [semantic versioning](https://semver.org), where a minor version can still break the API while the package is in beta. Changes before 0.4.0 are not recorded here, see the commits and the tags.

## 0.9.0

### Added

- `usageLimit` in `agent.run`, as `{ maxCostUsd, period }` with `period` required (`day`, `week` or `month`, in the time zone of the user). If the cost of all the model calls of the user in that period is equal to or greater than `maxCostUsd`, the run does not start, nothing is saved and the result carries `error`, `errorCode: 'USAGE_LIMIT_REACHED'` and `usageLimit: { used, limit, period }`. Without it nothing changes. A blocked run is not sent to the error reporter. Read [usage limit](docs/agent.md#usage-limit).
- `stopOnUsageLimit` option of the `Agent`, `false` by default. When `true`, the limit is checked again before each iteration of the loop and the run stops with the chat `failed` and `USAGE_LIMIT_REACHED` in `state.lastError`.
- `UsageLimit`, `UsageLimitError`, `USAGE_LIMIT_REACHED` and `AgentRunResult` are exported from `openloops/core`.
- Examples: `run-agent-with-usage-limit` (one limit per plan) and `run-agent-with-usage-limit-stop` (stopping in the middle of a run).

## 0.8.3

### Added

- `productInfo` option of the `Agent`, with `name`, `company` and `about`, injected into the context of the skills next to the identity. Read [product info](docs/agent.md#product-info).
- `AgentIdentity` and `AgentProductInfo` are exported from `openloops/core`.

### Changed

- The fast responder (2.6.0) now knows it is the front layer of an agent, adopts `identity` like the reasoning engine does, and delegates to the engine every message about the product, the agent or its capabilities, and the data or advice that belong to the domain described in `productInfo.about`. It no longer lists what the agent can or cannot do, and it delegates when in doubt. Keep `identity.role` short.
- The reasoning engine (2.5.6) states more firmly that the final answer goes inside the `respond` action and that text written outside the JSON is never delivered, which reduces the plain text answers that were rejected as `invalid_response` and cost an extra call. The message sent back after a response that is not JSON now says that text meant for the user belongs in the `answer` of a `respond` action. It also reads `productInfo` when the user asks about the product or the company.
- The description of the package, the README and the docs index present `openloops` as the harness for building multitenant AI agents for your SaaS, where the model is the engine, `openloops` the chassis and your interface the body. The README no longer shows the `CustomerSupportLoop` and `CodeSpecialistLoop` examples, which the package does not ship, and links to the live demo at openloops.xyz.

## 0.8.1

### Added

- `setErrorReporter(callback)` in `openloops/common`, to receive the errors that the package catches and send them to the tool you use. The callback gets the error and `details`, with a `source` (`agent`, `mongo`, `automations` or `openloops`) and, when they exist, `code`, `chatId` and `userId`. It is global to the process, it is awaited, and an error in it is ignored. Read [reporting errors](docs/error-reporting.md) and the [example](examples/errors/error-reporting.ts).
- The `Agent` reports a failed run, an `onActivity` listener that throws, a guard that throws, and the traces or the failed state of the chat that it cannot save, and the automations runner reports the errors it catches (`sync`, `tick`, `run` and `onRunFinished`). Before, those only went to the log. A reporter also receives the failures of the model that are not a problem of yours, such as `LLM_RATE_LIMITED`: filter them by `code`.

### Changed

- The error that the secret manager throws when `SECRET_MANAGER_KEY` is missing now names that variable. It said `SSUID`.
- `migrateChatTitles` removes the HTML tags of the message it takes as a title, as the entities do with any text. Before, the title kept them.
- Reporting errors to Sentry with `SENTRY_DSN` is deprecated and will be removed in a future version. `@sentry/node` is no longer installed with the package: it is an optional peer dependency, loaded only when `SENTRY_DSN` is set and no reporter is registered, and the package no longer starts Sentry when it is imported. If you rely on `SENTRY_DSN`, install `@sentry/node` in your project, or move to `setErrorReporter`: read [moving from `SENTRY_DSN`](docs/error-reporting.md#moving-from-sentry_dsn). Registering a reporter turns the old path off.

## 0.8.0

This version removes `state.currentActivity` from the chat and needs a migration of the chats that were saved before. Follow the [migration steps](docs/chats.md#migrating-to-080) when you update.

### Added

- `status` in `listAutomationRunsByAutomation`, as `listAutomationRunsByUser` already had, so a page of runs is filtered before it is paginated.
- Four codes for the failures of the model, saved in `state.lastError.code` with their own message: `LLM_AUTH_FAILED`, `LLM_CONTEXT_TOO_LONG`, `LLM_CONTENT_FILTERED` and `LLM_INCOMPLETE_RESPONSE`. They used to end in `LLM_FAILED`, so a client that compared `lastError.code` with it to show a generic message must handle the new ones. The first three are not retryable. Read [agent](docs/agent.md#error-handling).
- `title` in `ChatProps`, a short text that names the chat. In an interactive run the `fast_responder` writes it in the first message of a chat that has none, in the language of the user, and it never replaces a title that exists. Rename a chat with `updateChat({ payload: { title } })` and remove the title with `unset: { title: '' }`. A chat that comes back without a title (the model returned nothing usable) is asked again in its next message. An autonomous run skips the `fast_responder`, so its chat has no title unless you set one. Read [chats](docs/chats.md#the-title).
- `migrateChatTitles(db, { dryRun })` in `openloops/db`, which gives each chat without a title its first message of the user, on one line and cut to 80 characters. It can be run again without changing anything. In a checkout of this repository: `yarn migrate:chat-titles --dry-run` and `yarn migrate:chat-titles`. **Run it once when you update from an earlier version**: read [the migration to 0.8.0](docs/chats.md#migrating-to-080).
- `select` in `listChatsByUser`, to get only some fields of each chat, such as `{ title: 1, updatedAt: 1 }` for a history list. Without it the chats come complete, as before. `search` still looks in the messages when they are not returned.

### Changed

- A paused run of an automation whose chat was deleted is closed as `failed` with the code `CHAT_DELETED`, when the runner syncs it, and the automation runs again on its next occurrence.
- `search` in `listChatsByUser` also matches the title of the chat, not only the content of its messages.
- The `fast_responder` skill is now 2.5.0 and returns an optional `title`, and the AgiLoop is now 1.10.0. The context that the loop sends to the skill has `needs_title: true` while the chat has no title.
- `sanitizeString`, which cleans every text field of the entities and the email of a user, no longer uses `sanitize-html`, so that package and its dependencies are gone. It still removes tags, scripts, styles and comments and keeps the text, but now `&` stays as it is (before it was saved as `&amp;`) HTML entities are no longer decoded (`&copy;` stays `&copy;`, before it became `©`), and a `<` or `>` that does not belong to a tag is saved as `&lt;` or `&gt;` (before the text that followed a lone `<` was lost). Values already saved do not change.
- `pino-pretty` moved from `dependencies` to `devDependencies`, so it is no longer installed with the package. The logger loads it only when `IS_LOCAL` is `true` or `NODE_ENV` is `development`, and falls back to plain JSON logs if it is not installed. If you want the colored logs in your own local environment, install it: `yarn add -D pino-pretty`.

### Removed

- `state.currentActivity`, deprecated since 0.3.0. `AgentStateProps` no longer has it, and `getChatById` no longer adds a generic word (`Thinking...`, `Cooking...`) to it while a run is `processing`. The helper `deprecatedActivity` is gone too. A client that polls the chat and reads that field gets nothing now: move it to [`agent.onActivity`](docs/agent.md#activity-updates), which tells the real activity of the run as it happens, and use `state.status` to know whether the run is in progress. The versions of your app that still poll the chat need to be updated before you update `openloops`. A chat saved before 0.3.0 can still carry the old field in the database, ignore it. `AgentState.setCurrentActivity` and `AgentState.currentActivity` stay as the in-memory value that feeds the listener, they are not saved.

## 0.7.6

### Changed

- The description of `fetchUrlTool` tells the model to prefer a source that returns plain text or JSON and needs no key, such as a public API it knows, over a regular web page, and to search when it knows none instead of guessing a URL.

## 0.7.4

### Added

- `fetchUrlTool` in `openloops/tools`, a basic `curl` for the model: GET to an `http` or `https` URL, HTML converted to text with no dependencies. It refuses private and internal addresses, has fixed limits and does not run JavaScript. Opt-in with `agent.addTool(fetchUrlTool)`. Read [tools](docs/tools.md#fetchurltool).

### Changed

- The `notice` of a tool now goes in every observation of its results, next to `output`, in the turns that follow and in failed calls too, so the model sees it as long as the content is in its context. Before, it only showed when a tool was described by `search_tools`, and a local tool never showed it. The agent saves it in the new `notice` field of `AgentAction` when it runs the tool, an action saved earlier has none. The AgiLoop is now 1.9.0. Read [tools](docs/tools.md#notice).
- The notice of the tools of external MCP servers, of `webSearchTool` and of `fetchUrlTool` is shorter, because it repeats in every observation.
- `webSearchTool` tells the model that its results are snippets that can be outdated and use many tokens, and to read a source it already knows first when it has a tool to read pages. It also carries a `notice`, because the results come from the internet.
- `CurrentUser.isFreePlan()` always returned `false`, now it is `true` for a user that is not premium.
- `login` and `issuePasswordResetToken` find the user whatever the case of the email or the username, and ignore spaces around it.

## 0.7.3

### Changed

- `autonomousToken` is only accepted by the internal MCP servers declared in code (`InternalMcp`). The stored ones (`createInternalMcp` and `updateInternalMcp`) no longer take it, so the token never goes in the database.

## 0.7.1

### Added

- **Internal MCP servers stored in the database**, managed from a back office. `createInternalMcp`, `updateInternalMcp`, `getInternalMcpById`, `listInternalMcps` and `deleteInternalMcp` in the new entry point `openloops/mcps/admin`, all for admins only. The agent loads the enabled ones in every run next to the ones declared in code, with the same rules: trusted, no manifest review, destructive tools still ask. `{{token}}` in a header uses the token of the run, a token written in the header is sent as it is. Read [MCP servers](docs/mcp-servers.md#internal-servers-stored-in-the-database).
- `internal` and `enabled` in `McpServerProps`. A record without them is a normal server, so no migration is needed.
- A unique index on the name of the internal servers: run `ensureIndexes`.
- `autonomousToken` in the internal MCP servers, declared in code (`InternalMcp`) or stored (`createInternalMcp` and `updateInternalMcp`). It is the token of a service account, used for `{{token}}` only in an autonomous run that brings no token for that server, and then the agent sends the id of the user in `X-User-Id`. An interactive run never uses it. It is temporary, until the integrations give the runner the token of the owner.
- `environment` in `McpServerProps`, an optional text for every MCP server, internal or not, to say which environment it belongs to. It is only a label. The functions of `openloops/mcps` and of `openloops/mcps/admin` accept it, and a blank text removes it.

### Changed

- The functions of `openloops/mcps` never see an internal server, not even for an admin, and ignore `internal` and `enabled` in the payload of a user.
- `listMcpServersByUser` failed because it sent no scope to the repository, now it lists the servers of the user.
- The connection errors of an internal server mask the values of its headers in the logs.

### Removed

- `INTERNAL_MCP_TOKEN` and the `serviceToken` parameter of `Agent.run`. Use `autonomousToken` in each internal MCP server.

## 0.7.0

This version breaks the API of the entities, of the repository, of the results of the use cases and of the authentication, and removes `tsyringe`. The tokens that 0.6 issued (logins and event automations) stop working: issue new ones. Read [authentication](docs/authentication.md). The parameters of the use cases do not change, except for `updateChat`, which accepts `unset`.

### Added

- **Sessions with refresh.** `refreshSession`, `logout` and `revokeUserSessions` in `openloops/authentication`, and the collection `refresh_tokens` (the index is created by `ensureIndexes`). The refresh token rotates in each use, a token that is used again after 10 seconds closes the whole session, and a session ends at 90 days at most (7 for an admin).
- **Password reset.** `issuePasswordResetToken` and `resetPassword` in `openloops/authentication`, and `changePassword` in `openloops/users`, which closes the other sessions. The package does not send the email, and does not limit the attempts: your backend does both.
- `verifySessionToken`, `signToken`, `verifyToken`, `TokenError` and the audiences, to read the tokens in your backend.
- `MongoRepository.patchOne`, `archiveByPatch` and `claimOne`. `patchOne` takes `set` and `unset` (paths with dots), stamps who and when, drops the paths of control of a user scope, never writes `_id`, `__v`, `createdAt` nor `createdBy`, and accepts `expectedVersion` to detect conflicts. `claimOne` gives back the document as it was before the change.
- `softDelete` accepts `unset`.
- `toPatch` and `entityPatch` in `@common/base/utils`: the first turns an object into `set` and `unset` (a `null` or a blank text removes the field), the second adds the `clearedFields` of an entity.
- `clearedFields` in `Chat`, `Automation` and `User`, for the fields that an entity removes from the stored document.
- `updateChat` accepts `unset`, with the paths to remove.

### Changed

- **One convention for every token.** They are signed with `HS256`, carry `iss: openloops`, an `aud` (`session`, `password-reset` or `automation-event`) and `sub`, and are refused if any of them is wrong. The tokens of event automations follow it too.
- **`login` gives `{ accessToken, refreshToken, expiresIn, refreshExpiresAt, user }`**, not `{ token, user }`. The access token lasts 1 hour for everyone. An unknown user and a wrong password fail with the same 401 (`{{invalid_credentials}}`), before it was 404 and 401.
- `revokeToken` answers `true` the first time and `false` if the `jti` was already revoked, and not the record.
- `updateUser` refuses a `password` (400): use `changePassword`.
- **The use cases and the functions of the services return the result itself, no longer `{ data }`.** `const { data } = await getChatById(...)` becomes `const chat = await getChatById(...)`. The lists return `{ items, hasMore }` (`hasMore` is always there), the functions that delete return the record, or `{ deletedCount }` on a hard delete, and `execute` does not return an `HttpError` anymore: it throws. `BaseUseCaseOutput` is gone. `Agent.run` and the tools are not affected, they still use `{ data, error }` and `{ data }`.
- A getter that finds nothing answers `null`, also `getChatById`, which answered `{}`.
- `BaseEntity` is the one with `toJSON` only. Its static `toDate` and `toNumber` are public, an invalid id, date or number is a 400 `HttpError` and not a plain `Error`, and `toText` answers `undefined` for a blank text (it answered `''`).
- The repositories save with `patchOne`, so a text that is blank inside a document is removed and not stored as `''`, and the inserts and the patches ignore the `undefined` values, also inside arrays.
- The use cases take their repositories as default parameters of the constructor (`new XUseCase(repository)` still works).

### Removed

- `tsyringe`, `reflect-metadata`, the `MaskInLogs` decorator and `BaseUseCaseOutput`.
- `toDocument`, `toFlatDocument`, `toUnset`, `unset`, `setId`, `setDefaults`, `stringify` and `clean` of `BaseEntity`, and the `Document` type.
- `MongoRepository.updateOne`, replaced by `patchOne`.

## 0.6.0

This version breaks the API of the use cases. The functions that read or write the records of a user need the `currentUser` or a `scope` (login, the tokens, the preview of runs, the events and the functions of the runner do not), creating a record takes its owner from the scope and not from the payload, and the ownership of the records is checked by the repository. Follow the [migration steps](docs/authorization.md#migrating-from-05) when you update.

### Added

- `Scope`, exported from `openloops/base`. Every repository receives one and filters by owner in the same query that reads or writes, so a record that is not the user's is answered as not found (a 404 `HttpError`, `{}` in `getChatById`, `null` in the other getters). `Scope.canView`, `canEdit` and `canManage` take the `currentUser`, `Scope.asAdmin` fails with 403 when the user is not an admin, and `Scope.system(reason)` is for workers and flows without a user.
- Every use case accepts `scope`, to override the one it builds from `currentUser`.
- The repository removes the fields of control (`ownerId`, `sharedWith`, `createdAt`, `createdBy`, `updatedAt`, `updatedBy`, `deletedAt`, `deletedBy`, `archivedAt`, `archivedBy`, `__v`, and `role`, `marketing.drawNumber` and `acquisition.referrerCode` in the users) from the payload of a user and fills them in itself. `createOne` returns the stored document, and there are `softDelete` and `createMany` with the same behavior.
- `docs/authorization.md`.

### Changed

- **Creating records.** `createChat`, `createMcpServer`, `createAutomation`, `createUser`, `createLLMCall`, `createAgentTask`, `createAgentAction`, `createAgentTraces` and `saveWorkspaceItem` set the owner and the author from the scope. A user scope ignores the `ownerId` and the other fields of control of the payload, and a record cannot be created without a `currentUser` or a `scope` (401). To create a record for another user, or without a user, pass `Scope.asAdmin(currentUser)` or `Scope.system(reason)`. See [creating records](docs/authorization.md#creating-records).
- `getAutomationById`, `listAutomationRunsByAutomation`, `startAutomationRun` and `runner.runNow` need the `currentUser` and only reach the automations of that user. `runner.runNow` also accepts `scope`.
- A call without `currentUser` and without `scope` fails with 401.
- `issueAutomationEventToken`, `revokeAutomationEventToken` and `rotateAutomationEventTokens` are for the owner, and an admin needs `Scope.asAdmin`. They answer 404, not 403, to anyone else.
- The hard delete is for `Scope.asAdmin` or `Scope.system`, and a user that asks for it gets 403.
- Updating or deleting a record that does not exist or is not the user's answers a 404 `HttpError` and not a generic error.
- `sharedWith` is a list of `{ userId, permission }`, where `permission` is `read`, `write` or `manage`, and not a list of ids. Nothing reads it yet.
- `createUser` creates the account with the scope you pass, and keeps `role`, the draw number and the referrer code only with a trusted scope.

### Removed

- The `sanitize` parameter of `createUser`.
- `setOwner`, `setCreatedBy`, `setUpdatedBy`, `setDeletedBy` and `setArchivedBy` of `BaseEntity`, and the `AdminOnly` and `OwnerOnly` decorators. The repository does that work.

## 0.5.0

This version breaks the shape of the automations. Follow the [migration steps](docs/automations.md#migrating-to-050) when you update.

### Added

- An automation can have a schedule and an event trigger at the same time. `triggers` is an object with the optional keys `schedule` and `event`, at least one of them, and never more than one of each type.
- Every trigger has its own `enabled`. `updateAutomation` merges the triggers key by key, adds a trigger by sending its key and removes it with `null`. The last trigger cannot be removed.
- `migrateAutomations` also moves `trigger` into `triggers` and replaces the index `enabled_1_nextRunAt_1`. Its report has a new `triggersMoved` count.
- The documentation of what `issueAutomationEventToken`, `revokeAutomationEventToken` and `rotateAutomationEventTokens` do and which of them changes `eventTokenVersion`.
- `AutomationPayload`, the type of the payload of `createAutomation` and `updateAutomation`, where a trigger can be sent partially (`event: {}`, `schedule: { enabled: false }`) or as `null` to remove it.
- Removing the event trigger counts as a rotation of its tokens, so the tokens issued before do not work again if an event is added later.

### Changed

- `trigger` is now `triggers`. The schedule is `triggers.schedule` with `enabled`, `recurrence`, `timezone` and `nextRunAt`, and the event is `triggers.event` with only `enabled`. The event trigger has no `timezone`. `tokenVersion` is now `eventTokenVersion`, a field of the automation that starts at 1 and only goes up, so it survives when the event trigger is removed.
- `enabled` and `nextRunAt` moved from the automation to the trigger they belong to. There is no switch for the whole automation, so pausing everything means turning off both triggers. `createAutomation` and `updateAutomation` fail when they receive `trigger` or `enabled`.
- Events are refused with the reason `disabled` when `triggers.event.enabled` is `false`, and the queued events of an automation without an enabled event trigger are skipped with the reason `The event trigger of the automation is turned off`.
- The runner gives the agent the timezone of the owner of the automation, taken from their preferences, and not the one of the trigger.
- The index of the automations is now `{ 'triggers.schedule.enabled': 1, 'triggers.schedule.nextRunAt': 1 }`. Run `ensureIndexes` or the migration.

### Removed

- The fields `trigger`, `enabled` and `nextRunAt` of the automation, and the possibility to keep one trigger only. There are no aliases.

## 0.4.4

### Fixed

- Claude models on Amazon Bedrock failed with `temperature may only be set to 1 when thinking is enabled`. The temperature is no longer sent to them when thinking is on. The rules live in `src/clients/llm/sampling-rules.ts`, one entry per provider and model, so another model that rejects the temperature is one more line.
- A provider error saying the temperature "may only" take some value is now seen as a rejected sampling parameter, so the existing retry without temperature also covers it.

## 0.4.3

### Added

- `search` in `listChatsByUser`: returns only the chats with a message whose content contains the text, ignoring case. The text is escaped, so it is matched literally and not as a regular expression.
- `escapeRegex` helper in `src/common/helpers`, now used by `listChatsByUser`, `searchWorkspaceItems` and the tool ranking instead of three copies of the same escape.

## 0.4.2

### Added

- `hasMore` in the output of every list use case that did not have it: `listChatsByProps`, `listUsersByProps`, `listLLMCallsByProps`, `listAgentTasksByChat`, `listAgentActionsByTask`, `listAgentTracesByChat`, `listWorkspaceItems`, `searchWorkspaceItems` and `listAllMcpServersByUser`. The last one is never paginated, so it is always `false`.
- `WorkspaceItemRepository.findManyPaginated`, which returns `{ items, hasMore }`. `findMany` is unchanged.

### Changed

- `findByProps` of the chat, LLM call, user, agent task, agent action and agent trace repositories now returns `{ items, hasMore }` instead of an array. Read `items` if you call them directly.

## 0.4.1

### Added

- `hasMore` in the output of `listChatsByUser`, `listMcpServersByUser`, `listAutomationsByUser`, `listAutomationRunsByUser` and `listAutomationRunsByAutomation`. It is `true` when there is a next page, so the client does not need to guess from the size of the last one. It is computed by reading one extra item, without a count query.
- `MongoRepository.findManyPaginated`, which returns `{ items, hasMore }`. `findMany` is unchanged.

## 0.4.0

This version breaks the API of the former agentic jobs. Follow the [migration steps](docs/automations.md#migrating-from-agentic-jobs) when you update.

### Added

- Automations with an event trigger: another system sends an event, it becomes a queued run with its payload, and the runner executes the events of an automation one at a time and in order. See [automations](docs/automations.md#events).
- Tokens for those events, signed and not stored, that can be issued again, revoked one by one or rotated all at once (`issueAutomationEventToken`, `revokeAutomationEventToken`, `rotateAutomationEventTokens`).
- `receiveAutomationEvent`, with idempotency keys, a limit on the payload and a limit on the queue (`AUTOMATIONS_MAX_QUEUED_RUNS`).
- `runner.wake()` to make the runner check right away.
- `revokeToken` and `isTokenRevoked` in `openloops/authentication`, over the new generic collection `revoked_tokens`.
- `migrateAutomations` in `openloops/db` and `yarn migrate:automations` to move the data of the former agentic jobs.

### Changed

- Agentic jobs are now automations. The import is `openloops/automations`, the collections are `automations` and `automation_runs`, the runs use `automationId` and the variables are `AUTOMATIONS_POLL_INTERVAL_MS` and `AUTOMATIONS_LEASE_MS`. The old variables are not read anymore.
- `recurrence` and `timezone` of an automation now live inside its `trigger`, which is either a `schedule` or an `event`. The type of the trigger cannot be changed after the automation is created.
- A run can now have the status `queued` and the trigger `event`, and keeps the `payload` and `idempotencyKey` of the event.
- `JWT_SECRET` is also needed to sign the tokens of event automations.

### Removed

- The `openloops/agentic-jobs` export and every name that had `AgenticJob` in it. There are no aliases.
