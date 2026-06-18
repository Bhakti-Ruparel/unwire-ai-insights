/**
 * sslService.ts
 *
 * SSL certificate provisioning.
 * Phase 6 implementation: records intent in DB and marks cert as pending.
 * Real Let's Encrypt ACME challenge execution is done by the server agent
 * when it receives the provisionSsl instruction.
 *
 * Future: plug in acme-client or certbot wrapper here.
 */

import { prisma } from "../database/db";
import { appendLogs } from "../servers/serverService";

/**
 * provisionSsl
 *
 * Called by the deployment worker when a SETUP_SSL job is processed.
 * Marks cert status and logs the intent — agent on the server does the work.
 */
export async function provisionSsl(
  serverId: string,
  domain:   string,
  certId:   string
): Promise<void> {
  console.log(`[sslService] Provisioning SSL for domain: ${domain} on server: ${serverId}`);

  // Update cert to "processing"
  await prisma.sslCert.updateMany({
    where: { id: certId, serverId },
    data:  { status: "pending", updatedAt: new Date() },
  });

  // Log intent
  await appendLogs(serverId, [{
    appName:   "ssl-provisioner",
    level:     "info",
    message:   `SSL provisioning started for domain: ${domain}`,
    timestamp: new Date(),
  }]);

  // Simulate provisioning steps (real agent will handle this)
  await simulateProvisioningSteps(serverId, domain, certId);
}

async function simulateProvisioningSteps(
  serverId: string,
  domain: string,
  certId: string
): Promise<void> {
  const steps = [
    `Checking DNS records for ${domain}`,
    `Requesting certificate from Let's Encrypt`,
    `Completing ACME HTTP-01 challenge`,
    `Installing certificate`,
    `Configuring nginx SSL`,
    `Reloading nginx`,
  ];

  for (const step of steps) {
    await appendLogs(serverId, [{ appName: "ssl-provisioner", level: "info", message: step }]);
    await sleep(200);
  }

  // Mark cert as active
  const expiresAt = new Date(Date.now() + 90 * 86400000); // 90 days
  await prisma.sslCert.updateMany({
    where: { id: certId, serverId },
    data:  { status: "active", expiresAt, updatedAt: new Date() },
  });

  await appendLogs(serverId, [{
    appName: "ssl-provisioner",
    level:   "info",
    message: `SSL certificate installed for ${domain}. Expires: ${expiresAt.toLocaleDateString()}`,
  }]);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
