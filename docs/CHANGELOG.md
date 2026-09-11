# Changelog

## Unreleased

### Added
- Production agent installer script (`GET /install.sh`) with one-line install command
- Dynamic command center (shows only commands relevant to installed software)
- Server delete functionality with confirmation UI
- Software marketplace with n8n, NocoDB, Portainer entries
- Real health score calculation (availability + CPU + RAM + Disk weighted)
- Live online/offline detection from heartbeat timestamps
- SSE real-time metrics streaming on server detail page
- Agent health check endpoint (`GET /api/servers/:id/agent-health`)
- Multi-address agent endpoint resolution
- Organization context switching (X-Organization-Id header)
- Razorpay billing integration
- Password reset flow
- Zod input validation on all major routes
- RBAC privilege escalation protection
- Light enterprise theme (AWS-style)
- Resizable/collapsible sidebar with localStorage persistence

### Changed
- Deployment pipeline uses real agent execution (replaced sleep() simulation)
- Server status derived from heartbeat timestamp (not static DB field)
- Heartbeat controller now records actual heartbeat entries
- Metric/log pruning uses timestamp-based deletion (not skip-based)
- Refresh token rotation uses Serializable transaction (prevents race condition)
- CORS config allows X-Organization-Id header

### Fixed
- Server detail page "Server not found" (health endpoint returned wrong shape)
- Heartbeat not updating status (recordHeartbeat wasn't called in pushHeartbeat)
- SSE stale client memory leak (periodic cleanup added)
- JWT secrets fail-fast in production mode
- GitHub webhook requires signature verification in production

### Known Issues
- Agent command server (port 9898) requires container rebuild to function
- Go agent binary not compiled (source exists but needs `go mod tidy` + `go build`)
- Razorpay payments untested with real keys
- Email delivery requires external SMTP/Resend configuration
- Frontend routeTree.gen.ts occasionally has stale errors (self-resolves on dev server restart)
