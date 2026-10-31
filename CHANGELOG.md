# Changelog

All notable changes to `openloops` are written here, newest first. The format follows [Keep a Changelog](https://keepachangelog.com) and the versions follow [semantic versioning](https://semver.org), where a minor version can still break the API while the package is in beta. Changes before 0.4.0 are not recorded here, see the commits and the tags.

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
