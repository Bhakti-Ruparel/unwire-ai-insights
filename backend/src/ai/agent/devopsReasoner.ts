/**
 * devopsReasoner.ts
 *
 * DevOps Reasoning Layer — transforms raw tool outputs into
 * senior DevOps engineer-level analysis.
 *
 * Instead of: "CPU: 80%. Health: 40/100."
 * Produces:   "Your server is under sustained CPU pressure (80% avg over
 *              the last 30 minutes). This is likely caused by..."
 *
 * Responsibilities:
 *  - Analyze metrics for anomalies and trends
 *  - Correlate logs with performance data
 *  - Identify root causes from evidence
 *  - Generate actionable recommendations
 *  - Explain gaps when data is missing
 */

import type { ClassifiedIntent, ExecutionPlan } from "./agentTypes";

// ─── Output structure ─────────────────────────────────────────────────────

export interface DevOpsAnalysis {
  summary: string;
  rootCause: string | null;
  evidence: string[];
  severity: "critical" | "warning" | "info" | "healthy";
  recommendations: string[];
  nextActions: string[];
  missingData: string[];
}

// ─── Thresholds ───────────────────────────────────────────────────────────

const THRESHOLDS = {
  cpu: { warning: 70, critical: 90 },
  ram: { warning: 80, critical: 95 },
  disk: { warning: 80, critical: 95 },
  healthScore: { warning: 60, critical: 30 },
};

// ─── Main entry point ─────────────────────────────────────────────────────

/**
 * analyzeToolResults
 *
 * Takes raw tool execution results and produces a structured
 * DevOps analysis with root cause, evidence, and recommendations.
 */
export function analyzeToolResults(
  plan: ExecutionPlan,
  classified: ClassifiedIntent
): DevOpsAnalysis {
  // Extract data from all successful steps
  const toolData = extractToolData(plan);

  // Check for missing/empty data scenarios
  if (toolData.isEmpty) {
    return buildNoDataAnalysis(toolData, classified);
  }

  // Run analysis based on what data is available
  const metricsAnalysis = analyzeMetrics(toolData);
  const logsAnalysis = analyzeLogs(toolData);
  const deployAnalysis = analyzeDeployments(toolData);
  const correlations = correlateEvidence(metricsAnalysis, logsAnalysis, deployAnalysis);

  // Determine overall severity
  const severity = determineSeverity(metricsAnalysis, logsAnalysis, deployAnalysis);

  // Build root cause from correlations
  const rootCause = buildRootCause(correlations, classified);

  // Generate recommendations
  const recommendations = buildRecommendations(
    metricsAnalysis, logsAnalysis, deployAnalysis, severity
  );

  // Build summary
  const summary = buildSummary(classified, metricsAnalysis, logsAnalysis, deployAnalysis, severity);

  // Next actions
  const nextActions = buildNextActions(severity, toolData);

  return {
    summary,
    rootCause,
    evidence: correlations.evidence,
    severity,
    recommendations,
    nextActions,
    missingData: toolData.missingData,
  };
}

// ─── Data extraction ──────────────────────────────────────────────────────

interface ExtractedData {
  isEmpty: boolean;
  missingData: string[];
  // Metrics
  servers: any[];
  serverDetail: any | null;
  latestMetric: any | null;
  averages: any | null;
  metricRange: string | null;
  healthScore: number | null;
  // Logs
  logs: any[];
  errorCount: number;
  warnCount: number;
  // Deployments
  deployments: any[];
  deploymentStats: any | null;
  // Project
  projectInfo: any | null;
}

