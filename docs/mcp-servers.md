# MCP servers

Each user can register their own [MCP](https://modelcontextprotocol.io) servers. `openloops` connects to every registered server automatically at the start of each turn and converts its tools into regular `Tool` instances. Your loop never needs to know MCP exists.

```typescript
import { createMcpServer, deleteMcpServer, getMcpServerById, listMcpServersByUser, updateMcpServer } from 'openloops/mcps'
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

`headers` is a plain key-value map, so you're not limited to `Authorization`. Pass whatever headers the server you're connecting to requires.

## Listing a user's servers

```typescript
const result = await listMcpServersByUser({
    options: {
        page: 1,
        limit: 10,
        sortBy: { createdAt: -1 },
    },
    currentUser,
})
```

## Getting one by id

```typescript
const result = await getMcpServerById({
    id: mcpServerId,
    currentUser,
})
```

## Updating a server

```typescript
const result = await updateMcpServer({
    id: mcpServerId,
    payload: {
        name: 'my-mcp-updated',
        headers: { Authorization: 'Bearer <new-token>' },
    },
    currentUser,
})
```

## Deleting a server

```typescript
// Soft delete
await deleteMcpServer({ id: mcpServerId, currentUser })

// Hard delete, admins only
await deleteMcpServer({ id: mcpServerId, hardDelete: true, currentUser })
```

## How connection and tool discovery works

You never call `connect()` yourself. At the start of every `agent.run()`, `openloops`:

1. Looks up every MCP server registered to `currentUser`.
2. Connects to each one and lists its tools.
3. Wraps each tool as a `Tool` instance, namespaced by the server's name (e.g. `my-mcp__search`) so tools with the same name from different servers never collide.
4. Adds them to `agent.tools` for the rest of the turn.
5. Disconnects every session at the end of the turn, including if the turn fails.

If a server fails to connect, that one server's tools are simply unavailable for the turn. It doesn't fail the whole run.

Tools that don't declare an explicit `destructive` annotation are treated as destructive by default, so an unfamiliar tool from a third-party server always asks for confirmation before running rather than acting silently.
