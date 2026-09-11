# Server Command Center

## Purpose
Allows users to execute predefined server operations from the dashboard without SSH access.

## User Flow
1. Navigate to Server → Terminal/Commands
2. See commands filtered by what's installed on the server
3. Click "Run" on a command
4. If medium/high risk → confirmation modal
5. If parameterized → parameter input modal
6. See real-time output
7. View execution history

## Frontend Implementation
- Route: `src/routes/server-commands.$serverId.tsx`
- URL: `/server-commands/:serverId`
- Access: Server detail page → "Commands" button

## Backend Implementation
- Registry: `backend/src/commands/commandRegistry.ts` (35+ predefined commands)
- Service: `backend/src/commands/commandService.ts` (execution + history)
- Routes: `backend/src/commands/commandRoutes.ts`

## API Endpoints
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/commands/registry` | Full command catalog |
| GET | `/api/commands/registry/search?q=` | Search commands |
| GET | `/api/commands/servers/:id/available` | **Dynamic** — only shows commands for installed software |
| POST | `/api/commands/servers/:id/execute` | Execute a command |
| GET | `/api/commands/executions/:id` | Get execution result |
| GET | `/api/commands/servers/:id/history` | Execution history |

## Complete Execution Flow
```
UI "Run" button → POST /servers/:id/execute { commandId, params }
    → authenticate + requireServerOwnership middleware
    → RBAC check (MEMBER can only run LOW risk)
    → Concurrency check (one command per server)
    → commandRegistry lookup (whitelist)
    → resolveCommandString (substitute {params})
    → sendAgentCommand(serverId, {action:"exec", repository: command})
    → Agent executes via shell (whitelisted)
    → Result stored in usageRecord
    → Broadcast via SSE
    → Frontend polls /executions/:id until complete
```

## Security
- **Whitelist only:** Only commands from `commandRegistry.ts` can execute
- **Risk levels:** LOW (read), MEDIUM (restart), HIGH (destructive)
- **RBAC:** Members restricted to LOW risk only
- **Concurrency:** One active command per server
- **Timeout:** 5 minutes max
- **Audit:** Every execution logged with user, org, command, result
- **Parameters sanitized:** Substituted into predefined templates only

## Current Status: PARTIALLY IMPLEMENTED
- ✅ Registry with 35 commands
- ✅ Dynamic filtering by installed software
- ✅ RBAC enforcement
- ✅ Execution history
- ⚠️ Requires agent command server on port 9898 to be running
- ⚠️ Exit code -1 means agent unreachable (not a command failure)
