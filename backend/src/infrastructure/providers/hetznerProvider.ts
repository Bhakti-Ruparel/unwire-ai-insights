/**
 * hetznerProvider.ts
 *
 * Hetzner Cloud infrastructure provider.
 * Uses Hetzner Cloud REST API (simple token auth).
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

const HETZNER_API = "https://api.hetzner.cloud/v1";

const hetznerProvider: InfrastructureProvider = {
  type: "hetzner",
  displayName: "Hetzner Cloud",

  getRequiredCredentialFields(): CredentialField[] {
    return [
      { key: "apiToken", label: "API Token", type: "password", placeholder: "Your Hetzner Cloud API token", required: true },
    ];
  },

  async validateCredentials(creds: ProviderCredentials): Promise<ValidationResult> {
    try {
      const res = await axios.get(`${HETZNER_API}/servers?per_page=1`, {
        headers: { Authorization: `Bearer ${creds.apiToken}` },
        timeout: 10_000,
      });
      if (res.status === 200) return { valid: true };
      return { valid: false, error: "Authentication failed." };
    } catch (err: any) {
      if (err.response?.status === 401) return { valid: false, error: "Invalid API token." };
      return { valid: false, error: err.message ?? "Failed to connect to Hetzner." };
    }
  },

  async discoverResources(creds: ProviderCredentials): Promise<DiscoveredResource[]> {
    const resources: DiscoveredResource[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore && page <= 10) {
      const res = await axios.get(`${HETZNER_API}/servers`, {
        headers: { Authorization: `Bearer ${creds.apiToken}` },
        params: { page, per_page: 25 },
        timeout: 15_000,
      });

      const servers = res.data?.servers ?? [];
      for (const s of servers) {
        resources.push({
          resourceId: String(s.id),
          resourceType: "instance",
          name: s.name ?? `server-${s.id}`,
          region: s.datacenter?.name ?? s.datacenter?.location?.name ?? "",
          status: mapHetznerStatus(s.status),
          specs: {
            cpu: s.server_type?.cores,
            memoryMb: s.server_type?.memory ? s.server_type.memory * 1024 : undefined,
            diskGb: s.server_type?.disk,
            instanceType: s.server_type?.name,
            ipAddress: s.public_net?.ipv4?.ip,
            privateIp: s.private_net?.[0]?.ip,
            os: s.image?.os_flavor ? `${s.image.os_flavor} ${s.image.os_version ?? ""}`.trim() : undefined,
          },
          tags: Object.fromEntries((Object.entries(s.labels ?? {}) as [string, string][])),
        });
      }

      hasMore = servers.length === 25;
      page++;
    }

    return resources;
  },

  async fetchMetrics(creds: ProviderCredentials, resourceId: string): Promise<ResourceMetrics | null> {
    try {
      const end = new Date().toISOString();
      const start = new Date(Date.now() - 5 * 60_000).toISOString();
      const res = await axios.get(`${HETZNER_API}/servers/${resourceId}/metrics`, {
        headers: { Authorization: `Bearer ${creds.apiToken}` },
        params: { type: "cpu,disk,network", start, end },
        timeout: 10_000,
      });

      const ts = res.data?.metrics?.time_series;
      if (!ts) return null;

      // CPU: Hetzner returns cpu usage percentage per core
      const cpuValues = ts["cpu"]?.values ?? [];
      const lastCpu = cpuValues.length > 0 ? parseFloat(cpuValues[cpuValues.length - 1][1]) : undefined;

      return { cpuPercent: lastCpu };
    } catch { return null; }
  },
};

function mapHetznerStatus(status?: string): DiscoveredResource["status"] {
  switch (status) {
    case "running": return "running";
    case "off": case "stopping": return "stopped";
    case "deleting": return "terminated";
    default: return "unknown";
  }
}

registerProvider(hetznerProvider);
export default hetznerProvider;
