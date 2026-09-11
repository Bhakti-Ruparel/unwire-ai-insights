# AI Development Context

**Before modifying this project:**

1. Read `PROJECT_CONTEXT.md`
2. Read `CURRENT_STATE.md`
3. Read the relevant feature documentation in `docs/features/`
4. Inspect the actual related source files
5. Do NOT assume a feature works because a UI exists
6. Verify the complete flow: Frontend → API → Service → Database/Agent

---

## Mandatory Rules for AI Agents

### Rule 1 — Never Create Dummy Functionality

If a UI button exists, verify the COMPLETE chain:
```
UI action → frontend handler → API request → backend route →
controller → service → database/agent/external → response → UI update
```
A visually complete UI is NOT a completed feature.

### Rule 2 — Trace Existing Architecture First

Before creating new files, check if similar functionality exists:
- API client: `src/services/api.ts` (centralized)
- Auth middleware: `backend/src/middleware/authenticate.ts`
- Org context: `backend/src/middleware/organizationContext.ts`
- Validation: `backend/src/middleware/validate.ts` + `backend/src/schemas/index.ts`
- Agent communication: `backend/src/deployment/agentClient.ts`
- SSE broadcasting: `backend/src/servers/serverSSE.ts`
- Prisma queries: Through service files, never in controllers

### Rule 3 — Reuse Existing Patterns

The project already has established patterns for:
- **API calls:** `apiFetch<T>(path, options)` in `src/services/api.ts`
- **Auth:** JWT with auto-refresh mutex
- **Org header:** `X-Organization-Id` sent automatically by frontend
- **Agent commands:** `sendAgentCommand(serverId, request)` with endpoint resolution
- **Real-time:** SSE via `EventSource` with polling fallback
- **Validation:** Zod schemas in `backend/src/schemas/index.ts`
- **Audit logging:** `recordAudit()` from `billing/auditService.ts`

### Rule 4 — Full-Stack Verification

For every feature change, verify:
```
Frontend → Request → Backend route → Controller → Service →
Database/Agent → Response → Frontend rendering
```

### Rule 5 — Never Claim "Fixed" Without Verification

Must run:
- `npx tsc --noEmit` in both `/` and `/backend`
- Check `get_diagnostics` on modified files
- Verify the actual runtime behavior if possible

### Rule 6 — Update Documentation After Changes

After significant changes:
- Update `docs/CURRENT_STATE.md`
- Update relevant feature docs
- Add entry to `docs/CHANGELOG.md`

---

## Before Starting Any New Feature

1. Read `PROJECT_CONTEXT.md`
2. Read `CURRENT_STATE.md`
3. Identify relevant feature documentation
4. Inspect actual source files for the area being modified
5. Create a short implementation plan
6. Check frontend + backend + database + agent impact
7. Implement
8. Run TypeScript compilation check
9. Test the complete flow
10. Update documentation

---

## Before Ending a Development Session

Checklist:
- [ ] What changed?
- [ ] Which files changed?
- [ ] Did architecture change?
- [ ] Did API behavior change?
- [ ] Did database schema change?
- [ ] Did environment variables change?
- [ ] Are there known issues?
- [ ] Was end-to-end functionality actually verified?
- [ ] Update `CURRENT_STATE.md`
- [ ] Update `CHANGELOG.md`
- [ ] Update relevant feature docs

---

## Key File Locations

| Concern | File |
|---------|------|
| All frontend API calls | `src/services/api.ts` |
| Frontend types | `src/types/project.ts` |
| Auth context | `src/context/AuthContext.tsx` |
| Dashboard layout | `src/components/DashboardLayout.tsx` → `layout/AppLayout.tsx` |
| Backend entry | `backend/src/server.ts` |
| Database schema | `backend/prisma/schema.prisma` |
| Agent client | `backend/src/deployment/agentClient.ts` |
| Server service | `backend/src/servers/serverService.ts` |
| Command registry | `backend/src/commands/commandRegistry.ts` |
| Software registry | `backend/src/software/softwareRegistry.ts` |
| Monitoring engine | `backend/src/monitoring/monitoringEngine.ts` |
| Installer script | `backend/src/installer/installerScript.ts` |

---

## Environment Variables (Backend)

| Variable | Purpose | Required |
|----------|---------|----------|
| `DATABASE_URL` | PostgreSQL connection | Yes |
| `JWT_SECRET` | Access token signing | Yes (fails in prod without) |
| `JWT_REFRESH_SECRET` | Refresh token signing | Yes (fails in prod without) |
| `PORT` | Backend port | No (default: 5000) |
| `FRONTEND_URL` | CORS origin | Yes |
| `REDIS_URL` | Redis for BullMQ/cache | No (graceful fallback) |
| `INFRA_ENCRYPTION_KEY` | AES-256 key for credentials | For cloud providers |
| `OPENROUTER_API_KEY` | AI model access | For AI features |
| `RAZORPAY_KEY_ID` | Payment gateway | For billing |
| `RAZORPAY_KEY_SECRET` | Payment gateway | For billing |
| `API_PUBLIC_URL` | Public URL for installer | For production |

---

## Common Pitfalls

1. **`host.docker.internal` is NOT universally reachable.** The agent client probes multiple addresses. Don't hardcode it.

2. **The Go agent and Node.js test agent have different capabilities.** The test agent (`unwire-ai-test-environment/test-server/agent/unwire-agent.js`) has a command server, but the Go agent's binary must be compiled separately.

3. **Frontend route tree is auto-generated.** The `src/routeTree.gen.ts` file regenerates when the dev server runs. TypeScript errors in it resolve automatically.

4. **Prisma client must be regenerated after schema changes.** Run `npx prisma generate` in `/backend` after modifying `schema.prisma`.

5. **SSE endpoints use query param for token** (EventSource can't set headers). The `sseAuth` helper in server routes handles this.

6. **Status is computed, not stored.** `computeLiveStatus()` in `serverService.ts` derives online/offline from heartbeat timestamps. Don't read `server.status` field directly for display.
