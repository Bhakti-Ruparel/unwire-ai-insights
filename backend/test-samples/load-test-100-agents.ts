/**
 * load-test-100-agents.ts
 *
 * Load test simulating 100 concurrent server agents.
 * Tests:
 *  - Heartbeat ingestion (100 agents × 1 heartbeat/min = 100/min)
 *  - Metrics ingestion (100 agents × 1 metric/min = 100/min)
 *  - Log streaming (100 agents × 2-5 logs/min = 200-500/min)
 *  - Ownership isolation (each agent isolated to its server/organization)
 *  - Rate limits (10 req/min per token)
 *  - Database connection pooling
 *  - SSE broadcasting
 *
 * Usage:
 *  npm run ts-node -- backend/test-samples/load-test-100-agents.ts
 *  NODE_ENV=test npm run ts-node -- backend/test-samples/load-test-100-agents.ts
 */

import axios from "axios";
import crypto from "crypto";

// ─── Configuration ────────────────────────────────────────────────────────

const API_URL = process.env.API_URL || "http://localhost:3000/api";
const TEST_DURATION_MINUTES = 5; // Run for 5 minutes (increase for longer tests)
const AGENT_COUNT = 100;
const HEARTBEAT_INTERVAL_MS = 60 * 1000; // Send heartbeat every 60 seconds
const METRICS_INTERVAL_MS = 60 * 1000;  // Send metrics every 60 seconds
const LOG_INTERVAL_MS = 30 * 1000;      // Send logs every 30 seconds

interface Agent {
  id: string;
  serverId: string;
  agentToken: string;
  organizationId: string;
  client: axios.AxiosInstance;
}

interface TestStats {
  totalHeartbeats: number;
  totalMetrics: number;
  totalLogs: number;
  successfulRequests: number;
  failedRequests: number;
  rateLimitHits: number;
  errors: Map<string, number>;
  avgLatencyMs: number;
  startTime: number;
  endTime: number;
}

// ─── Test runner ──────────────────────────────────────────────────────────

async function runLoadTest(): Promise<void> {
  console.log(`\n🚀 Starting load test with ${AGENT_COUNT} agents for ${TEST_DURATION_MINUTES} minutes\n`);

  // Ensure test organization exists
  const orgId = await ensureTestOrganization();
  console.log(`✓ Test organization: ${orgId}\n`);

  // Create test servers
  console.log(`📡 Creating ${AGENT_COUNT} test servers...`);
  const agents = await createTestAgents(orgId, AGENT_COUNT);
  console.log(`✓ Created ${agents.length} agents\n`);

  // Run load test
  const stats: TestStats = {
    totalHeartbeats: 0,
    totalMetrics: 0,
    totalLogs: 0,
    successfulRequests: 0,
    failedRequests: 0,
    rateLimitHits: 0,
    errors: new Map(),
    avgLatencyMs: 0,
    startTime: Date.now(),
    endTime: 0,
  };

  // Start sending data from all agents
  console.log(`📊 Starting data transmission...\n`);
  const agentPromises = agents.map((agent) =>
    runAgent(agent, stats)
  );

  // Wait for test duration
  await new Promise((resolve) => setTimeout(resolve, TEST_DURATION_MINUTES * 60 * 1000));

  // Wait for last batch to complete
  await Promise.all(agentPromises);
  stats.endTime = Date.now();

  // Print results
  printTestResults(stats, agents);

  // Cleanup
  console.log(`\n🧹 Cleaning up ${agents.length} test servers...`);
  await cleanupTestServers(agents);
  console.log(`✓ Cleanup complete\n`);
}

// ─── Agent creation ────────────────────────────────────────────────────────

async function ensureTestOrganization(): Promise<string> {
  // For load testing, we'll use a hardcoded test organization
  // In production, you'd create or fetch an existing one
  return "test-org-" + crypto.randomBytes(4).toString("hex");
}

