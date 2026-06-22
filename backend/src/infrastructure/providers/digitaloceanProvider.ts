/**
 * digitaloceanProvider.ts
 *
 * DigitalOcean infrastructure provider.
 * Uses the DO REST API (no SDK needed — just axios).
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

const DO_API = "https://api.digitalocean.com/v2";

const digitaloceanProvider: InfrastructureProvider = {
  type: "digitalocean",
  displayName: "DigitalOcean",

  getRequiredCredentialFields(): CredentialField[] {
    return [
      { key: "apiToken", label: "API Token", type: "password", placeholder: "dop_v1_...", required: true },
    ];
  },

  async validateCredentials(creds: ProviderCredentials): Promise<ValidationResult> {
    try {
      const res = await axios.get(`${DO_API}/account`, {
        headers: { Authorization: `Bearer ${creds.apiToken}` },
        timeout: 10_000,
      });
      return { valid: true, accountId: res.data?.account?.email ?? "" };
    } catch (err: any) {
      const status = err.response?.status;
      if (status === 401) return { valid: false, error: "Invalid API token." };
      return { valid: false, error: err.message ?? "Failed to connect to DigitalOcean." };
    }
  },

  async discoverResources(creds: ProviderCredentials): Promise<DiscoveredResource[]> {
    const resources: DiscoveredResource[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore && page <= 10) { // Cap at 10 pages (200 droplets)
      const res = await axios.get(`${DO_API}/droplets`, {
        headers: { Authorization: `Bearer ${creds.apiToken}` },
        params: { page, per_page: 20 },
        timeout: 15_000,
      });

      const droplets = res.data?.droplets ?? [];
      for (const d of droplets) {
        const pubIp = d.networks?.v4?.find((n: any) => n.type === "public")?.ip_address;
        const privIp = d.networks?.v4?.find((n: any) => n.type === "private")?.ip_address;
        resources.push({
          resourceId: String(d.id),
          resourceType: "instance",
          name: d.name ?? `droplet-${d.id}`,
          region: d.region?.slug ?? "",
          status: mapDoStatus(d.status),
          specs: {
            cpu: d.vcpus,
            memoryMb: d.memory,
            diskGb: d.disk,
            instanceType: d.size_slug,
            ipAddress: pubIp,
            privateIp: privIp,
            os: d.image?.distribution ? `${d.image.distribution} ${d.image.name}` : undefined,
          },
          tags: Object.fromEntries((d.tags ?? []).map((t: string) => [t, "true"])),
        });
      }

      hasMore = droplets.length === 20;
      page++;
    }

    return resources;
  },

  async fetchMetrics(creds: ProviderCredentials, resourceId: string): Promise<ResourceMetrics | null> {
    try {
      const end = new Date().toISOString();
      const start = new Date(Date.now() - 5 * 60_000).toISOString();

      const [cpuRes, memRes] = await Promise.all([
        axios.get(`${DO_API}/monitoring/metrics/droplet/cpu`, {
          headers: { Authorization: `Bearer ${creds.apiToken}` },
          params: { host_id: resourceId, start, end },
          timeout: 10_000,
        }).catch(() => null),
        axios.get(`${DO_API}/monitoring/metrics/droplet/memory_free`, {
          headers: { Authorization: `Bearer ${creds.apiToken}` },
          params: { host_id: resourceId, start, end },
          timeout: 10_000,
        }).catch(() => null),
      ]);

      // DO returns Prometheus-style time series
      const cpuValues = cpuRes?.data?.data?.result?.[0]?.values ?? [];
      const lastCpu = cpuValues.length > 0 ? parseFloat(cpuValues[cpuValues.length - 1][1]) : undefined;

      return { cpuPercent: lastCpu ? lastCpu * 100 : undefined };
    } catch { return null; }
  },
};

function mapDoStatus(status: string): DiscoveredResource["status"] {
  switch (status) {
    case "active": return "running";
    case "off": return "stopped";
    case "archive": return "terminated";
    default: return "unknown";
  }
}

registerProvider(digitaloceanProvider);
export default digitaloceanProvider;
