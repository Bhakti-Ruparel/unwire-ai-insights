# Software Marketplace

## Purpose
VS Code extension marketplace-style interface for installing software on servers without manual commands.

## User Flow
1. Navigate to Server → Software
2. Browse/search available software (19 entries)
3. Click "Install" — backend checks if already installed
4. Installation executes on server via agent
5. Verification runs (e.g., `psql --version`)
6. Only marks "Installed" after verification passes
7. "Prepare Server" button installs essential stack (Docker, Git, Node, Python, Nginx)

## Frontend Implementation
- Route: `src/routes/server-software.$serverId.tsx`
- URL: `/server-software/:serverId`
- Access: Server detail page → "Software" button

## Backend Implementation
- Registry: `backend/src/software/softwareRegistry.ts` (19 entries with OS-specific commands)
- Service: `backend/src/software/softwareService.ts` (install/uninstall/verify/bootstrap)
- Controller: `backend/src/controllers/softwareController.ts`
- Routes: `backend/src/routes/softwareRoutes.ts`

## Software Registry (19 entries)

| Category | Software |
|----------|----------|
| Databases | PostgreSQL, MySQL, Redis, MongoDB, MariaDB |
| Languages | Node.js, Python, Go, Java (OpenJDK) |
| Frontend | Nginx |
| DevOps | Docker, Docker Compose, Terraform, kubectl, PM2, Certbot, Git |
| Monitoring | Prometheus, Grafana |
| Applications | n8n, NocoDB, Portainer |

## Installation States
```
QUEUED → INSTALLING → VERIFYING → INSTALLED
                              ↓
                           FAILED (with error message)
```

## Execution Flow
```
POST /api/software/servers/:id/install { softwareId, version }
    → Registry lookup (approved commands only)
    → Pre-check: run healthCheck command (skip if already installed)
    → Resolve OS (runs `uname -s` on server)
    → Resolve install command with version
    → Execute via sendAgentCommand(action:"exec")
    → Split multi-command (&&) and execute sequentially
    → Post-verify: run healthCheck again
    → Only mark "installed" if verification passes
    → Broadcast progress via SSE
```

## Security
- Only commands from `softwareRegistry.ts` can execute
- No arbitrary package names or versions accepted
- Commands are pre-defined templates with `{VERSION}` substitution
- User cannot inject shell code through version parameter

## API Endpoints
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/software/registry` | List all available software |
| GET | `/api/software/registry/search?q=&category=` | Search/filter |
| GET | `/api/software/servers/:id/installed` | Installed software on server |
| POST | `/api/software/servers/:id/install` | Install `{ softwareId, version }` |
| POST | `/api/software/servers/:id/uninstall` | Uninstall `{ softwareId }` |
| POST | `/api/software/servers/:id/bootstrap` | One-click essential stack |

## Current Status: PARTIALLY IMPLEMENTED
- ✅ Registry with 19 software entries (Linux/macOS/Windows commands)
- ✅ Pre-install check (prevents duplicate installs)
- ✅ Post-install verification
- ✅ Bootstrap (one-click essential stack)
- ✅ Auto-refresh UI during installation
- ⚠️ **Requires agent command server on port 9898**
- ⚠️ Exit code -1 = agent unreachable (not software issue)
- ⚠️ Some installs require `sudo` — agent must run as root or have sudo access