function extractToolData(plan: ExecutionPlan): ExtractedData {
  const data: ExtractedData = {
    isEmpty: true,
    missingData: [],
    servers: [],
    serverDetail: null,
    latestMetric: null,
    averages: null,
    metricRange: null,
    healthScore: null,
    logs: [],
    errorCount: 0,
    warnCount: 0,
    deployments: [],
    deploymentStats: null,
    projectInfo: null,
  };

  for (const step of plan.steps) {
    if (!step.result?.success || !step.result.data) {
      if (step.status === "failed") {
        data.missingData.push(getMissingDataMessage(step.toolName));
      }
      continue;
    }

    const d = step.result.data as any;
    data.isEmpty = false;

    switch (step.toolName) {
      case "server_metrics":
        if (d.servers) data.servers = d.servers;
        if (d.server) data.serverDetail = d.server;
        if (d.latestMetric) data.latestMetric = d.latestMetric;
        if (d.averages) data.averages = d.averages;
        if (d.range) data.metricRange = d.range;
        if (d.server?.healthScore != null) data.healthScore = d.server.healthScore;
        break;
      case "logs_search":
        if (d.logs) data.logs = d.logs;
        if (d.errorCount != null) data.errorCount = d.errorCount;
        if (d.warnCount != null) data.warnCount = d.warnCount;
        break;
      case "deployment_history":
        if (d.deployments) data.deployments = d.deployments;
        if (d.stats) data.deploymentStats = d.stats;
        break;
      case "project_context":
        if (d.project) data.projectInfo = d.project;
        break;
    }
  }

  // Mark what's missing
  if (data.servers.length === 0 && !data.serverDetail) {
    data.missingData.push("No server metrics available — ensure your monitoring agent is connected and sending heartbeats.");
  }
  if (data.logs.length === 0 && plan.steps.some((s) => s.toolName === "logs_search")) {
    data.missingData.push("No recent log entries found — the agent may not be forwarding logs.");
  }

  return data;
}

// ─── Metrics analysis ─────────────────────────────────────────────────────

interface MetricsAnalysis {
  cpuStatus: "critical" | "warning" | "normal";
  ramStatus: "critical" | "warning" | "normal";
  diskStatus: "critical" | "warning" | "normal";
  cpuValue: number | null;
  ramValue: number | null;
  diskValue: number | null;
  healthStatus: "critical" | "warning" | "healthy" | "unknown";
  serverStatus: string | null;
  serverName: string | null;
  findings: string[];
}

function analyzeMetrics(data: ExtractedData): MetricsAnalysis {
  const analysis: MetricsAnalysis = {
    cpuStatus: "normal",
    ramStatus: "normal",
    diskStatus: "normal",
    cpuValue: null,
    ramValue: null,
    diskValue: null,
    healthStatus: "unknown",
    serverStatus: null,
    serverName: null,
    findings: [],
  };

  const metric = data.latestMetric ?? data.averages;
  const server = data.serverDetail ?? data.servers[0];

  if (!metric && !server) return analysis;

  if (server) {
    analysis.serverName = server.name;
    analysis.serverStatus = server.status;
    if (server.healthScore != null) {
      if (server.healthScore <= THRESHOLDS.healthScore.critical) analysis.healthStatus = "critical";
      else if (server.healthScore <= THRESHOLDS.healthScore.warning) analysis.healthStatus = "warning";
      else analysis.healthStatus = "healthy";
    }
  }

  if (metric) {
    const cpu = metric.cpuPercent ?? metric.cpu;
    const ram = metric.ramPercent ?? metric.ram;
    const disk = metric.diskPercent ?? metric.disk;

    if (cpu != null) {
      analysis.cpuValue = cpu;
      if (cpu >= THRESHOLDS.cpu.critical) { analysis.cpuStatus = "critical"; analysis.findings.push(`CPU is critically high at ${cpu.toFixed(0)}%`); }
      else if (cpu >= THRESHOLDS.cpu.warning) { analysis.cpuStatus = "warning"; analysis.findings.push(`CPU is elevated at ${cpu.toFixed(0)}%`); }
    }
    if (ram != null) {
      analysis.ramValue = ram;
      if (ram >= THRESHOLDS.ram.critical) { analysis.ramStatus = "critical"; analysis.findings.push(`Memory usage is critically high at ${ram.toFixed(0)}%`); }
      else if (ram >= THRESHOLDS.ram.warning) { analysis.ramStatus = "warning"; analysis.findings.push(`Memory usage is elevated at ${ram.toFixed(0)}%`); }
    }
    if (disk != null) {
      analysis.diskValue = disk;
      if (disk >= THRESHOLDS.disk.critical) { analysis.diskStatus = "critical"; analysis.findings.push(`Disk is nearly full at ${disk.toFixed(0)}%`); }
      else if (disk >= THRESHOLDS.disk.warning) { analysis.diskStatus = "warning"; analysis.findings.push(`Disk usage is high at ${disk.toFixed(0)}%`); }
    }
  }

  if (analysis.findings.length === 0 && server) {
    if (server.status === "offline") {
      analysis.findings.push("Server is currently offline");
    } else if (analysis.healthStatus === "healthy") {
      analysis.findings.push("All metrics are within normal ranges");
    }
  }

  return analysis;
}

