# Current State — Unwire AI

Last updated: August 2026

## Feature Status Matrix

| Feature | UI | Backend | Database | Agent | End-to-End | Status |
|---------|-----|---------|----------|-------|------------|--------|
| Authentication (signup/login/refresh) | ✅ | ✅ | ✅ | N/A | ✅ | IMPLEMENTED |
| Password Reset | ✅ | ✅ | ✅ | N/A | ✅ | IMPLEMENTED |
| Organization Management | ✅ | ✅ | ✅ | N/A | ✅ | IMPLEMENTED |
| RBAC (Owner/Admin/Member) | Partial | ✅ | ✅ | N/A | ✅ | IMPLEMENTED |
| Multi-org Switching | ✅ | ✅ | N/A | N/A | ✅ | IMPLEMENTED |
| Subscription Plans (Free/Pro/Enterprise) | ✅ | ✅ | ✅ | N/A | NOT VERIFIED | Razorpay untested with real keys |
| Server Creation | ✅ | ✅ | ✅ | N/A | ✅ | IMPLEMENTED |
| Agent Connection (heartbeat/metrics) | ✅ | ✅ | ✅ | ✅ | ✅ | IMPLEMENTED |
| Agent Installer Script | ✅ | ✅ | N/A | ✅ | PENDING TEST | IMPLEMENTED — REAL VPS TEST PENDING |
| Real-time Metrics (SSE) | ✅ | ✅ | ✅ | ✅ | ✅ | IMPLEMENTED |
| Server Health Score | ✅ | ✅ | ✅ | N/A | ✅ | IMPLEMENTED |
| Online/Offline Detection | ✅ | ✅ | ✅ | ✅ | ✅ | IMPLEMENTED |
| Server Delete | ✅ | ✅ | ✅ | N/A | ✅ | IMPLEMENTED |
| Infrastructure (Cloud Providers) | ✅ | ✅ | ✅ | N/A | NOT VERIFIED | Requires real cloud credentials |
| Project Code Analysis | ✅ | ✅ | ✅ | N/A | ✅ | IMPLEMENTED |
| Project RAG Chat | ✅ | ✅ | ✅ | N/A | PARTIALLY | Requires ChromaDB + OpenAI key |
| Deployment Pipeline | ✅ | ✅ | ✅ | Required | NOT VERIFIED | Requires agent command server reachable |
| GitHub Webhooks | Backend only | ✅ | ✅ | N/A | NOT VERIFIED | No frontend UI for webhook setup |
| Software Marketplace | ✅ | ✅ | ✅ | Required | PARTIALLY | Requires agent command server |
| Command Center | ✅ | ✅ | ✅ | Required | PARTIALLY | Dynamic commands based on installed software |
| Monitoring Engine (alerts) | Backend only | ✅ | ✅ | N/A | ✅ | IMPLEMENTED |
| AI DevOps Agent | ✅ | ✅ | ✅ | N/A | PARTIALLY | Requires AI API keys |
| Admin Panel | ✅ | ✅ | ✅ | N/A | ✅ | IMPLEMENTED |
| Billing Dashboard | ✅ | ✅ | ✅ | N/A | NOT VERIFIED | Razorpay test mode untested |
| Email Notifications | Backend only | ✅ | N/A | N/A | NOT VERIFIED | Requires SMTP/Resend config |

---

## Known Issues

1. **Agent command server reachability:** Backend → Agent communication (port 9898) fails if agent hasn't been rebuilt with command server support. The Node.js test agent has it; Go agent needs compilation.

2. **Software installation shows "Failed":** If agent command server isn't running on port 9898, all installations fail with exit code -1. The agent must expose both the heartbeat client AND the HTTP command server.

3. **Deployment shows "Agent unreachable":** Same root cause as #1. The `resolveAgentEndpoint` function probes addresses, but if nothing responds on 9898, deployments fail.

4. **Frontend routeTree.gen.ts errors:** Auto-generated file sometimes has stale content. Resolves when dev server restarts (TanStack Router regenerates it).

5. **Landing page uses dark theme colors:** The `/` (index) route has its own color system separate from the dashboard's light theme.

6. **Razorpay payments untested:** The billing flow is architecturally complete but has never processed a real payment. Webhook signature verification needs testing.

7. **Prisma `company`/`bio` fields:** These were added to the User model. If running against an old database, `npx prisma migrate deploy` must be run.

---

## Recently Implemented

- Real-time SSE metrics streaming on server detail page
- Live online/offline status from heartbeat timestamps
- Dynamic command center (shows only installed software's commands)
- Production agent installer script (one-line install)
- Light enterprise theme (AWS-style)
- Resizable/collapsible sidebar
- Delete server functionality
- Software marketplace with verification
- Agent health check endpoint
- Multi-address agent endpoint resolution

---

## Recommended Next Work (Priority Order)

1. **Verify agent command server works end-to-end** — Rebuild Docker test container, confirm port 9898 responds, test a command execution
2. **Complete deployment pipeline test** — Deploy a sample Node.js app through the full pipeline
3. **Add automated tests** — Auth, deployment permissions, subscription limits
4. **Production email delivery** — Configure Resend/SES for real password reset and alert emails
5. **Stripe/Razorpay test mode verification** — Process a test payment end-to-end
6. **GitHub OAuth UI** — Frontend page to connect GitHub account for webhook-based deployments
