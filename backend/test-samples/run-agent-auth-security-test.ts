/**
 * Agent authentication integration tests.
 *
 * Run: npm run test:security
 */

import "dotenv/config";
import crypto from "crypto";
import http from "http";
import express from "express";
import { prisma } from "../src/database/db";
import serverRoutes from "../src/routes/serverRoutes";
import { optionalAuth } from "../src/middleware/authenticate";
import { signAccessToken } from "../src/services/authService";

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string): void {
  if (condition) {
    console.log(`  OK ${msg}`);
    passed++;
  } else {
    console.error(`  FAIL ${msg}`);
    failed++;
  }
}

async function request(
  server: http.Server,
  opts: { method: string; path: string; token?: string; body?: unknown }
): Promise<{ status: number; body: any }> {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server is not listening.");

  const payload = opts.body === undefined ? "" : JSON.stringify(opts.body);

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: address.port,
        method: opts.method,
        path: opts.path,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
          ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
        },
      },
      (res) => {
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => { raw += chunk; });
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            body: raw ? JSON.parse(raw) : null,
          });
        });
      }
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

async function main() {
  console.log("Agent auth security tests");

  const app = express();
  app.use(express.json());
  app.use(optionalAuth);
  app.use("/api/servers", serverRoutes);

  const server = app.listen(0);

  const userAId = crypto.randomUUID();
  const userBId = crypto.randomUUID();
  const serverAId = crypto.randomUUID();
  const serverBId = crypto.randomUUID();
  const agentTokenA = crypto.randomUUID();
  const userAToken = signAccessToken({ userId: userAId, email: `a-${userAId}@test.local`, role: "USER" });
  const metric = { cpuPercent: 1, ramPercent: 2, diskPercent: 3, networkIn: 4, networkOut: 5 };

  try {
    await prisma.user.createMany({
      data: [
        { id: userAId, email: `agent-a-${userAId}@test.local`, passwordHash: "x", name: "Agent A" },
        { id: userBId, email: `agent-b-${userBId}@test.local`, passwordHash: "x", name: "Agent B" },
      ],
    });

    await prisma.server.createMany({
      data: [
        { id: serverAId, name: "Agent A Server", host: "10.0.0.1", userId: userAId, agentToken: agentTokenA },
        { id: serverBId, name: "Agent B Server", host: "10.0.0.2", userId: userBId, agentToken: crypto.randomUUID() },
      ],
    });

    const noToken = await request(server, {
      method: "POST",
      path: `/api/servers/${serverAId}/metrics`,
      body: metric,
    });
    assert(noToken.status === 401, `No token sends metrics -> 401 (got ${noToken.status})`);

    const wrongToken = await request(server, {
      method: "POST",
      path: `/api/servers/${serverAId}/metrics`,
      token: "wrong-agent-token",
      body: metric,
    });
    assert(wrongToken.status === 401, `Wrong token sends metrics -> 401 (got ${wrongToken.status})`);

    const validAgent = await request(server, {
      method: "POST",
      path: `/api/servers/${serverAId}/metrics`,
      token: agentTokenA,
      body: metric,
    });
    assert(validAgent.status === 200, `Valid agent token sends metrics -> 200 (got ${validAgent.status})`);

    const userAToServerB = await request(server, {
      method: "POST",
      path: `/api/servers/${serverBId}/metrics`,
      token: userAToken,
      body: metric,
    });
    assert(userAToServerB.status === 403, `User A token tries User B server -> 403 (got ${userAToServerB.status})`);
  } finally {
    await prisma.server.deleteMany({ where: { id: { in: [serverAId, serverBId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });
    await new Promise<void>((resolve, reject) => {
      server.close((err) => err ? reject(err) : resolve());
    });
    await prisma.$disconnect();
  }

  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