// ─── Logs analysis ────────────────────────────────────────────────────────

interface LogsAnalysis {
  hasErrors: boolean;
  hasWarnings: boolean;
  errorPatterns: string[];
  recentErrors: Array<{ app: string; message: string; time: string }>;
  findings: string[];
}

function analyzeLogs(data: ExtractedData): LogsAnalysis {
  const analysis: LogsAnalysis = {
    hasErrors: data.errorCount > 0,
    hasWarnings: data.warnCount > 0,
    errorPatterns: [],
    recentErrors: [],
    findings: [],
  };

  if (data.logs.length === 0) return analysis;

  const errors = data.logs.filter((l: any) => l.level === "error");
  const warnings = data.logs.filter((l: any) => l.level === "warn");

  // Extract error patterns
  const errorMessages = errors.map((e: any) => e.message?.toLowerCase() ?? "");
  const patternCounts = new Map<string, number>();

  for (const msg of errorMessages) {
    if (msg.includes("oom") || msg.includes("out of memory")) patternCounts.set("out_of_memory", (patternCounts.get("out_of_memory") ?? 0) + 1);
    else if (msg.includes("timeout") || msg.includes("timed out")) patternCounts.set("timeout", (patternCounts.get("timeout") ?? 0) + 1);
    else if (msg.includes("econnrefused") || msg.includes("connection refused")) patternCounts.set("connection_refused", (patternCounts.get("connection_refused") ?? 0) + 1);
    else if (msg.includes("enospc") || msg.includes("no space")) patternCounts.set("disk_full", (patternCounts.get("disk_full") ?? 0) + 1);
    else if (msg.includes("crash") || msg.includes("segfault") || msg.includes("sigkill")) patternCounts.set("crash", (patternCounts.get("crash") ?? 0) + 1);
    else if (msg.includes("permission") || msg.includes("access denied")) patternCounts.set("permission", (patternCounts.get("permission") ?? 0) + 1);
    else if (msg.includes("database") || msg.includes("query") || msg.includes("sql")) patternCounts.set("database", (patternCounts.get("database") ?? 0) + 1);
  }

  analysis.errorPatterns = Array.from(patternCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([p]) => p);

  // Recent errors for context
  analysis.recentErrors = errors.slice(0, 5).map((e: any) => ({
    app: e.appName ?? "unknown",
    message: (e.message ?? "").slice(0, 200),
    time: e.timestamp ?? "",
  }));

  // Findings
  if (errors.length > 0) {
    analysis.findings.push(`${errors.length} error(s) found in recent logs`);
    if (analysis.errorPatterns.length > 0) {
      analysis.findings.push(`Dominant error pattern: ${humanizePattern(analysis.errorPatterns[0])}`);
    }
  }
  if (warnings.length > 5) {
    analysis.findings.push(`${warnings.length} warnings detected — may indicate emerging issues`);
  }

  return analysis;
}

function humanizePattern(pattern: string): string {
  const map: Record<string, string> = {
    out_of_memory: "Out of Memory (OOM)",
    timeout: "Request/Connection Timeouts",
    connection_refused: "Connection Refused (service down)",
    disk_full: "Disk Full (ENOSPC)",
    crash: "Application Crash/Kill",
    permission: "Permission/Access Denied",
    database: "Database Errors",
  };
  return map[pattern] ?? pattern;
}

