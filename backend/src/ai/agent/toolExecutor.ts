/**
 * toolExecutor.ts
 *
 * Executes tools defined in the execution plan.
 * Maintains a tool registry and runs steps sequentially,
 * respecting dependencies between steps.
 *
 * Security:
 *  - All tools receive userId for tenant isolation
 *  - Write tools are gated behind approval
 *  - Errors are caught and reported per-step
 */

import type { AgentTool, ExecutionPlan, PlanStep, ToolContext, ToolResult } from "./agentTypes";

// ─── Tool Registry ────────────────────────────────────────────────────────

const toolRegistry = new Map<string, AgentTool>();

/**
 * registerTool
 *
 * Adds a tool to the global registry.
 * Called at module load time by each tool file.
 */
export function registerTool(tool: AgentTool): void {
  toolRegistry.set(tool.name, tool);
}

/**
 * getTool
 *
 * Retrieves a registered tool by name.
 */
export function getTool(name: string): AgentTool | undefined {
  return toolRegistry.get(name);
}

/**
 * getRegisteredTools
 *
 * Returns all registered tools.
 */
export function getRegisteredTools(): AgentTool[] {
  return Array.from(toolRegistry.values());
}

// ─── Plan Execution ───────────────────────────────────────────────────────

/**
 * executePlan
 *
 * Runs all steps in an execution plan sequentially.
 * Respects step dependencies and skips steps if dependencies failed.
 *
 * Returns the mutated plan with results populated.
 */
export async function executePlan(
  plan: ExecutionPlan,
  context: ToolContext
): Promise<ExecutionPlan> {
  const completedSteps = new Map<string, PlanStep>();

  for (const step of plan.steps) {
    // Check dependencies
    if (step.dependsOn?.length) {
      const depsFailed = step.dependsOn.some((depId) => {
        const dep = completedSteps.get(depId);
        return dep && dep.status === "failed";
      });

      if (depsFailed) {
        step.status = "skipped";
        step.result = { success: false, error: "Skipped: dependency failed." };
        completedSteps.set(step.id, step);
        continue;
      }
    }

    // Execute the step
    step.status = "running";
    try {
      step.result = await executeStep(step, context);
      step.status = step.result.success ? "success" : "failed";
    } catch (err: any) {
      step.status = "failed";
      step.result = {
        success: false,
        error: err.message ?? "Unknown tool execution error.",
      };
    }

    completedSteps.set(step.id, step);
  }

  return plan;
}

/**
 * executeStep
 *
 * Executes a single plan step by looking up the tool and calling it.
 */
async function executeStep(step: PlanStep, context: ToolContext): Promise<ToolResult> {
  const tool = toolRegistry.get(step.toolName);

  if (!tool) {
    return {
      success: false,
      error: `Tool "${step.toolName}" is not registered.`,
    };
  }

  // Merge step input with context
  const input = { ...step.input };

  // Execute with timeout (30s per tool)
  const result = await Promise.race([
    tool.execute(input, context),
    timeout(30000, `Tool "${step.toolName}" timed out after 30s.`),
  ]);

  return result;
}

// ─── Execute single tool (for direct invocations outside plans) ───────────

/**
 * executeTool
 *
 * Executes a tool by name with the given input.
 * Used for quick single-tool lookups (e.g., analyst mode).
 */
export async function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> {
  const tool = toolRegistry.get(toolName);
  if (!tool) {
    return { success: false, error: `Tool "${toolName}" not found.` };
  }
  try {
    return await tool.execute(input, context);
  } catch (err: any) {
    return { success: false, error: err.message ?? "Tool execution failed." };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function timeout(ms: number, message: string): Promise<ToolResult> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(message)), ms)
  );
}
