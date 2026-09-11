# Workflow: Executing Server Commands

## Prerequisites
- Server connected with agent online
- Agent command server reachable on port 9898
- User has appropriate role (MEMBER = low-risk only, ADMIN/OWNER = all)

## Complete Flow

```
User navigates to /server-commands/:serverId
    → GET /api/commands/servers/:id/available
    → Backend detects installed software (from ServerApp + UsageRecord)
    → Returns ONLY commands relevant to this server
    → Frontend renders categorized command list

User clicks "Run" on "docker ps"
    → If requiresConfirmation: show confirm dialog
    → If has params: show parameter input modal
    → POST /api/commands/servers/:id/execute { commandId:"docker-ps", params:{} }
    → authenticate + requireServerOwnership
    → RBAC check (MEMBER restricted to LOW risk)
    → Concurrency check (one command per server at a time)
    → commandRegistry lookup → get predefined command template
    → resolveCommandString() → substitute parameters
    → sendAgentCommand(serverId, {action:"exec", repository:"docker ps ..."})
    → Agent executes command (whitelisted)
    → Result: {exitCode, stdout, stderr, durationMs}
    → Store in usageRecord
    → Broadcast via SSE
    → Frontend polls /executions/:id until complete
    → Display output in console panel
```

## Dynamic Command Filtering

Commands shown are based on what's detected on the server:
- Agent reports processes (node, nginx, redis...) → related commands appear
- Software installed via marketplace → related commands appear
- System commands ALWAYS appear (CPU, memory, disk, etc.)

## Risk Levels

| Level | Examples | Who can run | Confirmation |
|-------|----------|-------------|--------------|
| LOW | docker ps, df -h, uptime | Everyone | No |
| MEDIUM | restart nginx, docker restart | ADMIN, OWNER | Yes |
| HIGH | docker prune, delete data | OWNER only | Yes |

## Security Boundaries
1. Only commands from `commandRegistry.ts` can execute (35 predefined)
2. Parameters are substituted into templates — no shell injection possible
3. One command at a time per server (prevents resource conflicts)
4. 5 minute timeout (kill after)
5. Every execution audit-logged

## Files Involved
- Frontend: `src/routes/server-commands.$serverId.tsx`
- Registry: `backend/src/commands/commandRegistry.ts`
- Service: `backend/src/commands/commandService.ts`
- Routes: `backend/src/commands/commandRoutes.ts`
- Agent client: `backend/src/deployment/agentClient.ts`
