# Workflow: Adding a Server

## Complete Flow

```
User clicks "Add Server"
    → Frontend: createServer({ name, host, provider, region })
    → POST /api/servers (with org context)
    → Backend: serverService.createServer() generates UUID agentToken
    → Returns: { id, agentToken, ... }
    → Frontend shows install command with token + backend URL
    → User copies command to VPS terminal
    → Installer script runs:
        1. Detects OS/architecture
        2. Downloads agent binary (or uses Node.js fallback)
        3. Writes config to /etc/unwire-agent/config.json
        4. Registers with backend (POST /api/agent-push/register)
        5. Creates systemd service
        6. Starts service
        7. Sends first heartbeat
    → Backend receives heartbeat → creates ServerHeartbeat record
    → Frontend polls/SSE detects connection
    → UI transitions: "Waiting..." → "Connected ✓"
```

## Files Involved
- Frontend: `src/routes/infrastructure.tsx` (AddServerModal, AgentTokenStep)
- Backend route: `backend/src/routes/serverRoutes.ts` (POST /)
- Backend service: `backend/src/servers/serverService.ts` (createServer)
- Installer: `backend/src/installer/installerScript.ts`
- Agent registration: `backend/src/controllers/agentPushController.ts`
- Heartbeat: `backend/src/controllers/serverController.ts` (pushHeartbeat)

## Verification Points
1. Server record exists in DB with agentToken
2. After agent runs: ServerHeartbeat record exists
3. computeLiveStatus() returns "online"
4. Frontend shows green status without refresh (SSE or polling)
