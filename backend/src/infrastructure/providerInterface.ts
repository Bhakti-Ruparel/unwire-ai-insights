/**
 * providerInterface.ts
 *
 * Abstract interface for all cloud infrastructure providers.
 * Every provider (AWS, DigitalOcean, Azure, GCP, Hetzner, Docker)
 * must implement this interface.
 */

// ─── Types ────────────────────────────────────────────────────────────────

export type ProviderType = "aws" | "digitalocean" | "azure" | "gcp" | "hetzner" | "docker";

export interface ProviderCredentials {
  [key: string]: string;
}

export interface DiscoveredResource {
  resourceId: string;          // Provider-specific unique ID
  resourceType: ResourceType;
  name: string;
  region: string;
  status: "running" | "stopped" | "terminated" | "unknown";
  specs: ResourceSpecs;
  metrics?: ResourceMetrics;
  tags: Record<string, string>;
}

export type ResourceType = "instance" | "container" | "database" | "load_balancer" | "volume" | "network";

export interface ResourceSpecs {
  cpu?: number;                // vCPU count
  memoryMb?: number;           // Memory in MB
  diskGb?: number;             // Disk in GB
  instanceType?: string;       // e.g. "t3.medium", "s-2vcpu-4gb"
  os?: string;
  ipAddress?: string;
  privateIp?: string;
}

export interface ResourceMetrics {
  cpuPercent?: number;
  memoryPercent?: number;
  diskPercent?: number;
  networkInKbps?: number;
  networkOutKbps?: number;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  accountId?: string;           // Provider account identifier
  region?: string;
}

// ─── Provider Interface ───────────────────────────────────────────────────

export interface InfrastructureProvider {
  /** Provider identifier */
  readonly type: ProviderType;

  /** Human-readable provider name */
  readonly displayName: string;

  /** Validate that credentials are correct */
  validateCredentials(creds: ProviderCredentials): Promise<ValidationResult>;

  /** Discover all resources accessible with these credentials */
  discoverResources(creds: ProviderCredentials, region?: string): Promise<DiscoveredResource[]>;

  /** Fetch current metrics for a specific resource */
  fetchMetrics(creds: ProviderCredentials, resourceId: string, region?: string): Promise<ResourceMetrics | null>;

  /** Get required credential fields for this provider */
  getRequiredCredentialFields(): CredentialField[];
}

export interface CredentialField {
  key: string;
  label: string;
  type: "text" | "password" | "select";
  placeholder?: string;
  required: boolean;
  options?: string[];          // For select type
}

// ─── Provider Registry ────────────────────────────────────────────────────

const providers = new Map<ProviderType, InfrastructureProvider>();

export function registerProvider(provider: InfrastructureProvider): void {
  providers.set(provider.type, provider);
}

export function getProvider(type: ProviderType): InfrastructureProvider | undefined {
  return providers.get(type);
}

export function getAllProviders(): InfrastructureProvider[] {
  return Array.from(providers.values());
}

export function getProviderTypes(): ProviderType[] {
  return Array.from(providers.keys());
}
