# Unwire AI Agent

## Overview
Lightweight monitoring and execution agent installed on customer servers. Collects metrics, detects processes/containers, streams logs, and executes deployment/command operations.

## Two Agent Implementations

### 1. Production Agent (Go)
- Location: `agent/` directory
- Language: Go 1.22
- Status: **Source exists but binary not compiled** (needs `go mod tidy` + `go build`)
- Features: Metrics via gopsutil, Docker discovery via HTTP API, command execution with whitelist

### 2. Test Agent (Node.js)
- Location: `unwire-ai-test-environment/test-server/agent/unwire-agent.js`
- Language: Node.js
- Status: **FUNCTIONAL** in Docker test environment
- Features: Metrics, heartbeat, process detection, Docker detection, HTTP command server on :9898

## Agent Responsibilities

| Function | Direction | Endpoint |
|----------|-----------|----------|
| Registration | Agent → Backend | POST `/api/agent-push/register` |
| Heartbeat | Agent → Backend | POST `/api/servers/:id/heartbeat` |
| Metrics | Agent → Backend | POST `/api/servers/:id/metrics` |
| Processes | Agent → Backend | POST `/api/agent-push/:id/processes` |
| Docker | Agent → Backend | POST `/api/agent-push/:id/docker` |
| Logs | Agent → Backend | POST `/api/servers/:id/logs` |
| Commands | Backend → Agent | POST `http://agent:9898/deploy` |
| Health check | Backend → Agent | GET `http://agent:9898/health` |

## Agent HTTP Server (Port 9898)

The agent runs a small HTTP server that accepts commands from the backend:

```
GET  /health  → { status: "ok", version: "1.0.0" }
POST /deploy  → Execute deployment/command action
```

### Request format for /deploy:
```json
{
  "deploymentId": "uuid",
  "action": "exec|clone|build|deploy|healthcheck|stop|rollback",
  "repository": "command string (for exec action)",
  "appName": "identifier",
  "timeout": 300
}
```

### Response:
```json
{
  "exitCode": 0,
  "stdout": "...",
  "stderr": "...",
  "durationMs": 1234
}
```

## Authentication
- Agent authenticates to backend using `Authorization: Bearer <agentToken>`
- Backend authenticates to agent using same token in Authorization header
- Token is a UUID generated when server is created

## Installation
The production installer (`GET /install.sh`) handles:
1. OS/architecture detection
2. Binary download (or Node.js fallback)
3. Config file creation (`/etc/unwire-agent/config.json`)
4. Registration with backend
5. Systemd service installation
6. Service start + verification

One-line command:
```bash
curl -fsSL http://<backend>/install.sh | bash -s -- --token <TOKEN> --server http://<backend>
```

## Configuration File
Location: `/etc/unwire-agent/config.json`
```json
{
  "token": "agent-uuid-token",
  "serverUrl": "http://backend:5000",
  "serverId": "assigned-on-registration",
  "intervalSeconds": 15
}
```

## Critical Note
The agent command server on port 9898 is **required** for:
- Deployments
- Software installation
- Command Center execution

If only heartbeat/metrics work but commands fail with "exit code -1", it means port 9898 is not accessible from the backend.
