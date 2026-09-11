# System Architecture

## High-Level Overview

```mermaid
flowchart TD
    User[User Browser] --> Frontend[Frontend - React/TanStack]
    Frontend --> |REST API + SSE| Backend[Backend - Express.js]
    Backend --> PostgreSQL[(PostgreSQL)]
    Backend --> Redis[(Redis/BullMQ)]
    Backend --> ChromaDB[(ChromaDB - RAG)]
    Backend --> |HTTP :9898| AgentClient[Agent Client]
    AgentClient --> |Endpoint Resolution| Agent[Unwire Agent]
    Agent --> Server[Customer VPS/Server]
    Agent --> |Heartbeat/Metrics| Backend
```

## Request Flow

```
Browser → Frontend (TanStack Router)
    → apiFetch() [src/services/api.ts]
    → Authorization header + X-Organization-Id header
    → Express middleware chain:
        → requestId → requestLogger → globalLimiter → optionalAuth
        → route-specific: authenticate → withOrgContext → validate → requireOwnership
    → Controller (validates, delegates)
    → Service (business logic)
    → Prisma (database) / AgentClient (server) / External APIs
    → Response { success: true/false, data/error }
    → Frontend state update
```

## Authentication Flow

```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend
    participant B as Backend
    participant DB as Database

    U->>F: Login (email + password)
    F->>B: POST /api/auth/login
    B->>DB: Find user, verify bcrypt hash
    B-->>F: { accessToken (15min), refreshToken (30d) }
    F->>F: Store tokens in localStorage
    
    Note over F,B: On 401 response:
    F->>B: POST /api/auth/refresh (mutex-protected)
    B->>DB: Atomic transaction: find → delete → create session
    B-->>F: New token pair
```

## Server Connection Flow

```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend
    participant B as Backend
    participant A as Agent
    participant S as Server

    U->>F: Add Server (name, host)
    F->>B: POST /api/servers (generates agentToken)
    B-->>F: { serverId, agentToken }
    F->>U: Show install command
    
    U->>S: Paste install command
    S->>S: Install agent binary + systemd service
    A->>B: POST /api/agent-push/register (token)
    B-->>A: { serverId }
    
    loop Every 15 seconds
        A->>B: POST /api/servers/:id/heartbeat
        A->>B: POST /api/servers/:id/metrics
        A->>B: POST /api/agent-push/:id/processes
    end
    
    B->>F: SSE event (metric/heartbeat/status)
    F->>F: Update UI in real-time
```

## Deployment Flow

```mermaid
sequenceDiagram
    participant F as Frontend
    participant B as Backend
    participant Q as BullMQ
    participant AC as AgentClient
    participant A as Agent

    F->>B: POST /api/deployments
    B->>Q: Enqueue DEPLOY_PROJECT job
    Q->>B: Worker picks up job
    
    B->>AC: checkAgentReady(serverId)
    AC->>A: GET :9898/health
    A-->>AC: OK
    
    B->>AC: sendAgentCommand(clone)
    AC->>A: POST :9898/deploy {action:"clone"}
    A->>A: git clone repository
    A-->>AC: {exitCode:0, stdout:"..."}
    
    B->>AC: sendAgentCommand(build)
    AC->>A: POST :9898/deploy {action:"build"}
    A->>A: docker build
    A-->>AC: {exitCode:0}
    
    B->>AC: sendAgentCommand(deploy)
    AC->>A: POST :9898/deploy {action:"deploy"}
    A->>A: docker run (blue-green)
    
    B->>AC: sendAgentCommand(healthcheck)
    AC->>A: POST :9898/deploy {action:"healthcheck"}
    A->>A: curl localhost:port/health
    A-->>AC: {exitCode:0}
    
    B->>B: Mark deployment SUCCESS
    B->>F: SSE update
```

## Command Execution Flow

```
Frontend: User clicks "Run" on a command
    → POST /api/commands/servers/:id/execute { commandId, params }
    → commandService.executeCommand()
    → Lookup command in commandRegistry.ts (whitelist only)
    → resolveCommandString() with parameters
    → sendAgentCommand(serverId, {action:"exec", repository: command})
    → Agent: exec(command) with timeout
    → Result: {exitCode, stdout, stderr, durationMs}
    → Store in usageRecord
    → Broadcast via SSE
    → Frontend polls for result
```

## Agent Endpoint Resolution

The backend's `agentClient.ts` resolves where to reach the agent:

```
1. If server.host is "host.docker.internal" → try 127.0.0.1
2. If server.host is a real IP → try it directly
3. Always try 127.0.0.1 as fallback (for local dev with exposed ports)
4. Try last heartbeat IP (address agent connected FROM)
5. Each candidate gets a 1.5s health probe (GET :9898/health)
6. First responding address is used
```

## Database Schema (Key Models)

- **User** — auth, profile, org memberships
- **Organization** — multi-tenancy boundary
- **OrganizationMember** — role-based access
- **Server** — connected servers with agentToken
- **ServerMetric** — time-series CPU/RAM/Disk/Network
- **ServerHeartbeat** — agent liveness tracking
- **ServerApp** — detected processes/containers
- **ServerLog** — collected log entries
- **Deployment** — deployment runs with steps and logs
- **Project** — analyzed codebases
- **InfraConnection** — cloud provider credentials (encrypted)
- **CloudResource** — discovered cloud resources
- **Alert/Incident** — monitoring alerts
- **Subscription** — billing plan management
- **UsageRecord** — tracks AI usage, command history, software installs
