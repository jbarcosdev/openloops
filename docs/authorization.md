# Authorization

Every use case that reads or writes a record of a user checks who owns it. The check is not in a controller, it is in the repository, inside the same query that reads or writes the record, so it does not cost an extra read and cannot be forgotten.

## The scope

A `Scope` tells the repository on whose behalf it works. Use cases build one from the `currentUser` you pass:

| Scope | Used for | Reaches |
| --- | --- | --- |
| `Scope.canView(currentUser)` | Reading. | The records of the user. |
| `Scope.canEdit(currentUser)` | Creating and updating. | The records of the user. |
| `Scope.canManage(currentUser)` | Deleting, issuing and revoking tokens. | The records of the user. |
| `Scope.asAdmin(currentUser)` | Actions of an administrator. | Every record. It fails with 403 if the user is not an admin. |
| `Scope.system('reason')` | Workers, webhooks and flows without a user. | Every record. The reason is required. |

An admin does not get more access by being an admin. A use case called with an admin as `currentUser` still works on the records of that admin. To work on any record, build the scope yourself and pass it:

```typescript
import { Scope } from 'openloops/base'

await deleteChat({ id, currentUser, scope: Scope.asAdmin(currentUser) })
```

Every use case accepts `scope`. Use it only from code you wrote, never from a value that comes from a request.

## What changes in your endpoints

- A record that is not the user's is answered as if it did not exist. The functions that update or delete throw a 404 `HttpError` with the message `{{resource_not_found}}`, `getChatById` returns `{}` in `data`, and the other getters return `null` or throw the same 404. Nobody can learn that an id exists by getting a 403.
- A call without `currentUser` and without `scope` fails with 401, it does not read everything.
- You do not need to load the record to check `ownerId` before calling a function that takes an id.

## What the repository does with the fields of control

When a user writes, the repository removes `ownerId`, `sharedWith`, `createdAt`, `createdBy`, `updatedAt`, `updatedBy`, `deletedAt`, `deletedBy`, `archivedAt`, `archivedBy` and `__v` from the payload, and fills them in itself with the user of the scope. In the users collection it also removes `role`. A `system` or `admin` scope keeps the payload as it is, because the code that uses it is trusted.

So `createUser` no longer has `sanitize`. Pass the scope that says who is creating the account:

```typescript
await createUser({ payload, scope: Scope.system('sign up') })
```

## Sharing

`sharedWith` is a list of `{ userId, permission }` where `permission` is `read`, `write` or `manage`. Nothing reads it yet: while no one is shared, the three user scopes only reach the records of the owner.

## Migrating from 0.5

- Pass `currentUser` to `getAutomationById`, `listAutomationRunsByAutomation`, `startAutomationRun` and `runner.runNow`. They did not need it before.
- Replace `sanitize: false` in `createUser` with a `scope`, as shown above.
- Where an admin used to act on the record of another user, pass `scope: Scope.asAdmin(currentUser)`.
- `issueAutomationEventToken`, `revokeAutomationEventToken` and `rotateAutomationEventTokens` are for the owner. They used to accept an admin.
- Expect a 404 where you got a 403 for the records of other users, and remove the ownership checks you wrote before calling a function with an id.
- Hard delete is for `Scope.asAdmin` or `Scope.system` only.
- `BaseEntity` no longer has `setOwner`, `setCreatedBy`, `setUpdatedBy`, `setDeletedBy` or `setArchivedBy`, and the `AdminOnly` and `OwnerOnly` decorators are gone. The repository does that work.
- `sharedWith` is now a list of `{ userId, permission }` and not a list of ids.
