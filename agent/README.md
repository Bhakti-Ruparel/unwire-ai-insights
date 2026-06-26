# Unwire AI Server Agent

Lightweight server monitoring agent written in Go. Collects system metrics, discovers running processes and Docker containers, streams logs, and pushes everything to the Unwire AI backend.

## Features

- **System Metrics** — CPU, RAM, Disk, Network, Load Average (every 30s)
- **Heartbeat** — Online/offline detection (5-minute timeout)
- **Process Discovery** — Detects known services (Node.js, Python, Nginx, PostgreSQL, Redis, etc.)
- **Docker Discovery** — Lists containers with CPU/RAM usage
- **Log Streaming** — Reads system and application logs (batched, rate-limited)
- **Agent Token Auth** — Secure per-server token authentication
- **Cross-platform** — Linux (amd64/arm64), macOS, Windows

## Quick Start

```bash
# Install
curl -fsSL https://get.unwire.ai/agent | bash

# Configure
unwire-agent configure --token YOUR_TOKEN --server https://api.unwire.ai

# Start
unwire-agent start
```

## Build from Source

```bash
# Requires Go 1.22+
cd agent
go build -o unwire-agent .

# Cross-compile all platforms
make all
```

## Configuration

Configuration is stored at `/etc/unwire-agent/config.json` (Linux/macOS) or `%ProgramData%\unwire-agent\config.json` (Windows).

```json
{
  "token": "your-agent-token",
  "serverUrl": "https://api.unwire.ai",
  "serverId": "auto-assigned-on-first-connect",
  "intervalSeconds": 30
}
```

## Systemd Service

```bash
sudo systemctl enable unwire-agent
sudo systemctl start unwire-agent
sudo systemctl status unwire-agent

# View logs
journalctl -u unwire-agent -f
```

## Architecture

```
unwire-agent
├── main.go                    # Entry point (configure/start/run)
├── internal/
│   ├── config/config.go       # Configuration management
│   ├── collector/
│   │   ├── collector.go       # Main collection loop
│   │   ├── metrics/           # CPU, RAM, Disk, Network via gopsutil
│   │   ├── processes/         # Process discovery (known services)
│   │   ├── docker/            # Docker container discovery via API
│   │   └── logs/              # Log file reading (batched)
│   └── sender/sender.go       # HTTP client to Unwire AI backend
├── scripts/install.sh         # Curl-installable script
├── Dockerfile                 # Container build
└── Makefile                   # Cross-compilation
```

## API Endpoints Used

| Method | Path | Purpose |
|--------|------|---------|
| POST | /api/agent-push/register | Register agent, get serverId |
| POST | /api/servers/:id/heartbeat | Heartbeat (online status) |
| POST | /api/servers/:id/metrics | System metrics |
| POST | /api/agent-push/:id/processes | Process discovery |
| POST | /api/agent-push/:id/docker | Docker containers |
| POST | /api/servers/:id/logs | Log entries |

All requests use `Authorization: Bearer <agent-token>`.
