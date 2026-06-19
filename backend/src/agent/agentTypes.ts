/**
 * agentTypes.ts
 *
 * Type definitions for the Unwire Agent — a lightweight service that
 * runs on customer servers and communicates back to the Unwire AI platform.
 *
 * Phase 6 Foundation:
 *   - Interfaces defined here
 *   - No real agent deployment yet
 *   - Backend accepts agent payloads at /api/servers/:id/metrics and /api/servers/:id/logs
 *
 * Future phases will implement:
 *   - Real agent binary (Go or Node)
 *   - Automatic installation script
 *   - WebSocket or long-poll channel for commands
 *   - Container management (start/stop/restart via Docker API)
 */

// ─── Agent Identity ────────────────────────────────────────────────────────

export interface ServerAgent {
  /** Unique identifier matching the Server.id in the database */
  serverId:     string;
  /** Secret token issued when the server is connected — used for auth */
  agentToken:   string;
  /** Version of the agent software */
  agentVersion: string;
  /** OS/platform the agent is running on */
  platform:     string;
  /** Hostname of the machine */
  hostname:     string;
}

// ─── Heartbeat ────────────────────────────────────────────────────────────

/**
 * AgentHeartbeat
 *
 * Sent by the agent every 30 seconds to:
 *  1. Report the server as online
 *  2. Push current CPU/RAM/Disk/Network metrics
 *  3. Report running applications
 *
 * Maps to: POST /api/servers/:id/metrics
 */
export interface AgentHeartbeat {
  serverId:     string;
  agentVersion: string;
  timestamp:    string;          // ISO 8601

  // System metrics
  metrics: {
    cpuPercent:  number;         // 0–100
    ramPercent:  number;         // 0–100
    diskPercent: number;         // 0–100
    networkIn:   number;         // KB/s inbound
    networkOut:  number;         // KB/s outbound
    uptime:      number;         // seconds since boot
  };

  // Running processes / containers
  applications: AgentAppStatus[];
}

export interface AgentAppStatus {
  name:    string;               // process or container name
  type:    "process" | "docker" | "systemd";
  status:  "running" | "stopped" | "error";
  pid?:    number;
  port?:   number;
  memory:  number;               // MB
  cpu:     number;               // percent
  uptime:  string;               // human-readable e.g. "2h 14m"
}

// ─── Log Stream ────────────────────────────────────────────────────────────

/**
 * AgentLogBatch
 *
 * Sent by the agent when new log lines are available.
 * Batched to avoid one request per log line.
 *
 * Maps to: POST /api/servers/:id/logs
 */
export interface AgentLogBatch {
  serverId:  string;
  logs: Array<{
    appName:   string;
    level:     "info" | "warn" | "error" | "debug";
    message:   string;
    timestamp: string;           // ISO 8601
  }>;
}

// ─── Command ──────────────────────────────────────────────────────────────

/**
 * AgentCommand
 *
 * Sent FROM the platform TO the agent.
 * The agent polls GET /api/servers/:id/commands for pending commands.
 *
 * Command types:
 *   - restart_app:   restart a named application/container
 *   - stop_app:      stop a named application/container
 *   - start_app:     start a named application/container
 *   - pull_deploy:   pull latest code and restart
 *   - run_script:    execute a shell script (future)
 *   - health_check:  trigger immediate status report
 */
export type AgentCommandType =
  | "restart_app"
  | "stop_app"
  | "start_app"
  | "pull_deploy"
  | "health_check";

export interface AgentCommand {
  id:          string;           // unique command ID for deduplication
  serverId:    string;
  type:        AgentCommandType;
  payload:     Record<string, unknown>;
  issuedAt:    string;           // ISO 8601
  expiresAt:   string;           // ISO 8601 — command is ignored after this
  issuedBy:    string;           // userId who triggered the command
}

export interface AgentCommandResult {
  commandId: string;
  success:   boolean;
  output?:   string;
  error?:    string;
  duration:  number;             // ms
}

// ─── Connection Status ────────────────────────────────────────────────────

/**
 * AgentConnectionStatus
 *
 * Enriches the Server record with agent-specific status.
 * Computed server-side from last heartbeat timestamp.
 */
export interface AgentConnectionStatus {
  serverId:        string;
  isConnected:     boolean;
  lastHeartbeat:   string | null;   // ISO 8601
  agentVersion:    string | null;
  /** Seconds since last heartbeat. null if never connected. */
  secondsSincePing: number | null;
  /** "online" if < 60s, "degraded" if 60–300s, "offline" if > 300s */
  derivedStatus:   "online" | "degraded" | "offline" | "never_connected";
}

// ─── Installation ─────────────────────────────────────────────────────────

/**
 * Returns the shell command to install the Unwire Agent on a server.
 * The agent calls home to the platform with the serverId.
 */
export function getAgentInstallScript(serverId: string, platformUrl: string): string {
  return `curl -sSL ${platformUrl}/agent/install.sh | bash -s -- --server-id ${serverId}`;
}
