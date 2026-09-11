# Monitoring & Alerts

## Purpose
Background engine that continuously checks server health and creates alerts when thresholds are exceeded.

## How It Works
- Monitoring engine runs every 60 seconds (in-process or via BullMQ worker)
- Checks all servers with a userId set
- Creates alerts based on real metric data

## Thresholds

| Metric | Warning | Critical |
|--------|---------|----------|
| CPU | 75% | 90% |
| RAM | 80% | 95% |
| Disk | 85% | 95% |
| Heartbeat timeout | — | 5 minutes (offline) |
| Error spike | 10+ errors in 5 min | — |
| App crash | — | Process in error/stopped state |
| Deploy failed | — | Deployment status = FAILED |

## Backend Implementation
- Engine: `backend/src/monitoring/monitoringEngine.ts`
- Alert service: `backend/src/monitoring/alertService.ts`
- Worker: `backend/src/monitoring/monitoringWorker.ts`
- Controller: `backend/src/controllers/alertController.ts`
- Routes: `backend/src/routes/alertRoutes.ts`

## Alert Model Fields
- type: `cpu_high | ram_high | disk_high | server_offline | app_crash | error_spike | deploy_failed`
- severity: `INFO | WARNING | CRITICAL`
- status: `ACTIVE | ACKNOWLEDGED | RESOLVED`
- includes: title, message, recommendation, metadata

## API Endpoints
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/alerts?status=&severity=&serverId=` | List alerts (paginated) |
| GET | `/api/alerts/summary` | Count by severity |
| PATCH | `/api/alerts/:id/acknowledge` | Mark acknowledged |
| PATCH | `/api/alerts/:id/resolve` | Mark resolved |
| GET | `/api/alerts/notifications?limit=` | In-app notifications |

## Current Status: IMPLEMENTED
- ✅ Background monitoring cycle (60s)
- ✅ Threshold-based alert creation
- ✅ Alert deduplication (prevents spam)
- ✅ Offline detection from heartbeat
- ✅ Failed deployment alerts
- ✅ Frontend alerts page
- ✅ Server detail page shows active alerts
