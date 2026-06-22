/**
 * planConfig.ts
 *
 * Plan configuration — defines limits and features per plan tier.
 * NOT hardcoded in the database. Easy to change without migrations.
 */

export type PlanTier = "free" | "pro" | "enterprise";

export interface PlanLimits {
  maxServers: number;
  maxProjects: number;
  maxMembers: number;
  maxAiRequestsPerDay: number;
  maxDeploymentsPerMonth: number;
  maxApiKeys: number;
  features: string[];
}

export const PLAN_CONFIG: Record<PlanTier, PlanLimits> = {
  free: {
    maxServers: 1,
    maxProjects: 1,
    maxMembers: 2,
    maxAiRequestsPerDay: 20,
    maxDeploymentsPerMonth: 5,
    maxApiKeys: 1,
    features: ["basic_monitoring", "ai_assistant", "alerts"],
  },
  pro: {
    maxServers: 20,
    maxProjects: 50,
    maxMembers: 15,
    maxAiRequestsPerDay: 500,
    maxDeploymentsPerMonth: 200,
    maxApiKeys: 10,
    features: [
      "basic_monitoring", "ai_assistant", "alerts",
      "advanced_ai", "deployment_pipeline", "audit_logs",
      "api_keys", "custom_alerts", "team_management",
    ],
  },
  enterprise: {
    maxServers: -1,    // unlimited
    maxProjects: -1,
    maxMembers: -1,
    maxAiRequestsPerDay: -1,
    maxDeploymentsPerMonth: -1,
    maxApiKeys: -1,
    features: [
      "basic_monitoring", "ai_assistant", "alerts",
      "advanced_ai", "deployment_pipeline", "audit_logs",
      "api_keys", "custom_alerts", "team_management",
      "sso", "priority_support", "sla", "custom_integrations",
    ],
  },
};

export function getPlanLimits(plan: string): PlanLimits {
  return PLAN_CONFIG[(plan as PlanTier)] ?? PLAN_CONFIG.free;
}

export function isWithinLimit(current: number, max: number): boolean {
  if (max === -1) return true; // unlimited
  return current < max;
}
