# MCP servers

Each user can register their own [MCP](https://modelcontextprotocol.io) servers. `openloops` connects to them when the agent needs them and converts their tools into regular `Tool` instances. Your loop never needs to know MCP exists.

MCP servers are third parties and can change their tools at any time, so every server goes through a trust flow before the agent is allowed to run any of its tools. Trust is per user: a server that one user approves is not approved for anyone else.

```typescript
import {
    createMcpServer,
    getMcpServerById,
    listMcpServersByUser,
    listAllMcpServersByUser,
    updateMcpServer,
    deleteMcpServer,
    verifyMcpServerConnection,
    decideMcpServerTrust,
} from 'openloops/mcps'
```

## Registering a server

```typescript
const result = await createMcpServer({
    payload: {
        name: 'my-mcp',
        type: 'http',
        url: 'https://example.dev/api/mcp',
        headers: {
            Authorization: 'Bearer ...',
        },
    },
    currentUser,
})
```

Only `type: 'http'` is supported. `stdio` (which would mean running an arbitrary local process on your server) is intentionally not allowed.

`headers` is a plain key-value map, so you're not limited to `Authorization`.

Creating a server connects to it once to read its manifest (tools and instructions) and returns the result of that check. The new server starts as `locked`: nothing runs until the user approves it.

## The server record

| Field | Meaning |
| --- | --- |
| `name`, `url`, `type`, `headers` | What you registered. |
| `trust` | `locked` (never approved, also the value of old records without one), `approved` or `blocked`. |
| `approvedHash` | Hash of the manifest the user approved. |
| `history` | The last 5 manifests the server has shown, newest first. The approved one is never dropped. |
| `status` | `ok`, `error` or `unknown`, from the last connection check. Use it for a green or red dot. |
| `lastError` | Sanitized message of the last failed check, without header values or the url. |

The latest manifest is `history[0]`. The approved manifest is the entry of `history` whose hash equals `approvedHash`. What changed between them is computed when it is needed and is never stored.

`headers` and `history` are returned as they are stored. If your API exposes these records to a client, mask the header values and leave out `history` in your controller.

## Listing a user's servers

```typescript
const page = await listMcpServersByUser({
    options: { page: 1, limit: 10 },
    currentUser,
})

const all = await listAllMcpServersByUser({ currentUser })
```

`listMcpServersByUser` is paginated (page 1, 10 per page by default) and sorted by last update, newest first. Use it for a management screen.

`listAllMcpServersByUser` returns every server of the user, oldest first. This is what the agent uses, so a user can have any number of servers.

## Getting one by id

```typescript
const result = await getMcpServerById({ id: mcpServerId, currentUser })
```

## Updating a server

```typescript
const result = await updateMcpServer({
    id: mcpServerId,
    payload: {
        name: 'my-mcp-updated',
        headers: { Authorization: 'Bearer <new-token>' },
        __v: current.__v,
    },
    currentUser,
})
```

- `trust`, `approvedHash`, `status`, `lastError` and `history` in the payload are ignored. They only change through the trust decision and the connection check, so you can send a whole record back without overwriting an approval.
- Changing `url` or `type` locks the server again (`trust` is `locked` and `approvedHash` is cleared) and checks the connection. The history is kept for traceability.
- Changing `headers` checks the connection again and keeps the approval. If the server answers with a different manifest, the agent treats it as a change and asks.
- If you send `__v` and the record was modified in the meantime, the update fails with a `VersionConflictError` (code `VERSION_CONFLICT`, status 409). Reload and try again.

## Deleting a server

```typescript
await deleteMcpServer({ id: mcpServerId, currentUser })

await deleteMcpServer({ id: mcpServerId, hardDelete: true, currentUser })
```

The first one is a soft delete. A hard delete is for admins only.

## Checking the connection

```typescript
const result = await verifyMcpServerConnection({ id: mcpServerId, currentUser })
```

Connects, reads the manifest and stores it in `history` if it is new, or stores a sanitized error and `status: 'error'`. The agent calls it by itself when it sees that a server changed. You can call it from a "test connection" button.

## Approving or blocking a server

```typescript
await decideMcpServerTrust({
    id: mcpServerId,
    decision: 'approve',
    manifestHash: result.data.history[0].hash,
    currentUser,
})

await decideMcpServerTrust({ id: mcpServerId, decision: 'block', currentUser })
```

- Approving requires the hash of the manifest the user reviewed, and it must be the latest one in `history`. If the server changed since the user looked at it, the call fails and the user has to review again.
- A blocked server can be approved again the same way, which unblocks it.
- The agent makes the same call when the user answers yes or no in the chat, so a screen in your app and the chat are two ways of reaching the same decision.

## How the agent uses the servers

1. At the start of a turn the model sees an index of the user's servers: `name`, an optional `description` (the server's instructions, truncated) and a `state`: `approved`, `not_approved` or `blocked`. Nothing is connected yet.
2. When the model needs a capability, it lists the tools of a server with `search_tools` (with the `server` argument) or searches across all of them. Listing needs no approval. A blocked server cannot be listed.
3. The agent connects to a server the first time it is needed in a run. It compares the manifest the server shows now with the approved one and stores it if it is new.
4. Approval is asked when a tool is about to run, never before:
   - First use of a server: always asks.
   - The server changed after being approved: asks if a tool was added, a parameter or annotation changed, or the instructions changed. A review skill decides the harmless cases (a description rewritten, a tool removed) and approves them on behalf of the user. With `strictMode: true` it always asks.
5. The question is written from what changed, not from the whole server. A yes approves the manifest the user was shown, once per server and version, not once per tool. A no blocks the server.

A server that cannot be reached after a few retries is reported as unavailable for that run and the others keep working.

Connections are closed at the end of every turn, including when the turn fails.

## Tools of MCP servers

Their names are prefixed with the server name, and they are marked as external so the model treats their descriptions as data. A tool is destructive when the server marks it with `destructiveHint`. A tool without that annotation is not treated as destructive, so rely on the server's approval and on your own review of what the server exposes.
