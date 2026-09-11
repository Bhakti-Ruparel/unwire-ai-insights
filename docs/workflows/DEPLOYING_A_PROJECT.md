# Workflow: Deploying a Project

## Prerequisites
- Project exists with GitHub URL or uploaded code
- Server connected with agent online
- Agent command server reachable on port 9898
- (Optional) Environment variables configured for the project

## Complete Flow

```
User: POST /api/deployments { projectId, serverId, branch }
    → enforceDeploymentLimit middleware (monthly quota)
    → deploymentExecutionService.createDeployment()
    → Creates Deployment record (status: QUEUED)
    → Enqueues BullMQ job (or executes inline if no Redis)
    → Worker picks up job → calls runDeploymentPipeline()

Pipeline (9 steps):
    1. Validate — project/server exist, agent reachable (GET :9898/health)
    2. Plan — AI analyzes project code → DeploymentPlan
    3. Generate — Creates Dockerfile, docker-compose.yml, nginx.conf, .env
    4. Clone — Agent: git clone repo (POST :9898/deploy action:"clone")
    5. Write Files — Agent: write generated configs (action:"write_files")
    6. Build — Agent: docker build (action:"build", timeout:600s)
    7. Deploy — Agent: docker run blue-green (action:"deploy")
    8. Health Check — Agent: curl localhost:port (10 retries, 3s apart)
    9. Finalize — Register app in server_apps, log success

On failure at any step:
    → Step marked "failed" with error message
    → Deployment marked FAILED
    → BullMQ retries (3 attempts, exponential backoff)

On health check failure:
    → Automatic rollback (stop new container, keep old)
```

## Environment Variables
- Stored encrypted per-project: `PUT /api/projects/:id/env-vars`
- Retrieved at deploy time by pipeline
- Falls back to plan example values with warning if not configured

## Files Involved
- Frontend: `src/routes/deployments.$deploymentId.tsx`
- Backend routes: `backend/src/routes/deploymentRoutes.ts`
- Pipeline: `backend/src/deployment/deploymentPipeline.ts`
- Agent client: `backend/src/deployment/agentClient.ts`
- Env vars: `backend/src/deployment/envVarService.ts`
- Planner: `backend/src/deployment/deploymentPlanner.ts`
- Generator: `backend/src/deployment/deploymentGenerator.ts`
- Queue: `backend/src/queue/deploymentQueue.ts`

## SSE Log Streaming
- Endpoint: `GET /api/deployments/:id/logs/stream?token=JWT`
- Polls deployment logs every 1.5s
- Sends each log entry as SSE data event
- Fires "done" event when deployment reaches terminal state

## Rollback
- `POST /api/deployments/:id/rollback`
- Sends agent command: action:"rollback"
- Agent switches blue/green container
- Deployment marked ROLLED_BACK

## Current Limitations
- Agent command server must be accessible from backend on port 9898
- GitHub clone requires public repo OR configured GitHub token
- Docker must be installed on target server
- Build timeout is 10 minutes max
