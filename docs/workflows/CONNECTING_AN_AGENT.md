# Workflow: Connecting an Agent

## One-Line Install Command

```bash
curl -fsSL http://<backend>/install.sh | bash -s -- --token <TOKEN> --server http://<backend>
```

## What the Installer Does

1. **Parse arguments** — `--token` and `--server` from command line
2. **Check root** — uses sudo if not root
3. **Detect OS/arch** — `uname -s` + `uname -m` (linux/darwin, amd64/arm64)
4. **Install dependencies** — curl if missing (apt/yum/dnf)
5. **Download agent** — tries binary from backend, falls back to Node.js agent
6. **Write config** — `/etc/unwire-agent/config.json` with token + server URL
7. **Register** — POST /api/agent-push/register (gets serverId)
8. **Create systemd service** — `unwire-agent.service` with auto-restart
9. **Enable + start** — `systemctl enable && start`
10. **Verify** — checks service is active
11. **Send first heartbeat** — immediate online signal

## Agent Registration

```
POST /api/agent-push/register
Headers: Authorization: Bearer <agentToken>
Body: { hostname, os, arch, version }
Response: { serverId, serverName, message }
```

The backend finds the server record by its unique `agentToken`, updates status to "online", records a heartbeat, and returns the serverId.

## After Connection

The agent runs a loop (every 15 seconds):
1. Send heartbeat → `POST /api/servers/:id/heartbeat`
2. Send metrics → `POST /api/servers/:id/metrics`
3. Send processes → `POST /api/agent-push/:id/processes`
4. Send Docker containers → `POST /api/agent-push/:id/docker`

Simultaneously, the agent's HTTP server listens on port 9898 for incoming commands from the backend.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Server shows "Waiting..." | Agent not started or wrong token | Check `systemctl status unwire-agent` |
| Server shows "Online" but commands fail | Port 9898 not accessible | Check firewall, ensure agent has command server |
| Heartbeat works but metrics empty | Agent metrics collection failing | Check agent logs: `journalctl -u unwire-agent` |
| "Agent unreachable" on deploy | Backend can't reach agent:9898 | Check `API_PUBLIC_URL`, network path |

## Files Involved
- Installer generator: `backend/src/installer/installerScript.ts`
- Installer routes: `backend/src/installer/installerRoutes.ts`
- Agent registration: `backend/src/controllers/agentPushController.ts`
- Agent (Go): `agent/main.go` + `agent/internal/`
- Agent (test): `unwire-ai-test-environment/test-server/agent/unwire-agent.js`