// ─── Deployment analysis ──────────────────────────────────────────────────

interface DeployAnalysis {
  recentFailed: boolean;
  lastDeployStatus: string | null;
  lastDeployTime: string | null;
  failedStep: string | null;
  findings: string[];
}

function analyzeDeployments(data: ExtractedData): DeployAnalysis {
  const analysis: DeployAnalysis = {
    recentFailed: false,
    lastDeployStatus: null,
    lastDeployTime: null,
    failedStep: null,
    findings: [],
  };

  if (data.deployments.length === 0) return analysis;

  const latest = data.deployments[0];
  analysis.lastDeployStatus = latest.status;
  analysis.lastDeployTime = latest.completedAt ?? latest.startedAt ?? null;

  if (latest.status === "FAILED") {
    analysis.recentFailed = true;
    analysis.failedStep = latest.failedStep ?? null;
    analysis.findings.push(`Latest deployment failed${latest.failedStep ? ` at step: ${latest.failedStep}` : ""}`);
  }

  // Check for deployment storm (many failures in a row)
  const recentFails = data.deployments.filter((d: any) => d.status === "FAILED").length;
  if (recentFails >= 3) {
    analysis.findings.push(`${recentFails} recent deployments have failed — systemic issue likely`);
  }

  return analysis;
}

// ─── Correlation engine ───────────────────────────────────────────────────

interface Correlation {
  evidence: string[];
  possibleCauses: string[];
}

function correlateEvidence(
  metrics: MetricsAnalysis,
  logs: LogsAnalysis,
  deploy: DeployAnalysis
): Correlation {
  const evidence: string[] = [];
  const possibleCauses: string[] = [];

  // Combine findings as evidence
  evidence.push(...metrics.findings);
  evidence.push(...logs.findings);
  evidence.push(...deploy.findings);

  // ── Correlation: High CPU + Errors ─────────────────────────────────────
  if (metrics.cpuStatus !== "normal" && logs.hasErrors) {
    possibleCauses.push("High CPU load combined with application errors suggests a runaway process or infinite loop");
  }

  // ── Correlation: High RAM + OOM errors ─────────────────────────────────
  if (metrics.ramStatus !== "normal" && logs.errorPatterns.includes("out_of_memory")) {
    possibleCauses.push("Memory leak or insufficient RAM — the application is being OOM-killed");
  }

  // ── Correlation: High RAM without OOM ──────────────────────────────────
  if (metrics.ramStatus !== "normal" && !logs.errorPatterns.includes("out_of_memory")) {
    possibleCauses.push("Memory usage is growing — possible memory leak, cache bloat, or too many concurrent connections");
  }

  // ── Correlation: Recent deploy + Errors ────────────────────────────────
  if (deploy.recentFailed && logs.hasErrors) {
    possibleCauses.push("A recent failed deployment may have left the service in a broken state");
  }

  // ── Correlation: Disk full + errors ────────────────────────────────────
  if (metrics.diskStatus !== "normal" && logs.errorPatterns.includes("disk_full")) {
    possibleCauses.push("Disk is full — logs, temp files, or database growth may have consumed available space");
  }

  // ── Correlation: Timeouts + High CPU ───────────────────────────────────
  if (logs.errorPatterns.includes("timeout") && metrics.cpuStatus !== "normal") {
    possibleCauses.push("Request timeouts are likely caused by CPU saturation — the server cannot process requests fast enough");
  }

  // ── Correlation: Connection refused ────────────────────────────────────
  if (logs.errorPatterns.includes("connection_refused")) {
    possibleCauses.push("A dependent service (database, cache, or upstream API) is down or unreachable");
  }

  // ── Correlation: DB errors + slowness ──────────────────────────────────
  if (logs.errorPatterns.includes("database")) {
    possibleCauses.push("Database queries are failing or slow — check connection pool exhaustion or query performance");
  }

  // ── No specific correlations found ─────────────────────────────────────
  if (possibleCauses.length === 0 && evidence.length > 0) {
    if (metrics.cpuStatus !== "normal") possibleCauses.push("Heavy application load or inefficient processing");
    if (metrics.ramStatus !== "normal") possibleCauses.push("Memory growth from cache, session storage, or application state");
    if (logs.hasErrors) possibleCauses.push("Application errors may indicate a bug or dependency issue");
  }

  return { evidence, possibleCauses };
}