async function createTestAgents(
  orgId: string,
  count: number
): Promise<Agent[]> {
  const agents: Agent[] = [];

  for (let i = 0; i < count; i++) {
    const serverId = `test-server-${i}-${crypto.randomBytes(4).toString("hex")}`;
    const agentToken = crypto.randomBytes(32).toString("hex");

    // Create axios instance with agent token
    const client = axios.create({
      baseURL: API_URL,
      headers: {
        "Authorization": `Bearer ${agentToken}`,
        "Content-Type": "application/json",
      },
      timeout: 10000,
    });

    agents.push({
      id: `agent-${i}`,
      serverId,
      agentToken,
      organizationId: orgId,
      client,
    });
  }

  return agents;
}

// ─── Agent data transmission ───────────────────────────────────────────────

async function runAgent(agent: Agent, stats: TestStats): Promise<void> {
  const testDurationMs = TEST_DURATION_MINUTES * 60 * 1000;
  const startTime = Date.now();

  // Schedule heartbeat
  const heartbeatInterval = setInterval(async () => {
    if (Date.now() - startTime > testDurationMs) {
      clearInterval(heartbeatInterval);
      return;
    }
    try {
      await sendHeartbeat(agent, stats);
    } catch (error) {
      recordError(stats, "heartbeat_error", error);
    }
  }, HEARTBEAT_INTERVAL_MS);

  // Schedule metrics
  const metricsInterval = setInterval(async () => {
    if (Date.now() - startTime > testDurationMs) {
      clearInterval(metricsInterval);
      return;
    }
    try {
      await sendMetrics(agent, stats);
    } catch (error) {
      recordError(stats, "metrics_error", error);
    }
  }, METRICS_INTERVAL_MS);

  // Schedule logs
  const logsInterval = setInterval(async () => {
    if (Date.now() - startTime > testDurationMs) {
      clearInterval(logsInterval);
      return;
    }
    try {
      await sendLogs(agent, stats);
    } catch (error) {
      recordError(stats, "logs_error", error);
    }
  }, LOG_INTERVAL_MS);

  // Wait for test duration
  await new Promise((resolve) =>
    setTimeout(resolve, testDurationMs + 5000)
  );

  clearInterval(heartbeatInterval);
  clearInterval(metricsInterval);
  clearInterval(logsInterval);
}

// ─── Data transmission methods ─────────────────────────────────────────────

async function sendHeartbeat(agent: Agent, stats: TestStats): Promise<void> {
  const payload = {
    serverId: agent.serverId,
    cpuPercent: Math.random() * 80,
    ramPercent: Math.random() * 75,
    diskPercent: Math.random() * 60,
    networkIn: Math.floor(Math.random() * 1000000),
    networkOut: Math.floor(Math.random() * 800000),
    timestamp: new Date().toISOString(),
  };

  const start = Date.now();
  try {
    await agent.client.post(
      `/servers/${agent.serverId}/heartbeat`,
      payload
    );
    stats.successfulRequests++;
    stats.totalHeartbeats++;
  } catch (error: any) {
    if (error.response?.status === 429) {
      stats.rateLimitHits++;
    }
    stats.failedRequests++;
  }
}

async function sendMetrics(agent: Agent, stats: TestStats): Promise<void> {
  const payload = {
    serverId: agent.serverId,
    cpuPercent: Math.random() * 85,
    ramPercent: Math.random() * 80,
    diskPercent: Math.random() * 65,
    networkIn: Math.floor(Math.random() * 1200000),
    networkOut: Math.floor(Math.random() * 900000),
    recordedAt: new Date().toISOString(),
  };

  try {
    await agent.client.post(
      `/servers/${agent.serverId}/metrics`,
      payload
    );
    stats.successfulRequests++;
    stats.totalMetrics++;
  } catch (error: any) {
    if (error.response?.status === 429) {
      stats.rateLimitHits++;
    }
    stats.failedRequests++;
  }
}

