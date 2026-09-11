# Server Management

## Purpose
Core system for connecting, monitoring, and managing servers (VPS, cloud instances, dedicated servers).

## User Flow
1. User creates a server entry (name + host)
2. Receives agent token + install command
3. Runs install command on their server
4. Agent connects, sends heartbeat + metrics
5. Server appears as "Online" in dashboard
6. User views CPU/RAM/Disk/processes/containers in real-time

## Frontend Implementation
- Server list: `src/routes/servers.index.tsx`
- Server detail: `src/routes/servers.$serverId.tsx`
- Infrastructure view: `src/routes/infrastructure.tsx`

## Backend Implementation
- Service: `backend/src/servers/serverService.ts`
- Controller: `backend/src/controllers/serverController.ts`
- Routes: `backend/src/routes/serverRoutes.ts`
- SSE: `backend/src/servers/serverSSE.ts`
- Health: `backend/src/servers/healthService.ts`
- Agent push: `backend/src/controllers/agentPushController.ts`

## Database Models
- `Server` — id, name, host, provider, agentToken, status, userId, organizationId
- `ServerMetric` — CPU, RAM, Disk, Network, Load (time-series)
- `ServerHeartbeat` — timestamp, agentVersion, IP
- `ServerApp` — detected processes/containers
- `ServerLog` — collected application logs

## Key Functions
- `computeLiveStatus(lastHeartbeat)` — derives online/offline/degraded from timestamp
- `computeHealthScore(metric, status, lastHeartbeat)` — weighted 0-100 score
- `getAllServers(userId)` — returns servers from user's organizations
- `requireServerOwnership` — checks userId OR org membership

## Current Status: IMPLEMENTED
- ✅ Server CRUD with organization scoping
- ✅ Agent token generation + registration
- ✅ Real-time heartbeat-based status
- ✅ Real-time metric streaming (SSE)
- ✅ Health score calculation
- ✅ Process/container detection
- ✅ Server delete with cascade
- ✅ Multi-org access (team members can see shared servers)
