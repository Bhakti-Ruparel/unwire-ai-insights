/**
 * seed.ts
 *
 * One-time bootstrap script:
 *  1. Creates the default admin user (Bhakti / bhaktibruparel@gmail.com)
 *  2. Creates their personal organization
 *  3. Migrates all orphan projects/servers to that user
 *
 * Run: npx ts-node src/scripts/seed.ts
 */

import "dotenv/config";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { prisma } from "../database/db";

const DEFAULT_EMAIL = "bhaktibruparel@gmail.com";
const DEFAULT_NAME  = "Bhakti";
const DEFAULT_PASS  = "Bhakti@2006";

async function main() {
  console.log("─── Unwire AI Seed Script ───────────────────────────────");

  // 1. Create or find the default admin user
  let user = await prisma.user.findUnique({ where: { email: DEFAULT_EMAIL } });
  if (!user) {
    const hash = await bcrypt.hash(DEFAULT_PASS, 12);
    user = await prisma.user.create({
      data: {
        id:           crypto.randomUUID(),
        email:        DEFAULT_EMAIL,
        passwordHash: hash,
        name:         DEFAULT_NAME,
        role:         "ADMIN",
        isActive:     true,
      },
    });
    console.log(`✓ Created admin user: ${DEFAULT_EMAIL}`);
  } else {
    // Ensure they're an ADMIN
    if (user.role !== "ADMIN") {
      await prisma.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
      console.log(`✓ Promoted ${DEFAULT_EMAIL} to ADMIN`);
    } else {
      console.log(`✓ Admin user already exists: ${DEFAULT_EMAIL}`);
    }
  }

  // 2. Create personal organization if missing
  let org = await prisma.organization.findFirst({ where: { ownerId: user.id } });
  if (!org) {
    org = await prisma.organization.create({
      data: {
        id:      crypto.randomUUID(),
        name:    `${DEFAULT_NAME}'s Workspace`,
        slug:    "bhakti-workspace",
        ownerId: user.id,
        plan:    "pro",
      },
    });
    console.log(`✓ Created organization: ${org.name}`);
  } else {
    console.log(`✓ Organization already exists: ${org.name}`);
  }

  // 3. Ensure user is OWNER member of org
  const membership = await prisma.organizationMember.findFirst({
    where: { organizationId: org.id, userId: user.id },
  });
  if (!membership) {
    await prisma.organizationMember.create({
      data: {
        id:             crypto.randomUUID(),
        organizationId: org.id,
        userId:         user.id,
        role:           "OWNER",
      },
    });
    console.log(`✓ Added ${DEFAULT_NAME} as OWNER of organization`);
  }

  // 4. Migrate orphan projects (userId IS NULL) to this user + org
  const orphanProjects = await prisma.project.findMany({ where: { userId: null } });
  if (orphanProjects.length > 0) {
    await prisma.project.updateMany({
      where: { userId: null },
      data:  { userId: user.id, organizationId: org.id },
    });
    console.log(`✓ Migrated ${orphanProjects.length} orphan project(s) to ${DEFAULT_NAME}`);
  } else {
    console.log("✓ No orphan projects to migrate");
  }

  // 5. Migrate orphan servers (userId IS NULL) to this user + org
  const orphanServers = await prisma.server.findMany({ where: { userId: null } });
  if (orphanServers.length > 0) {
    await prisma.server.updateMany({
      where: { userId: null },
      data:  { userId: user.id, organizationId: org.id },
    });
    console.log(`✓ Migrated ${orphanServers.length} orphan server(s) to ${DEFAULT_NAME}`);
  } else {
    console.log("✓ No orphan servers to migrate");
  }

  // 6. Print summary
  const [projectCount, serverCount] = await Promise.all([
    prisma.project.count({ where: { userId: user.id } }),
    prisma.server.count({ where: { userId: user.id } }),
  ]);

  console.log("\n─── Summary ─────────────────────────────────────────────");
  console.log(`  User:         ${DEFAULT_EMAIL} (ADMIN)`);
  console.log(`  Organization: ${org.name}`);
  console.log(`  Projects:     ${projectCount}`);
  console.log(`  Servers:      ${serverCount}`);
  console.log("─────────────────────────────────────────────────────────");
  console.log("\nSeed complete. You can now log in with:");
  console.log(`  Email:    ${DEFAULT_EMAIL}`);
  console.log(`  Password: ${DEFAULT_PASS}`);
}

main()
  .catch((err) => { console.error("Seed failed:", err); process.exit(1); })
  .finally(() => prisma.$disconnect());
