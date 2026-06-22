/**
 * logger.ts
 *
 * Structured JSON logger for production observability.
 * Outputs JSON in production, human-readable in development.
 * Includes request_id, user_id, organization_id, duration.
 */

const IS_PROD = process.env.NODE_ENV === "production";

export type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  requestId?: string;
  userId?: string;
  organizationId?: string;
  duration?: number;
  method?: string;
  path?: string;
  status?: number;
  error?: string;
  [key: string]: unknown;
}

function emit(entry: LogEntry): void {
  if (IS_PROD) {
    // JSON structured output for log aggregation (CloudWatch, Datadog, etc.)
    const line = JSON.stringify(entry);
    if (entry.level === "error") process.stderr.write(line + "\n");
    else process.stdout.write(line + "\n");
  } else {
    // Human-readable in development
    const prefix = `[${entry.level.toUpperCase().padEnd(5)}]`;
    const meta = [
      entry.method && entry.path ? `${entry.method} ${entry.path}` : "",
      entry.status ? `${entry.status}` : "",
      entry.duration != null ? `${entry.duration}ms` : "",
      entry.userId ? `user:${entry.userId.slice(0, 8)}` : "",
    ].filter(Boolean).join(" ");
    console.log(`${prefix} ${entry.message}${meta ? ` (${meta})` : ""}`);
  }
}

export const logger = {
  debug(message: string, ctx?: Partial<LogEntry>) {
    if (IS_PROD) return; // Skip debug in production
    emit({ level: "debug", message, timestamp: new Date().toISOString(), ...ctx });
  },
  info(message: string, ctx?: Partial<LogEntry>) {
    emit({ level: "info", message, timestamp: new Date().toISOString(), ...ctx });
  },
  warn(message: string, ctx?: Partial<LogEntry>) {
    emit({ level: "warn", message, timestamp: new Date().toISOString(), ...ctx });
  },
  error(message: string, ctx?: Partial<LogEntry>) {
    emit({ level: "error", message, timestamp: new Date().toISOString(), ...ctx });
  },
};
