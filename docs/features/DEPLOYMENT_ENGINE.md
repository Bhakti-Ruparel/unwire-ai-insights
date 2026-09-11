# Deployment Engine

## Purpose
Deploys applications from GitHub repositories to connected servers using Docker, with blue-green deployment and automatic rollback.

## User Flow
1. User creates a deployment (select project + server + branch)
2. Pipeline executes: Validate → Plan → Generate → Clone → Write → Build → Deploy → Health Check → Finalize
3. Real-time logs stream via SSE
4. If health check fails → automatic rollback
5. On success → app registered in server's applications

## Frontend Implementation
- Deployment detail: `src/routes/deployments.$deploymentId.tsx`
- Project deployments: `src/routes/projects.$projectId.deployments.tsx`

## Backend Implementation
- Pipeline: `backend/src/deployment/deploymentPipeline.ts` (9 steps)
- Agent client: `backend/src/deployment/agentClient.ts` (endpoint resolution)
- Planner: `backend/src/deployment/deploymentPlanner.ts` (AI-generated plans)
- Generator: `backend/src/deployment/deploymentGenerator.ts` (Dockerfile, nginx, etc.)
- Env vars: `backend/src/deployment/envVarService.ts` (encrypted per-project)
- GitHub: `backend/src/deployment/githubIntegration.ts` (webhooks, OAuth)
- Execution service: `backend/src/deployment/deploymentExecutionService.ts`
- Queue: `backend/src/queue/deploymentQueue.ts` + `deploymentWorker.ts`
- Routes: `backend/src/routes/deploymentRoutes.ts`

## Pipeline Stages

| Stage | Action | Agent Required |
|-------|--------|---------------|
| Validate | Check project/server/agent reachability | Yes (health probe) |
| Plan | AI generates DeploymentPlan from code analysis | No |
| Generate | Create Dockerfile, docker-compose, nginx.conf, .env | No |
| Clone | `git clone` repository on server | Yes |
| Write Files | Write generated configs to server | Yes |
| Build | `docker build` on server | Yes |
| Deploy | Blue-green container start | Yes |
| Health Check | `curl localhost:port/health` (10 retries) | Yes |
| Finalize | Register app, update status | No |

## Agent Communication
Uses `sendAgentCommand(serverId, request)` which:
1. Resolves agent endpoint (probes multiple addresses)
2. POSTs to `http://agent:9898/deploy` with agentToken auth
3. Agent executes whitelisted command
4. Returns `{exitCode, stdout, stderr, durationMs}`

## Environment Variables
- Stored encrypted per-project via `envVarService.ts`
- API: `GET/PUT /api/projects/:id/env-vars`
- Pipeline retrieves decrypted vars at deploy time
- Falls back to plan examples with warning if not configured

## Current Status: PARTIALLY IMPLEMENTED
- ✅ Full pipeline code exists with real agent calls
- ✅ BullMQ queue-based async execution
- ✅ SSE log streaming
- ✅ Rollback support
- ✅ Blue-green deployment logic
- ✅ Environment variable management
- ⚠️ **Requires agent command server (port 9898) to be reachable**
- ⚠️ Agent endpoint resolution may fail in Docker networking scenarios
- ⚠️ GitHub OAuth UI not built (backend service exists)
- ⚠️ Webhook setup requires manual GitHub configuration
