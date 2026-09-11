# Workflow: Installing Software

## Prerequisites
- Server connected with agent online
- Agent command server reachable on port 9898
- Agent has root/sudo access for package installations

## Complete Flow

```
User clicks "Install" on PostgreSQL 16
    → POST /api/software/servers/:id/install { softwareId:"postgresql", version:"16" }
    → requireServerOwnership middleware
    → softwareService.installSoftware():
        1. Registry lookup → get SoftwareEntry
        2. Detect OS → execOnAgent("uname -s")
        3. Pre-check → run healthCheck command ("psql --version")
           - If already installed → ERROR "already installed"
        4. Resolve install command for OS+version
        5. Create installation record (status: queued)
        6. Broadcast SSE: "queued"
        7. Execute async:
            a. Status → "installing"
            b. Split command by "&&"
            c. Execute each sub-command via agent (action:"exec")
            d. If any fails → status "failed" with error
            e. Status → "verifying"
            f. Run healthCheck command
            g. Wait 2s, retry if needed (services take time to start)
            h. If verification passes → status "installed"
            i. If verification fails → status "failed"
        8. Broadcast SSE updates throughout

Frontend:
    - Auto-refreshes every 4s while installations are active
    - Shows real status: queued/installing/verifying/installed/failed
    - Shows error messages on failure
```

## Bootstrap (One-Click Server Prep)

```
POST /api/software/servers/:id/bootstrap
    → Installs sequentially: docker, docker-compose, git, nodejs, python, nginx
    → Skips already-installed software (pre-check catches them)
    → Returns { queued: ["docker", "git", ...] }
```

## Verification Examples

| Software | Health Check Command |
|----------|---------------------|
| PostgreSQL | `sudo systemctl is-active postgresql` |
| Redis | `redis-cli ping` |
| Docker | `docker --version && docker ps` |
| Node.js | `node --version` |
| Nginx | `sudo systemctl is-active nginx` |
| Python | `python3 --version` |

## Common Failure Causes
1. **Exit code -1:** Agent command server not reachable (port 9898)
2. **Exit code 1 with "not found":** Package not available in OS repos
3. **Permission denied:** Agent not running as root
4. **Verification fails:** Service installed but not started (systemd issue)

## Files Involved
- Frontend: `src/routes/server-software.$serverId.tsx`
- Registry: `backend/src/software/softwareRegistry.ts`
- Service: `backend/src/software/softwareService.ts`
- Controller: `backend/src/controllers/softwareController.ts`
- Routes: `backend/src/routes/softwareRoutes.ts`
