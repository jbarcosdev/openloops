# User management

`openloops` includes its own user management, so you don't need to build a parallel system just to have an identity to hand the `Agent`.

```typescript
import { createUser, getUserById, updateUser, deleteUser } from 'openloops/users'
import { CurrentUser } from 'openloops/base'
```

## `CurrentUser`

Every call into `openloops`, whether running an agent, managing MCP servers, or checking usage, needs a `CurrentUser`. Build one from a stored user id:

```typescript
const currentUser = await CurrentUser.asyncFromDB(userId)
```

## Creating a user

```typescript
const result = await createUser({
    payload: {
        firstName: 'Jose',
        lastName: 'Barcos',
        email: 'jose@openloops.xyz',
        password: 'a-real-password',
    },
})
```

Passwords are hashed before being stored. You never handle a plaintext password again after this call.

## Getting a user

```typescript
const result = await getUserById({
    id: userId,
    currentUser,
})
```

The returned user never includes the password field.

## Updating a user

```typescript
const result = await updateUser({
    id: userId,
    payload: {
        firstName: 'Jose',
        lastName: 'Developer',
    },
    currentUser,
})
```

## Deleting a user

```typescript
// Soft delete
await deleteUser({
    id: userId,
    accountDeletionReason: 'User requested account closure', // optional
    currentUser,
})

// Hard delete, admins only, permanently removes the record
await deleteUser({
    id: userId,
    accountDeletionReason: 'GDPR request',
    hardDelete: true,
    currentUser,
})
```