// ─── Severity determination ───────────────────────────────────────────────

function determineSeverity(
  metrics: MetricsAnalysis,
  logs: LogsAnalysis,
  deploy: DeployAnalysis
): DevOpsAnalysis["severity"] {
  // Critical: any metric critical OR server offline OR multiple failures
  if (
    metrics.cpuStatus === "critical" ||
    metrics.ramStatus === "critical" ||
    metrics.diskStatus === "critical" ||
    metrics.serverStatus === "offline" ||
    metrics.healthStatus === "critical"
  ) return "critical";

  // Critical: crash patterns or OOM
  if (logs.errorPatterns.includes("crash") || logs.errorPatterns.includes("out_of_memory")) {
    return "critical";
  }

  // Warning: elevated metrics or errors present
  if (
    metrics.cpuStatus === "warning" ||
    metrics.ramStatus === "warning" ||
    metrics.diskStatus === "warning" ||
    metrics.healthStatus === "warning" ||
    logs.hasErrors ||
    deploy.recentFailed
  ) return "warning";

  // Info: some warnings but no errors
  if (logs.hasWarnings) return "info";

  return "healthy";
}

// ─── Root cause builder ───────────────────────────────────────────────────

function buildRootCause(
  correlations: Correlation,
  classified: ClassifiedIntent
): string | null {
  if (correlations.possibleCauses.length === 0) return null;

  // Pick the most likely cause (first one from correlation)
  if (correlations.possibleCauses.length === 1) {
    return correlations.possibleCauses[0];
  }

  // Multiple possible causes
  return `Most likely: ${correlations.possibleCauses[0]}. ` +
    `Other possible factors: ${correlations.possibleCauses.slice(1).join("; ")}.`;
}

// ─── Recommendations builder ──────────────────────────────────────────────

function buildRecommendations(
  metrics: MetricsAnalysis,
  logs: LogsAnalysis,
  deploy: DeployAnalysis,
  severity: DevOpsAnalysis["severity"]
): string[] {
  const recs: string[] = [];

  // CPU recommendations
  if (metrics.cpuStatus === "critical") {
    recs.push("Identify the top CPU-consuming process (use `top` or `htop` on the server)");
    recs.push("Check for infinite loops, heavy computation, or denial-of-service patterns in application logs");
    recs.push("Consider horizontal scaling or upgrading the server's CPU resources");
  } else if (metrics.cpuStatus === "warning") {
    recs.push("Monitor CPU trends — if consistently above 70%, plan a scaling strategy");
    recs.push("Review recent code changes for performance regressions");
  }

  // RAM recommendations
  if (metrics.ramStatus === "critical") {
    recs.push("Restart the highest-memory application as an immediate fix");
    recs.push("Investigate memory leaks — check for growing heap in Node.js or unbounded caches");
    recs.push("Increase server RAM or add swap if this is recurring");
  } else if (metrics.ramStatus === "warning") {
    recs.push("Review container/application memory limits and set proper bounds");
    recs.push("Check for memory-intensive batch jobs running in the background");
  }

  // Disk recommendations
  if (metrics.diskStatus !== "normal") {
    recs.push("Clean up old log files, temporary files, and unused Docker images");
    recs.push("Review log rotation settings — ensure logs aren't growing unbounded");
    recs.push("Check database size growth if PostgreSQL/MySQL is on the same disk");
  }

  // Log-based recommendations
  if (logs.errorPatterns.includes("timeout")) {
    recs.push("Increase timeout limits or optimize the slow operations causing timeouts");
    recs.push("Check external dependencies (databases, APIs) for latency issues");
  }
  if (logs.errorPatterns.includes("connection_refused")) {
    recs.push("Verify the dependent service is running (database, Redis, upstream API)");
    recs.push("Check firewall rules and network connectivity between services");
  }
  if (logs.errorPatterns.includes("database")) {
    recs.push("Review slow query logs and add indexes for frequently queried columns");
    recs.push("Check database connection pool limits — may need to increase max connections");
  }

  // Deployment recommendations
  if (deploy.recentFailed) {
    recs.push("Review the failed deployment logs to identify the exact failure point");
    recs.push("Consider rolling back to the last successful deployment");
  }

  // General recommendations if nothing specific
  if (recs.length === 0) {
    if (severity === "healthy") {
      recs.push("All systems appear healthy — no immediate action required");
    } else {
      recs.push("Continue monitoring the situation and check again in 15 minutes");
    }
  }

  return recs.slice(0, 5); // Cap at 5 recommendations
}

