# Changelog

All notable changes to `openloops` are written here, newest first. The format follows [Keep a Changelog](https://keepachangelog.com) and the versions follow [semantic versioning](https://semver.org), where a minor version can still break the API while the package is in beta. Changes before 0.4.0 are not recorded here, see the commits and the tags.

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
