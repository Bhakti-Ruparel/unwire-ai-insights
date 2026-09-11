# Backend API Reference

Base URL: `http://localhost:5000` (development)

All responses follow: `{ success: boolean, data?: T, error?: string }`

## Authentication
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | /api/auth/signup | No | Create account |
| POST | /api/auth/login | No | Login |
| POST | /api/auth/refresh | No | Refresh token pair |
| POST | /api/auth/logout | No | Invalidate refresh token |
| POST | /api/auth/logout-all | JWT | Invalidate all sessions |
| POST | /api/auth/forgot-password | No | Request reset email |
| POST | /api/auth/reset-password | No | Reset with token |
| GET | /api/auth/me | JWT | Current user profile |
| GET | /api/auth/profile | JWT | Detailed profile |
| PATCH | /api/auth/profile | JWT | Update profile |
| GET | /api/auth/sessions | JWT | Active sessions |

## Servers
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | /api/servers | JWT+Org | List servers |
| POST | /api/servers | JWT+Org | Create server |
| GET | /api/servers/:id | JWT+Own | Get server |
| DELETE | /api/servers/:id | JWT+Own | Delete server |
| GET | /api/servers/:id/health | JWT+Own | Full health data |
| GET | /api/servers/:id/agent-health | JWT+Own | Real-time agent probe |
| GET | /api/servers/:id/metrics | JWT+Own | Metric history |
| POST | /api/servers/:id/metrics | AgentToken | Push metrics |
| POST | /api/servers/:id/heartbeat | AgentToken | Push heartbeat |
| GET | /api/servers/:id/events | JWT(query) | SSE stream |
| GET | /api/servers/:id/apps | JWT+Own | Applications |
| GET | /api/servers/:id/logs | JWT+Own | Server logs |
| POST | /api/servers/:id/logs | AgentToken | Push logs |
| POST | /api/servers/:id/ask | JWT+Own | AI question |

## Agent Push
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | /api/agent-push/register | AgentToken | Register agent |
| POST | /api/agent-push/:id/processes | AgentToken | Push processes |
| POST | /api/agent-push/:id/docker | AgentToken | Push containers |

## Deployments
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | /api/deployments | JWT+Org | Create deployment |
| GET | /api/deployments?projectId= | JWT | List deployments |
| GET | /api/deployments/:id | JWT | Get deployment |
| GET | /api/deployments/:id/logs | JWT | Deployment logs |
| GET | /api/deployments/:id/logs/stream | JWT(query) | SSE logs |
| POST | /api/deployments/:id/rollback | JWT | Rollback |
| POST | /api/deployments/webhook/github | Signature | GitHub webhook |

## Software
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | /api/software/registry | No | Full catalog |
| GET | /api/software/registry/search?q= | No | Search |
| GET | /api/software/servers/:id/installed | JWT+Own | Installed list |
| POST | /api/software/servers/:id/install | JWT+Own | Install software |
| POST | /api/software/servers/:id/uninstall | JWT+Own | Uninstall |
| POST | /api/software/servers/:id/bootstrap | JWT+Own | Install essentials |

## Commands
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | /api/commands/registry | No | Full catalog |
| GET | /api/commands/servers/:id/available | JWT+Own | Dynamic for server |
| POST | /api/commands/servers/:id/execute | JWT+Own | Execute command |
| GET | /api/commands/executions/:id | JWT | Get result |
| GET | /api/commands/servers/:id/history | JWT+Own | History |

## Infrastructure
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | /api/infrastructure/providers | No | Available providers |
| GET | /api/infrastructure/connections | JWT+Org | Connected providers |
| GET | /api/infrastructure/resources | JWT+Org | Cloud resources |
| POST | /api/infrastructure/connect | JWT+Org | Connect provider |
| POST | /api/infrastructure/disconnect | JWT+Org | Disconnect |
| POST | /api/infrastructure/sync/:id | JWT+Org | Sync resources |

## Organization
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | /api/org | JWT+Org | Get organization |
| POST | /api/org | JWT | Create organization |
| GET | /api/org/billing | JWT+Org | Billing info |
| POST | /api/org/billing/checkout | JWT+Org | Razorpay order |
| POST | /api/org/billing/verify | JWT+Org | Verify payment |
| POST | /api/org/billing/cancel | JWT+Org | Cancel subscription |
| POST | /api/org/invitations | JWT+Org+Admin | Invite member |
| GET | /api/org/api-keys | JWT+Org | List API keys |

## AI Agent
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | /api/agent/chat | JWT+Org+AILimit | Chat with AI |
| GET | /api/agent/health | JWT | AI system status |

## Installer
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | /install.sh | No | Dynamic installer script |
| GET | /api/agent/version | No | Agent version metadata |
| GET | /api/agent/install-cmd/:serverId | JWT | Generated install command |

## Auth Legend
- **JWT** — requires Authorization: Bearer header
- **JWT+Org** — JWT + X-Organization-Id header + withOrgContext middleware
- **JWT+Own** — JWT + requireServerOwnership/requireProjectOwnership
- **AgentToken** — Bearer token is the server's agentToken (not JWT)
- **Signature** — Verified by webhook secret (no user auth)
- **JWT(query)** — Token passed as ?token= query param (for EventSource)
