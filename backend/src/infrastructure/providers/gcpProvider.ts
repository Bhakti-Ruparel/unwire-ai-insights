/**
 * gcpProvider.ts
 *
 * Google Cloud Platform infrastructure provider.
 * Discovers Compute Engine instances via REST API.
 */

import axios from "axios";
import { createSign } from "crypto";
import {
  registerProvider,
  type InfrastructureProvider,
  type ProviderCredentials,
  type DiscoveredResource,
  type ResourceMetrics,
  type ValidationResult,
  type CredentialField,
} from "../providerInterface";

const GCP_COMPUTE = "https://compute.googleapis.com/compute/v1";

const gcpProvider: InfrastructureProvider = {
  type: "gcp",
  displayName: "Google Cloud Platform",

  getRequiredCredentialFields(): CredentialField[] {
    return [
      { key: "serviceAccountJson", label: "Service Account Key (JSON)", type: "password", placeholder: '{"type":"service_account",...}', required: true },
      { key: "projectId", label: "Project ID", type: "text", placeholder: "my-project-123", required: true },
      { key: "zone", label: "Zone", type: "select", required: true, options: [
        "us-central1-a", "us-east1-b", "us-west1-a",
        "europe-west1-b", "europe-west2-a",
        "asia-east1-a", "asia-south1-a",
      ]},
    ];
  },

  async validateCredentials(creds: ProviderCredentials): Promise<ValidationResult> {
    try {
      const token = await getGcpToken(creds);
      if (!token) return { valid: false, error: "Failed to authenticate with GCP. Check service account JSON." };
      return { valid: true, accountId: creds.projectId, region: creds.zone };
    } catch (err: any) {
      return { valid: false, error: err.message ?? "GCP authentication failed." };
    }
  },

  async discoverResources(creds: ProviderCredentials, region?: string): Promise<DiscoveredResource[]> {
    const token = await getGcpToken(creds);
    if (!token) return [];
    const zone = region || creds.zone || "us-central1-a";

    try {
      const res = await axios.get(
        `${GCP_COMPUTE}/projects/${creds.projectId}/zones/${zone}/instances`,
        { headers: { Authorization: `Bearer ${token}` }, timeout: 15_000 }
      );

      const instances = res.data?.items ?? [];
      return instances.map((vm: any) => {
        const networkIf = vm.networkInterfaces?.[0];
        const accessConfig = networkIf?.accessConfigs?.[0];
        return {
          resourceId: String(vm.id ?? vm.name),
          resourceType: "instance" as const,
          name: vm.name ?? "Unnamed",
          region: zone,
          status: mapGcpStatus(vm.status),
          specs: {
            instanceType: vm.machineType?.split("/").pop() ?? "",
            ipAddress: accessConfig?.natIP ?? undefined,
            privateIp: networkIf?.networkIP ?? undefined,
          },
          tags: vm.labels ?? {},
        };
      });
    } catch (err: any) {
      if (err.response?.status === 404) return []; // No instances in this zone
      throw new Error(`GCP discovery failed: ${err.message}`);
    }
  },

  async fetchMetrics(creds: ProviderCredentials, resourceId: string, region?: string): Promise<ResourceMetrics | null> {
    // GCP Cloud Monitoring requires google-auth-library for proper auth
    // Basic implementation — returns null until SDK is available
    return null;
  },
};

async function getGcpToken(creds: ProviderCredentials): Promise<string | null> {
  try {
    let saKey: any;
    try { saKey = JSON.parse(creds.serviceAccountJson); } catch { return null; }

    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({
      iss: saKey.client_email,
      scope: "https://www.googleapis.com/auth/compute.readonly",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })).toString("base64url");

    const signInput = `${header}.${payload}`;
    const sign = createSign("RSA-SHA256");
    sign.update(signInput);
    const signature = sign.sign(saKey.private_key, "base64url");
    const jwt = `${signInput}.${signature}`;

    const res = await axios.post("https://oauth2.googleapis.com/token", new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }).toString(), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 10_000,
    });
    return res.data?.access_token ?? null;
  } catch { return null; }
}

function mapGcpStatus(status?: string): DiscoveredResource["status"] {
  switch (status?.toUpperCase()) {
    case "RUNNING": return "running";
    case "TERMINATED": case "STOPPED": case "SUSPENDED": return "stopped";
    case "STAGING": case "PROVISIONING": return "unknown";
    default: return "unknown";
  }
}

registerProvider(gcpProvider);
export default gcpProvider;
