# Unwire AI — Project Context

## Project Identity

**Name:** Unwire AI
**Type:** AI-native DevOps & Infrastructure Management Platform
**Problem Solved:** Eliminates the need for manual server management, SSH access, and memorizing deployment/administration commands. Users connect their servers and manage everything from a web dashboard.

**Primary Users:**
- Developers managing VPS/cloud servers
- Startups deploying applications
- DevOps teams managing multi-cloud infrastructure
- Companies needing centralized server management

**Product Goal:** "Connect your VPS → manage everything visually → deploy → monitor → operate without SSH."

**Differentiator:** Combines AI assistant + server monitoring + deployment automation + software marketplace + command execution in one platform, unlike Datadog (monitoring only), Vercel (deployment only), or individual tools.

---

## Current Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend | React 19 + TanStack Router + TanStack Start | Vite 7, TypeScript |
| UI Framework | Tailwind CSS 4 + Radix UI (shadcn/ui) | Custom light theme |
| Backend | Express.js + TypeScript | Node 20 |
| Database | PostgreSQL | Via Prisma ORM 5.x |
| Cache/Queue | Redis + BullMQ | Optional (graceful fallback) |
| Agent | Go (production) / Node.js (test) | Communicates via HTTP |
| AI | OpenRouter (Qwen3, DeepSeek R1, Llama 3.3) | Fallback: HuggingFace |
| RAG | ChromaDB + OpenAI Embeddings | Optional |
| Auth | JWT (15min access) + Refresh tokens (30d) | bcrypt password hashing |
| Billing | Razorpay | Indian payment gateway |
| Real-time | Server-Sent Events (SSE) | Per-server subscriptions |

---

## System Architecture

```
User (Browser)
    ↓
Frontend (TanStack Start, Vite)
    ↓ HTTP/SSE
Backend API (Express.js)
    ↓
┌──────────────────────────────────────┐
│  PostgreSQL (Prisma ORM, 30+ models) │
│  Redis (BullMQ queues, caching)      │
│  ChromaDB (RAG vector store)         │
└──────────────────────────────────────┘
    ↓ HTTP (port 9898)
Agent Client (resolves endpoint)
    ↓
Unwire Agent (on customer's VPS)
    ↓
Actual Linux/macOS Server
```

### Communication Directions:
- **Agent → Backend:** Heartbeat, metrics, logs, process data (agent initiates)
- **Backend → Agent:** Deployment commands, software installation, command execution (backend initiates via HTTP to agent:9898)
- **Frontend → Backend:** All user interactions via REST API
- **Backend → Frontend:** Real-time updates via SSE

---

## Critical Architecture Decisions

1. **Agent communication is bidirectional.** The agent pushes metrics TO the backend, but the backend also calls the agent's HTTP server (port 9898) for deployments and commands.

2. **Endpoint resolution for agent calls:** The backend's `agentClient.ts` probes multiple addresses (server.host, localhost, heartbeat IP) to find the reachable agent. This is necessary because Docker networking makes `host.docker.internal` unreliable across environments.

3. **Status is computed from heartbeat timestamps** (not stored statically). `computeLiveStatus()` derives online/offline/degraded from the most recent `ServerHeartbeat` record.

4. **Health scores are real-time calculated** from: availability (heartbeat recency, 40%), CPU (20%), RAM (20%), Disk (10%), stability bonus (10%).

5. **Command execution uses a whitelist registry.** Only predefined commands from `commandRegistry.ts` and `softwareRegistry.ts` can run. No arbitrary shell input.

6. **Multi-tenancy uses organizations.** Resources are scoped to organizations, not just users. The `X-Organization-Id` header enables org switching.

7. **Subscription limits are enforced at the middleware level** (`subscriptionGuard.ts`) on resource creation endpoints.

---

## Repository Structure

```
unwire-ai-insights/
├── src/                    # Frontend (React + TanStack Router)
│   ├── routes/             # File-based routing (pages)
│   ├── components/         # Reusable components
│   ├── context/            # React contexts (Auth, Project)
│   ├── hooks/              # Custom hooks
│   ├── services/           # API client layer (api.ts)
│   └── types/              # TypeScript type definitions
├── backend/                # Backend (Express + Prisma)
│   ├── src/
│   │   ├── controllers/    # HTTP request handlers
│   │   ├── routes/         # Express route definitions
│   │   ├── services/       # Business logic
│   │   ├── middleware/     # Auth, validation, RBAC
│   │   ├── servers/        # Server management service
│   │   ├── deployment/     # Deployment pipeline
│   │   ├── commands/       # Command Center
│   │   ├── software/       # Software marketplace
│   │   ├── infrastructure/ # Cloud provider integrations
│   │   ├── ai/             # AI agent + RAG
│   │   ├── billing/        # Subscription + Razorpay
│   │   ├── monitoring/     # Alert engine
│   │   ├── queue/          # BullMQ workers
│   │   ├── installer/      # Dynamic agent installer
│   │   └── schemas/        # Zod validation schemas
│   └── prisma/             # Database schema + migrations
├── agent/                  # Go agent source (production)
├── unwire-ai-test-environment/  # Docker test environment
├── docker-compose.yml      # Production Docker stack
└── docs/                   # This documentation
```
