/**
 * dockerProvider.ts
 *
 * Docker host infrastructure provider.
 * Connects to a Docker daemon via HTTP API (tcp:// or unix://).
 */

import axios from "axios";
import {
  registerProvider,
  type InfrastructureProvider,
  type ProviderCredentials,
  type DiscoveredResource,
  type ResourceMetrics,
  type ValidationResult,
  type CredentialField,
} from "../providerInterface";

const dockerProvider: InfrastructureProvider = {
  type: "docker",
  displayName: "Docker",

  getRequiredCredentialFields(): CredentialField[] {
    return [
      { key: "host", label: "Docker Host URL", type: "text", placeholder: "http://localhost:2375", required: true },
      { key: "tlsCert", label: "TLS Certificate (optional)", type: "password", required: false },
    ];
  },

  async validateCredentials(creds: ProviderCredentials): Promise<ValidationResult> {
    try {
      const host = creds.host?.replace(/\/$/, "") || "http://localhost:2375";
      const res = await axios.get(`${host}/version`, { timeout: 5_000 });
      return { valid: true, accountId: `Docker ${res.data?.Version ?? ""}` };
    } catch (err: any) {
      return { valid: false, error: `Cannot connect to Docker host: ${err.message}` };
    }
  },

  async discoverResources(creds: ProviderCredentials): Promise<DiscoveredResource[]> {
    const host = creds.host?.replace(/\/$/, "") || "http://localhost:2375";
    const resources: DiscoveredResource[] = [];

    try {
      const res = await axios.get(`${host}/containers/json`, {
        params: { all: true, limit: 100 },
        timeout: 10_000,
      });

      for (const c of res.data ?? []) {
        const name = (c.Names?.[0] ?? "").replace(/^\//, "") || c.Id?.slice(0, 12);
        resources.push({
          resourceId: c.Id ?? "",
          resourceType: "container",
          name,
          region: "local",
          status: mapDockerState(c.State),
          specs: {
            instanceType: c.Image ?? "unknown",
            os: c.Image,
          },
          tags: c.Labels ?? {},
        });
      }
    } catch (err: any) {
      throw new Error(`Docker discovery failed: ${err.message}`);
    }

    return resources;
  },

  async fetchMetrics(creds: ProviderCredentials, resourceId: string): Promise<ResourceMetrics | null> {
    const host = creds.host?.replace(/\/$/, "") || "http://localhost:2375";
    try {
      const res = await axios.get(`${host}/containers/${resourceId}/stats`, {
        params: { stream: false },
        timeout: 5_000,
      });
      const stats = res.data;
      if (!stats) return null;

      // Calculate CPU percentage
      const cpuDelta = (stats.cpu_stats?.cpu_usage?.total_usage ?? 0) - (stats.precpu_stats?.cpu_usage?.total_usage ?? 0);
      const sysDelta = (stats.cpu_stats?.system_cpu_usage ?? 0) - (stats.precpu_stats?.system_cpu_usage ?? 0);
      const cpuCount = stats.cpu_stats?.online_cpus ?? 1;
      const cpuPercent = sysDelta > 0 ? (cpuDelta / sysDelta) * cpuCount * 100 : 0;

      // Memory
      const memUsed = stats.memory_stats?.usage ?? 0;
      const memLimit = stats.memory_stats?.limit ?? 1;
      const memPercent = (memUsed / memLimit) * 100;

      return { cpuPercent: Math.round(cpuPercent * 10) / 10, memoryPercent: Math.round(memPercent * 10) / 10 };
    } catch { return null; }
  },
};

function mapDockerState(state: string): DiscoveredResource["status"] {
  switch (state?.toLowerCase()) {
    case "running": return "running";
    case "exited": case "dead": return "stopped";
    case "removing": return "terminated";
    default: return "unknown";
  }
}

registerProvider(dockerProvider);
export default dockerProvider;
