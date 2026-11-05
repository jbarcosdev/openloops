# Changelog

All notable changes to `openloops` are written here, newest first. The format follows [Keep a Changelog](https://keepachangelog.com) and the versions follow [semantic versioning](https://semver.org), where a minor version can still break the API while the package is in beta. Changes before 0.4.0 are not recorded here, see the commits and the tags.

## Unreleased

This version breaks the API of the internal MCP servers in automations. Before, the runner sent one token for the whole deployment, from `INTERNAL_MCP_TOKEN`. Now each internal server declares its own. To migrate: delete `INTERNAL_MCP_TOKEN` and, in each internal server that used `{{token}}` in automations, add `autonomousToken: process.env.<YOUR_VARIABLE>` with the token of the service account that it needs. Read [automations](docs/automations.md#internal-mcp-servers-in-an-automation).

### Added

- `fetchUrlTool` in `openloops/tools`, a basic `curl` for the model: GET to an `http` or `https` URL, HTML converted to text with no dependencies. It refuses private and internal addresses, has fixed limits and does not run JavaScript. Opt-in with `agent.addTool(fetchUrlTool)`. Read [tools](docs/tools.md#fetchurltool).
- **Internal MCP servers stored in the database**, managed from a back office. `createInternalMcp`, `updateInternalMcp`, `getInternalMcpById`, `listInternalMcps` and `deleteInternalMcp` in the new entry point `openloops/mcps/admin`, all for admins only. The agent loads the enabled ones in every run next to the ones declared in code, with the same rules: trusted, no manifest review, destructive tools still ask. `{{token}}` in a header uses the token of the run, a token written in the header is sent as it is. Read [MCP servers](docs/mcp-servers.md#internal-servers-stored-in-the-database).
- `internal` and `enabled` in `McpServerProps`. A record without them is a normal server, so no migration is needed.
- A unique index on the name of the internal servers: run `ensureIndexes`.
- `autonomousToken` in the internal MCP servers declared in code (`InternalMcp`), not in the stored ones. It is the token of a service account, used for `{{token}}` only in an autonomous run that brings no token for that server, and then the agent sends the id of the user in `X-User-Id`. An interactive run never uses it. It is temporary, until the integrations give the runner the token of the owner.
- `environment` in `McpServerProps`, an optional text for every MCP server, internal or not, to say which environment it belongs to. It is only a label. The functions of `openloops/mcps` and of `openloops/mcps/admin` accept it, and a blank text removes it.

### Removed

- `INTERNAL_MCP_TOKEN` and the `serviceToken` parameter of `Agent.run`. Use `autonomousToken` in each internal MCP server.

### Changed

- The `notice` of a tool now goes in every observation of its results, next to `output`, in the turns that follow and in failed calls too, so the model sees it as long as the content is in its context. Before, it only showed when a tool was described by `search_tools`, and a local tool never showed it. The agent saves it in the new `notice` field of `AgentAction` when it runs the tool, an action saved earlier has none. The AgiLoop is now 1.9.0. Read [tools](docs/tools.md#notice).
- The notice of the tools of external MCP servers, of `webSearchTool` and of `fetchUrlTool` is shorter, because it repeats in every observation.
- `webSearchTool` tells the model that its results are snippets that can be outdated and use many tokens, and to read a source it already knows first when it has a tool to read pages. It also carries a `notice`, because the results come from the internet.
- The functions of `openloops/mcps` never see an internal server, not even for an admin, and ignore `internal` and `enabled` in the payload of a user.
- `listMcpServersByUser` failed because it sent no scope to the repository, now it lists the servers of the user.
- The connection errors of an internal server mask the values of its headers in the logs.
- `CurrentUser.isFreePlan()` always returned `false`, now it is `true` for a user that is not premium.
- `login` and `issuePasswordResetToken` find the user whatever the case of the email or the username, and ignore spaces around it.

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
