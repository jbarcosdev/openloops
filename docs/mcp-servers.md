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
| `environment` | Optional free text that says which environment the server belongs to (for example `staging` or `production`). It is only a label: the agent does not use it. A blank text removes it. |
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
    manifestHash: result.history[0].hash,
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

A server that cannot be reached after a few retries is reported as unavailable for that run and the others keep working. A tool that does not answer within `MCP_TOOL_TIMEOUT_MS` (60 seconds by default, restarted by progress notifications) fails without being repeated, and the model is told that the result is unknown. See [configuration](configuration.md#timeouts).

Connections are closed at the end of every turn, including when the turn fails.

## Internal MCP servers

An internal MCP server belongs to your solution, not to the user. The user never registers it and never sees it: they ask the agent for something, and the agent queries your own MCP server behind the scenes with the token of the user. It is declared in code, once, and it is not stored in the database.

```typescript
const agent = new Agent({
    loop: new AgiLoop(),
    internalMcps: [
        {
            name: 'budget',
            url: 'https://api.example.com/mcp',
            headers: {
                Authorization: 'Bearer {{token}}',
                'X-App': 'budget-agent',
            },
            autonomousToken: process.env.BUDGET_SERVICE_TOKEN,
        },
    ],
})

agent.addInternalMcp({ name: 'other', url: 'https://other.example.com/mcp' })

await agent.run({
    input: { message: 'how much did I spend on food this month?' },
    currentUser,
    mcpTokens: { budget: sessionToken },
})
```

- `name` and `url` are required, and the name must be unique among the internal servers. `headers` is optional.
- `{{token}}` in a header value is replaced with `mcpTokens[name]` of the run. A header without the placeholder is sent as written, so the other headers are plain strings. If no header uses `{{token}}`, the server needs no token.
- `autonomousToken` is optional. It is the token of a service account, used instead of `mcpTokens[name]` only in an [autonomous run](agent.md#autonomous-mode) that brings no token for that server, and then the agent also sends the id of the user in `X-User-Id`. An interactive run never uses it. See [automations](automations.md#internal-mcp-servers-in-an-automation).
- The token lives only in memory during the run. Do not put it in `options`, which is saved in the chat. It is masked in the connection errors the agent logs.
- It is trusted: no approval is asked, the manifest is not reviewed or stored, and its tools are not marked as written by a third party. The tools still follow the rules of the tool pipeline, so a tool with `destructiveHint` asks the user before it runs.
- If the token of a server is missing for a run, or it cannot be reached, the agent leaves it out for that run, writes a trace and a log, and tells the model that the source is unavailable, so it says it could not access that information. The run does not fail. It does not tell the user the details, only that the source was not reachable.
- If a server of the user has the same name as an internal one, the one of the user is ignored for that run, so nobody can impersonate an internal server.
- The tools are named `<name>__<tool>`, like any other MCP tool.

In an automation there is no session of the user, so there is no token of theirs. See [automations](automations.md#internal-mcp-servers-in-an-automation).

### Internal servers stored in the database

You can also manage the internal servers from a back office, without a deploy. They are stored in the same collection as the servers of the users, with `internal: true`, and the agent loads the enabled ones at the start of every run next to the ones declared in code. They behave the same way: trusted, no manifest review, no history, no notice of third party, destructive tools still ask.

They live in their own entry point, so the screens of the users never import them:

```typescript
import {
    createInternalMcp,
    updateInternalMcp,
    getInternalMcpById,
    listInternalMcps,
    deleteInternalMcp,
} from 'openloops/mcps/admin'

const mcp = await createInternalMcp({
    payload: {
        name: 'budget',
        url: 'https://api.example.com/mcp',
        headers: { Authorization: 'Bearer {{token}}' },
    },
    currentUser: admin,
})

await updateInternalMcp({ id: mcp._id, payload: { enabled: false, __v: mcp.__v }, currentUser: admin })
```

- Every function needs an admin as `currentUser` and answers 403 otherwise. The sub-route separates the code, the permission is what protects it.
- `name` and `url` are required, `type` is always `http`, `environment` and `autonomousToken` are optional and `enabled` defaults to `true`. A disabled server is not loaded. The name must be unique among the internal servers (409).
- A header with `{{token}}` works as in the declared ones: it uses `mcpTokens[name]` of the run, or the service token in an automation. A header with the token written in it (`Bearer eyj...`) is sent as it is and needs nothing from the run.
- Deleting is permanent. Internal servers have no owner, so they are not listed to any user.
- The normal functions (`getMcpServerById`, `updateMcpServer`, `deleteMcpServer`, `decideMcpServerTrust`, and the lists) never see them, not even for an admin, and `internal` and `enabled` in the payload of a user are ignored.
- If a server declared in code has the same name, the one in code wins. A server of a user with the same name as an internal one is ignored for that run.
- `headers` and `autonomousToken` are stored as written, like the headers of the servers of the users. Mask them in your controller before sending a record to a client.
- Run `ensureIndexes` after updating: it adds the unique index of the names of the internal servers.

## Tools of MCP servers

Their names are prefixed with the server name, and they are marked as external so the model treats their descriptions as data. A tool is destructive when the server marks it with `destructiveHint`. A tool without that annotation is not treated as destructive, so rely on the server's approval and on your own review of what the server exposes.
