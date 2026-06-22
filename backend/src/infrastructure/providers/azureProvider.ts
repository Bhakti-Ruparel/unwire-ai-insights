/**
 * azureProvider.ts
 *
 * Azure infrastructure provider.
 * Discovers Virtual Machines via Azure REST API.
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

const AZURE_LOGIN = "https://login.microsoftonline.com";
const AZURE_MGMT = "https://management.azure.com";

const azureProvider: InfrastructureProvider = {
  type: "azure",
  displayName: "Microsoft Azure",

  getRequiredCredentialFields(): CredentialField[] {
    return [
      { key: "tenantId", label: "Tenant ID", type: "text", placeholder: "xxxxxxxx-xxxx-...", required: true },
      { key: "clientId", label: "Client (App) ID", type: "text", placeholder: "xxxxxxxx-xxxx-...", required: true },
      { key: "clientSecret", label: "Client Secret", type: "password", placeholder: "Secret value", required: true },
      { key: "subscriptionId", label: "Subscription ID", type: "text", placeholder: "xxxxxxxx-xxxx-...", required: true },
    ];
  },

  async validateCredentials(creds: ProviderCredentials): Promise<ValidationResult> {
    try {
      const token = await getAzureToken(creds);
      if (!token) return { valid: false, error: "Failed to authenticate with Azure." };
      return { valid: true, accountId: creds.subscriptionId };
    } catch (err: any) {
      return { valid: false, error: err.message ?? "Azure authentication failed." };
    }
  },

  async discoverResources(creds: ProviderCredentials): Promise<DiscoveredResource[]> {
    const token = await getAzureToken(creds);
    if (!token) return [];

    try {
      const res = await axios.get(
        `${AZURE_MGMT}/subscriptions/${creds.subscriptionId}/providers/Microsoft.Compute/virtualMachines?api-version=2023-09-01`,
        { headers: { Authorization: `Bearer ${token}` }, timeout: 15_000 }
      );

      const vms = res.data?.value ?? [];
      return vms.map((vm: any) => ({
        resourceId: vm.id ?? vm.name,
        resourceType: "instance" as const,
        name: vm.name ?? "Unnamed VM",
        region: vm.location ?? "",
        status: mapAzureState(vm.properties?.provisioningState),
        specs: {
          instanceType: vm.properties?.hardwareProfile?.vmSize,
          os: vm.properties?.storageProfile?.osDisk?.osType,
        },
        tags: vm.tags ?? {},
      }));
    } catch (err: any) {
      throw new Error(`Azure discovery failed: ${err.message}`);
    }
  },

  async fetchMetrics(creds: ProviderCredentials, resourceId: string): Promise<ResourceMetrics | null> {
    const token = await getAzureToken(creds);
    if (!token) return null;

    try {
      const end = new Date().toISOString();
      const start = new Date(Date.now() - 5 * 60_000).toISOString();
      const res = await axios.get(
        `${AZURE_MGMT}${resourceId}/providers/Microsoft.Insights/metrics?api-version=2023-10-01&metricnames=Percentage CPU&timespan=${start}/${end}`,
        { headers: { Authorization: `Bearer ${token}` }, timeout: 10_000 }
      );
      const values = res.data?.value?.[0]?.timeseries?.[0]?.data ?? [];
      const last = values[values.length - 1];
      return { cpuPercent: last?.average ?? undefined };
    } catch { return null; }
  },
};

async function getAzureToken(creds: ProviderCredentials): Promise<string | null> {
  try {
    const res = await axios.post(
      `${AZURE_LOGIN}/${creds.tenantId}/oauth2/v2.0/token`,
      new URLSearchParams({
        grant_type: "client_credentials",
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        scope: "https://management.azure.com/.default",
      }).toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 10_000 }
    );
    return res.data?.access_token ?? null;
  } catch { return null; }
}

function mapAzureState(state?: string): DiscoveredResource["status"] {
  switch (state?.toLowerCase()) {
    case "succeeded": case "running": return "running";
    case "stopped": case "deallocated": return "stopped";
    case "failed": case "deleting": return "terminated";
    default: return "unknown";
  }
}

registerProvider(azureProvider);
export default azureProvider;
