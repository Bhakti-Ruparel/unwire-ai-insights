/**
 * serverAI.ts
 *
 * AI assistant for server management questions.
 * Uses structured context (logs + metrics + apps) to answer questions like:
 *  - "Why did my backend restart?"
 *  - "Why is CPU high?"
 *  - "What caused the error at 10:34?"
 *  - "Is my server healthy?"
 *
 * Falls back to structured answers if OpenAI is not configured.
 */

import { prisma } from "../database/db";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ServerAIAnswer {
  answer: string;
  usedAI: boolean;
  context: {
    logsAnalyzed: number;
    metricsAnalyzed: number;
  };
}

// ─── Main entry ────────────────────────────────────────────────────────────

export async function askServerAI(
  serverId: string,
  question: string
): Promise<ServerAIAnswer> {
  const lq = question.toLowerCase();

  // Fetch context in parallel
  const [server, recentLogs, recentMetrics, apps] = await Promise.all([
    prisma.server.findUnique({ where: { id: serverId } }),
    prisma.serverLog.findMany({
      where: { serverId },
      orderBy: { timestamp: "desc" },
      take: 50,
    }),
    prisma.serverMetric.findMany({
      where: { serverId },
      orderBy: { recordedAt: "desc" },
      take: 12,
    }),
    prisma.serverApp.findMany({ where: { serverId } }),
  ]);

  if (!server) {
    return { answer: "Server not found.", usedAI: false, context: { logsAnalyzed: 0, metricsAnalyzed: 0 } };
  }

  // ── Try OpenAI if available ──────────────────────────────────────────────
  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey) {
    try {
      const answer = await callOpenAI(question, server.name, recentLogs, recentMetrics, apps);
      return {
        answer,
        usedAI: true,
        context: { logsAnalyzed: recentLogs.length, metricsAnalyzed: recentMetrics.length },
      };
    } catch (err) {
      console.warn("[serverAI] OpenAI call failed, using structured fallback:", err);
    }
  }

  // ── Structured fallback ──────────────────────────────────────────────────
  const answer = buildStructuredAnswer(lq, server.name, recentLogs, recentMetrics, apps);
  return {
    answer,
    usedAI: false,
    context: { logsAnalyzed: recentLogs.length, metricsAnalyzed: recentMetrics.length },
  };
}

// ─── OpenAI call ──────────────────────────────────────────────────────────