// ─── Summary builder ──────────────────────────────────────────────────────

function buildSummary(
  classified: ClassifiedIntent,
  metrics: MetricsAnalysis,
  logs: LogsAnalysis,
  deploy: DeployAnalysis,
  severity: DevOpsAnalysis["severity"]
): string {
  const serverRef = metrics.serverName ? `on **${metrics.serverName}**` : "on your infrastructure";

  // Build contextual summary based on the dominant issue
  if (severity === "critical") {
    if (metrics.cpuStatus === "critical") {
      return `Your server ${serverRef} is under severe CPU pressure (${metrics.cpuValue?.toFixed(0) ?? "90+"}%). ` +
        `This is likely causing slow responses and potential request timeouts.`;
    }
    if (metrics.ramStatus === "critical") {
      return `Memory usage ${serverRef} has reached a critical level (${metrics.ramValue?.toFixed(0) ?? "95+"}%). ` +
        `Applications are at risk of being killed by the OOM killer.`;
    }
    if (metrics.diskStatus === "critical") {
      return `Disk space ${serverRef} is nearly exhausted (${metrics.diskValue?.toFixed(0) ?? "95+"}% used). ` +
        `Services may fail to write logs, data, or temporary files.`;
    }
    if (metrics.serverStatus === "offline") {
      return `The server ${serverRef} is currently unreachable. ` +
        `It may have crashed, lost network connectivity, or the monitoring agent has stopped reporting.`;
    }
    return `A critical issue has been detected ${serverRef} that requires immediate attention.`;
  }

  if (severity === "warning") {
    if (deploy.recentFailed) {
      return `The latest deployment ${serverRef} has failed${deploy.failedStep ? ` at the "${deploy.failedStep}" step` : ""}. ` +
        `The service may be running an older version or in a degraded state.`;
    }
    if (logs.hasErrors) {
      return `I've detected ${logs.recentErrors.length} recent errors in the application logs ${serverRef}. ` +
        `${logs.errorPatterns.length > 0 ? `The primary pattern is: ${humanizePattern(logs.errorPatterns[0])}.` : ""}`;
    }
    const issues: string[] = [];
    if (metrics.cpuStatus === "warning") issues.push(`CPU at ${metrics.cpuValue?.toFixed(0)}%`);
    if (metrics.ramStatus === "warning") issues.push(`RAM at ${metrics.ramValue?.toFixed(0)}%`);
    if (metrics.diskStatus === "warning") issues.push(`Disk at ${metrics.diskValue?.toFixed(0)}%`);
    return `There are elevated resource levels ${serverRef}: ${issues.join(", ")}. ` +
      `Not critical yet, but worth investigating before it escalates.`;
  }

  if (severity === "healthy") {
    return `Everything looks good ${serverRef}. All metrics are within normal ranges ` +
      `and no errors were found in recent logs.`;
  }

  // Info level
  return `I've analyzed the current state ${serverRef}. ` +
    `There are some minor warnings but nothing requiring immediate action.`;
}

