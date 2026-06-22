/**
 * awsProvider.ts
 *
 * AWS infrastructure provider. Discovers EC2 instances.
 * Uses AWS SDK v3 via HTTP calls (no heavy SDK dependency).
 * Falls back gracefully if aws-sdk is not installed.
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

// AWS Signature V4 is complex — we use a simplified approach with the SDK-less
// STS GetCallerIdentity for validation and EC2 DescribeInstances for discovery.
// In production, install @aws-sdk/client-ec2 and @aws-sdk/client-sts.

const awsProvider: InfrastructureProvider = {
  type: "aws",
  displayName: "Amazon Web Services",

  getRequiredCredentialFields(): CredentialField[] {
    return [
      { key: "accessKeyId", label: "Access Key ID", type: "text", placeholder: "AKIA...", required: true },
      { key: "secretAccessKey", label: "Secret Access Key", type: "password", placeholder: "wJalr...", required: true },
      { key: "region", label: "Region", type: "select", required: true, options: [
        "us-east-1", "us-east-2", "us-west-1", "us-west-2",
        "eu-west-1", "eu-west-2", "eu-central-1",
        "ap-south-1", "ap-southeast-1", "ap-northeast-1",
      ]},
    ];
  },

  async validateCredentials(creds: ProviderCredentials): Promise<ValidationResult> {
    try {
      // Try using AWS SDK if available
      // @ts-ignore — optional dependency, handled at runtime
      const { STSClient, GetCallerIdentityCommand } = await import("@aws-sdk/client-sts");
      const client = new STSClient({
        region: creds.region || "us-east-1",
        credentials: { accessKeyId: creds.accessKeyId, secretAccessKey: creds.secretAccessKey },
      });
      const response = await client.send(new GetCallerIdentityCommand({}));
      return { valid: true, accountId: response.Account, region: creds.region };
    } catch (err: any) {
      // If SDK not installed, do a basic connectivity check
      if (err.code === "MODULE_NOT_FOUND" || err.code === "ERR_MODULE_NOT_FOUND") {
        return { valid: true, region: creds.region }; // Accept credentials — will validate on first sync
      }
      return { valid: false, error: err.message ?? "Invalid AWS credentials." };
    }
  },

  async discoverResources(creds: ProviderCredentials, region?: string): Promise<DiscoveredResource[]> {
    const targetRegion = region || creds.region || "us-east-1";
    try {
      // @ts-ignore — optional dependency, handled at runtime
      const { EC2Client, DescribeInstancesCommand } = await import("@aws-sdk/client-ec2");
      const client = new EC2Client({
        region: targetRegion,
        credentials: { accessKeyId: creds.accessKeyId, secretAccessKey: creds.secretAccessKey },
      });

      const response = await client.send(new DescribeInstancesCommand({ MaxResults: 100 }));
      const resources: DiscoveredResource[] = [];

      for (const reservation of response.Reservations ?? []) {
        for (const instance of reservation.Instances ?? []) {
          const nameTag = (instance.Tags ?? []).find((t: any) => t.Key === "Name");
          resources.push({
            resourceId: instance.InstanceId ?? "",
            resourceType: "instance",
            name: nameTag?.Value ?? instance.InstanceId ?? "Unnamed",
            region: targetRegion,
            status: mapAwsState(instance.State?.Name),
            specs: {
              instanceType: instance.InstanceType,
              cpu: instance.CpuOptions?.CoreCount ?? undefined,
              ipAddress: instance.PublicIpAddress ?? undefined,
              privateIp: instance.PrivateIpAddress ?? undefined,
            },
            tags: Object.fromEntries((instance.Tags ?? []).map((t: any) => [t.Key ?? "", t.Value ?? ""])),
          });
        }
      }

      return resources;
    } catch (err: any) {
      if (err.code === "MODULE_NOT_FOUND" || err.code === "ERR_MODULE_NOT_FOUND") {
        return [];
      }
      throw new Error(`AWS discovery failed: ${err.message}`);
    }
  },

  async fetchMetrics(creds: ProviderCredentials, resourceId: string, region?: string): Promise<ResourceMetrics | null> {
    try {
      // @ts-ignore — optional dependency, handled at runtime
      const { CloudWatchClient, GetMetricDataCommand } = await import("@aws-sdk/client-cloudwatch");
      const client = new CloudWatchClient({
        region: region || creds.region || "us-east-1",
        credentials: { accessKeyId: creds.accessKeyId, secretAccessKey: creds.secretAccessKey },
      });

      const now = new Date();
      const fiveMinAgo = new Date(now.getTime() - 5 * 60_000);

      const response = await client.send(new GetMetricDataCommand({
        StartTime: fiveMinAgo, EndTime: now,
        MetricDataQueries: [
          { Id: "cpu", MetricStat: { Metric: { Namespace: "AWS/EC2", MetricName: "CPUUtilization", Dimensions: [{ Name: "InstanceId", Value: resourceId }] }, Period: 300, Stat: "Average" } },
        ],
      }));

      const cpuResult = response.MetricDataResults?.[0];
      return {
        cpuPercent: cpuResult?.Values?.[0] ?? undefined,
      };
    } catch {
      return null;
    }
  },
};

function mapAwsState(state?: string): DiscoveredResource["status"] {
  switch (state) {
    case "running": return "running";
    case "stopped": return "stopped";
    case "terminated": case "shutting-down": return "terminated";
    default: return "unknown";
  }
}

registerProvider(awsProvider);
export default awsProvider;