async function callOpenAI(
  question: string,
  serverName: string,
  logs: any[],
  metrics: any[],
  apps: any[]
): Promise<string> {
  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const logLines = logs
    .slice(0, 30)
    .map((l) => `[${new Date(l.timestamp).toLocaleTimeString()}] [${l.level.toUpperCase()}] ${l.appName}: ${l.message}`)
    .join("\n");

  const metricsText = metrics
    .slice(0, 5)
    .map((m) => `CPU: ${m.cpuPercent.toFixed(1)}% | RAM: ${m.ramPercent.toFixed(1)}% | Disk: ${m.diskPercent.toFixed(1)}%`)
    .join("\n");

  const appsText = apps
    .map((a) => `${a.name} (${a.type}): ${a.status}, port ${a.port ?? "—"}, memory ${a.memory.toFixed(0)}MB`)
    .join("\n");

  const systemPrompt = `You are an expert DevOps AI assistant for Unwire AI.
You have access to real server data and must answer questions precisely.
Always reference specific log entries or metrics when explaining issues.
Be concise and actionable.`;

  const userMessage = `Server: ${serverName}

Applications:
${appsText || "No applications registered."}

Recent metrics (latest first):
${metricsText || "No metrics available."}

Recent logs (latest first):
${logLines || "No logs available."}

Question: ${question}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user",   content: userMessage },
    ],
    max_tokens: 512,
    temperature: 0.2,
  });

  return completion.choices[0]?.message?.content?.trim() ?? "Unable to generate answer.";
}

// ─── Structured fallback ──────────────────────────────────────────────────

function buildStructuredAnswer(
  lq: string,
  serverName: string,
  logs: any[],
  metrics: any[],
  apps: any[]
): string {
  const latestMetric = metrics[0];
  const errorLogs = logs.filter((l) => l.level === "error");
  const warnLogs  = logs.filter((l) => l.level === "warn");

  // Restart / crash question
  if (lq.includes("restart") || lq.includes("crash") || lq.includes("down")) {
    if (errorLogs.length > 0) {
      const last = errorLogs[0];
      return `**${serverName}** had a restart/crash event. The most recent error log:\n\n` +
        `\`[${new Date(last.timestamp).toLocaleTimeString()}] ${last.appName}: ${last.message}\`\n\n` +
        (latestMetric?.ramPercent > 90
          ? `Memory usage is at **${latestMetric.ramPercent.toFixed(0)}%** — this may have triggered an OOM kill.`
          : `Check the application logs for the full stack trace.`);
    }
    return `No error logs found that explain a restart on **${serverName}**. The server is currently showing status: ${apps.find(a => a.status === "stopped") ? "some apps are stopped" : "all apps running"}.`;
  }

  // CPU question
  if (lq.includes("cpu") || lq.includes("slow") || lq.includes("performance")) {
    if (!latestMetric) return `No metrics data available for **${serverName}** yet.`;
    const cpu = latestMetric.cpuPercent.toFixed(1);
    const highCpuApps = apps.filter(a => a.cpu > 50);
    let answer = `Current CPU usage on **${serverName}**: **${cpu}%**\n\n`;
    if (latestMetric.cpuPercent > 80) {
      answer += `⚠️ CPU is critically high. `;
      if (highCpuApps.length > 0) {
        answer += `High CPU apps: ${highCpuApps.map(a => `${a.name} (${a.cpu.toFixed(0)}%)`).join(", ")}.`;
      }
    } else if (latestMetric.cpuPercent > 60) {
      answer += `CPU is elevated but manageable.`;
    } else {
      answer += `CPU is within normal range.`;
    }
    return answer;
  }

  // Memory question
  if (lq.includes("memory") || lq.includes("ram") || lq.includes("oom")) {
    if (!latestMetric) return `No metrics data available for **${serverName}** yet.`;
    const ram = latestMetric.ramPercent.toFixed(1);
    let answer = `Current RAM usage on **${serverName}**: **${ram}%**\n\n`;
    const highMemApps = apps.filter(a => a.memory > 500);
    if (latestMetric.ramPercent > 85) {
      answer += `⚠️ Memory is critically high. Consider scaling up or restarting memory-heavy applications.`;
      if (highMemApps.length > 0) {
        answer += `\n\nHigh memory apps: ${highMemApps.map(a => `${a.name} (${a.memory.toFixed(0)}MB)`).join(", ")}.`;
      }
    } else {
      answer += `Memory usage is normal.`;
    }
    return answer;
  }

  // Logs / error question
  if (lq.includes("error") || lq.includes("log") || lq.includes("issue")) {
    if (errorLogs.length === 0 && warnLogs.length === 0) {
      return `No errors or warnings found in the recent logs for **${serverName}**.`;
    }
    let answer = `**Recent issues on ${serverName}:**\n\n`;
    if (errorLogs.length > 0) {
      answer += `**Errors (${errorLogs.length}):**\n`;
      answer += errorLogs.slice(0, 5).map(l =>
        `- \`[${new Date(l.timestamp).toLocaleTimeString()}] ${l.appName}: ${l.message}\``
      ).join("\n") + "\n\n";
    }
    if (warnLogs.length > 0) {
      answer += `**Warnings (${warnLogs.length}):**\n`;
      answer += warnLogs.slice(0, 3).map(l =>
        `- \`${l.appName}: ${l.message}\``
      ).join("\n");
    }
    return answer;
  }

  // Health question
  if (lq.includes("health") || lq.includes("status") || lq.includes("ok") || lq.includes("healthy")) {
    const stoppedApps = apps.filter(a => a.status === "stopped" || a.status === "error");
    const runningApps = apps.filter(a => a.status === "running");
    let answer = `**Health summary for ${serverName}:**\n\n`;
    answer += `- Applications: ${runningApps.length} running, ${stoppedApps.length} stopped/error\n`;
    if (latestMetric) {
      answer += `- CPU: ${latestMetric.cpuPercent.toFixed(0)}% | RAM: ${latestMetric.ramPercent.toFixed(0)}% | Disk: ${latestMetric.diskPercent.toFixed(0)}%\n`;
    }
    answer += `- Recent errors: ${errorLogs.length}\n`;
    const isHealthy = stoppedApps.length === 0 && errorLogs.length < 3 && (!latestMetric || latestMetric.cpuPercent < 80);
    answer += `\n**Overall: ${isHealthy ? "✅ Healthy" : "⚠️ Needs attention"}**`;
    return answer;
  }

  // Default
  return `**${serverName}** status:\n\n` +
    `- ${apps.length} applications registered\n` +
    `- ${errorLogs.length} recent errors, ${warnLogs.length} warnings\n` +
    (latestMetric ? `- CPU: ${latestMetric.cpuPercent.toFixed(0)}% | RAM: ${latestMetric.ramPercent.toFixed(0)}%\n` : "") +
    `\nAsk me specific questions like "Why did my backend restart?" or "Is CPU high?"`;
}