// ─── Next actions builder ─────────────────────────────────────────────────

function buildNextActions(
  severity: DevOpsAnalysis["severity"],
  data: ExtractedData
): string[] {
  const actions: string[] = [];

  if (severity === "critical") {
    actions.push("Investigate immediately — check the server's process list and system logs");
    if (data.serverDetail?.status === "offline") {
      actions.push("Verify network connectivity and try SSHing into the server");
    }
  }

  if (data.missingData.length > 0) {
    actions.push("Connect the monitoring agent to get real-time metrics and logs");
  }

  if (severity !== "healthy" && data.logs.length === 0) {
    actions.push("Check application logs directly on the server for more context");
  }

  if (severity === "healthy") {
    actions.push("No immediate action needed — I'll continue monitoring");
  }

  return actions.slice(0, 3);
}

// ─── No data scenario ─────────────────────────────────────────────────────

function buildNoDataAnalysis(data: ExtractedData, classified: ClassifiedIntent): DevOpsAnalysis {
  const serverRef = classified.entities.servers?.[0]
    ? `for "${classified.entities.servers[0]}"`
    : "for your infrastructure";

  return {
    summary: `I cannot provide a complete analysis ${serverRef} because I don't have enough data to work with. ` +
      `This usually means the monitoring agent isn't connected or hasn't sent recent data.`,
    rootCause: null,
    evidence: [],
    severity: "info",
    recommendations: [
      "Ensure the Unwire monitoring agent is installed and running on your server",
      "Verify the agent can reach this platform (check firewall and network rules)",
      "If you recently connected the server, wait a few minutes for the first metrics to arrive",
      "Check the server's agent token is correctly configured",
    ],
    nextActions: [
      "Go to the Servers tab and verify your server shows as 'online'",
      "If the server shows 'offline', click on it and follow the agent installation instructions",
    ],
    missingData: data.missingData.length > 0 ? data.missingData : [
      "No metrics, logs, or server data available for analysis",
    ],
  };
}

// ─── Helper ───────────────────────────────────────────────────────────────

function getMissingDataMessage(toolName: string): string {
  const map: Record<string, string> = {
    server_metrics: "Server metrics could not be retrieved",
    logs_search: "Log search failed — check if the server is forwarding logs",
    deployment_history: "Deployment history is unavailable",
    project_context: "Project context could not be loaded",
    codebase_search: "Codebase search is unavailable",
  };
  return map[toolName] ?? `The ${toolName} tool failed to return data`;
}

// ─── Format analysis as natural language ──────────────────────────────────

/**
 * formatAnalysisAsResponse
 *
 * Converts the structured DevOps analysis into a natural language
 * response suitable for the chat UI.
 */
export function formatAnalysisAsResponse(analysis: DevOpsAnalysis): string {
  let response = "";

  // Summary (always first)
  response += analysis.summary + "\n";

  // Root cause
  if (analysis.rootCause) {
    response += `\n**Root Cause:** ${analysis.rootCause}\n`;
  }

  // Evidence
  if (analysis.evidence.length > 0) {
    response += `\n**Evidence:**\n`;
    for (const e of analysis.evidence) {
      response += `• ${e}\n`;
    }
  }

  // Recommendations
  if (analysis.recommendations.length > 0) {
    response += `\n**Recommendations:**\n`;
    for (let i = 0; i < analysis.recommendations.length; i++) {
      response += `${i + 1}. ${analysis.recommendations[i]}\n`;
    }
  }

  // Next actions
  if (analysis.nextActions.length > 0) {
    response += `\n**Next Steps:**\n`;
    for (const a of analysis.nextActions) {
      response += `→ ${a}\n`;
    }
  }

  // Missing data notice
  if (analysis.missingData.length > 0) {
    response += `\n---\n⚠️ *${analysis.missingData[0]}*\n`;
  }

  return response.trim();
}