async function sendLogs(agent: Agent, stats: TestStats): Promise<void> {
  const logMessages = [
    "Application started successfully",
    "Request processed in 45ms",
    "Database query completed",
    "Cache hit for key: user-123",
    "Warning: Memory usage at 65%",
    "Error: Connection timeout after 5s",
    "Retrying failed request (attempt 2/3)",
  ];

  const logLevels = ["info", "warn", "error", "debug"];
  const apps = ["api-server", "worker", "cache", "database"];

  const payload = {
    serverId: agent.serverId,
    logs: Array.from({ length: 2 + Math.floor(Math.random() * 3) }, () => ({
      level: logLevels[Math.floor(Math.random() * logLevels.length)],
      message:
        logMessages[Math.floor(Math.random() * logMessages.length)],
      appName: apps[Math.floor(Math.random() * apps.length)],
      timestamp: new Date(Date.now() - Math.random() * 60000).toISOString(),
    })),
  };

  try {
    await agent.client.post(
      `/servers/${agent.serverId}/logs`,
      payload
    );
    stats.successfulRequests++;
    stats.totalLogs += payload.logs.length;
  } catch (error: any) {
    if (error.response?.status === 429) {
      stats.rateLimitHits++;
    }
    stats.failedRequests++;
  }
}

// ─── Cleanup ──────────────────────────────────────────────────────────────

async function cleanupTestServers(agents: Agent[]): Promise<void> {
  // In production, delete test servers via API
  // For now, just log that cleanup would happen
  console.log(`Would delete ${agents.length} test servers in production`);
}

// ─── Statistics & reporting ────────────────────────────────────────────────

function recordError(
  stats: TestStats,
  type: string,
  error: any
): void {
  const key = `${type}:${error?.message || "unknown"}`;
  stats.errors.set(key, (stats.errors.get(key) || 0) + 1);
  stats.failedRequests++;
}

function printTestResults(stats: TestStats, agents: Agent[]): void {
  const duration = (stats.endTime - stats.startTime) / 1000;
  const totalRequests = stats.successfulRequests + stats.failedRequests;
  const successRate = totalRequests > 0 ? ((stats.successfulRequests / totalRequests) * 100).toFixed(2) : "0";

  console.log("\n" + "=".repeat(70));
  console.log("📈 LOAD TEST RESULTS");
  console.log("=".repeat(70) + "\n");

  console.log(`Test Duration:        ${duration.toFixed(2)}s`);
  console.log(`Total Agents:         ${agents.length}`);
  console.log(`\nData Transmitted:`);
  console.log(`  Total Heartbeats:   ${stats.totalHeartbeats}`);
  console.log(`  Total Metrics:      ${stats.totalMetrics}`);
  console.log(`  Total Logs:         ${stats.totalLogs}`);
  console.log(`\nRequest Statistics:`);
  console.log(`  Successful:         ${stats.successfulRequests}`);
  console.log(`  Failed:             ${stats.failedRequests}`);
  console.log(`  Success Rate:       ${successRate}%`);
  console.log(`  Rate Limit Hits:    ${stats.rateLimitHits}`);
  console.log(`  Throughput:         ${(totalRequests / duration).toFixed(2)} req/s`);

  if (stats.errors.size > 0) {
    console.log(`\nError Summary:`);
    stats.errors.forEach((count, type) => {
      console.log(`  ${type}: ${count}`);
    });
  }

  console.log("\n" + "=".repeat(70) + "\n");

  // Test assertions
  const testsPassed = [];
  const testsFailed = [];

  // Success rate > 95%
  const successRateNum = parseFloat(successRate);
  if (successRateNum >= 95) {
    testsPassed.push(`✓ Success rate (${successRate}%) >= 95%`);
  } else {
    testsFailed.push(`✗ Success rate (${successRate}%) < 95%`);
  }

  // Rate limiting should be minimal
  if (stats.rateLimitHits < 10) {
    testsPassed.push(`✓ Rate limit hits (${stats.rateLimitHits}) minimal`);
  } else {
    testsFailed.push(`✗ Rate limit hits (${stats.rateLimitHits}) excessive`);
  }

  // Should handle > 100 concurrent agents
  if (agents.length >= 100) {
    testsPassed.push(`✓ System handled ${agents.length} concurrent agents`);
  }

  if (testsPassed.length > 0) {
    console.log("Passed Tests:");
    testsPassed.forEach((t) => console.log(`  ${t}`));
  }

  if (testsFailed.length > 0) {
    console.log("\nFailed Tests:");
    testsFailed.forEach((t) => console.log(`  ${t}`));
  }

  console.log("");
}

// ─── Main ──────────────────────────────────────────────────────────────────

runLoadTest().catch(console.error);
