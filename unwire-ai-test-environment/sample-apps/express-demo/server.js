/**
 * Unwire AI Test — Express Demo Application
 * 
 * Endpoints:
 *   GET /health       — Health check (fast)
 *   GET /api/users    — Normal API response
 *   GET /slow         — Intentionally slow (CPU intensive)
 *   GET /memory-leak  — Gradually increases memory
 *   GET /error        — Throws an error (for log testing)
 *   GET /metrics      — App-level metrics
 */

const express = require('express');
const app = express();
const PORT = process.env.PORT || 4000;

// ─── State ────────────────────────────────────────────────────────────────
let requestCount = 0;
let errorCount = 0;
let leakedMemory = [];
const startTime = Date.now();

// ─── Middleware ───────────────────────────────────────────────────────────
app.use((req, res, next) => {
  requestCount++;
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (duration > 100) {
      console.log(`[SLOW] ${req.method} ${req.path} - ${duration}ms`);
    }
  });
  next();
});

// ─── Routes ───────────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: Math.floor((Date.now() - startTime) / 1000) });
});

app.get('/api/users', (req, res) => {
  // Simulate normal API response
  const users = Array.from({ length: 10 }, (_, i) => ({
    id: i + 1,
    name: `User ${i + 1}`,
    email: `user${i + 1}@example.com`,
    role: i === 0 ? 'admin' : 'member',
  }));
  res.json({ users, total: users.length });
});

app.get('/slow', (req, res) => {
  // CPU-intensive operation (intentional for testing)
  console.log('[WARN] Slow endpoint called — CPU spike expected');
  let result = 0;
  for (let i = 0; i < 50000000; i++) {
    result += Math.sqrt(i) * Math.sin(i);
  }
  res.json({ message: 'Slow operation completed', result: result.toFixed(2) });
});

app.get('/memory-leak', (req, res) => {
  // Gradually leak memory (for testing memory alerts)
  const chunk = Buffer.alloc(1024 * 1024); // 1MB per request
  leakedMemory.push(chunk);
  const usedMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
  console.log(`[WARN] Memory leak simulated — heap: ${usedMB}MB, chunks: ${leakedMemory.length}`);
  res.json({ 
    message: 'Memory leaked', 
    heapMB: usedMB, 
    leakedChunks: leakedMemory.length 
  });
});

app.get('/error', (req, res) => {
  errorCount++;
  console.error(`[ERROR] Intentional error #${errorCount} — testing error tracking`);
  res.status(500).json({ error: 'Internal server error', code: 'TEST_ERROR' });
});

app.get('/metrics', (req, res) => {
  const mem = process.memoryUsage();
  res.json({
    uptime: Math.floor((Date.now() - startTime) / 1000),
    requests: requestCount,
    errors: errorCount,
    memory: {
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
      rss: Math.round(mem.rss / 1024 / 1024),
    },
    pid: process.pid,
  });
});

// ─── 404 handler ──────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.path });
});

// ─── Start ────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[INFO] Express demo app running on port ${PORT}`);
  console.log(`[INFO] Endpoints: /health, /api/users, /slow, /memory-leak, /error, /metrics`);
});
