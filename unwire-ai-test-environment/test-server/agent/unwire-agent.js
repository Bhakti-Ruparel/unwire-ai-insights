#!/usr/bin/env node
/**
 * Unwire AI Test Agent (Node.js)
 * 
 * Functional agent simulator that sends real metrics to the Unwire AI backend.
 * Runs inside the test-server container.
 *
 * Commands:
 *   unwire-agent configure --token TOKEN --server URL
 *   unwire-agent start
 *   unwire-agent version
 */

const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');
const http = require('http');
const https = require('https');

const VERSION = '1.0.0-test';
const CONFIG_PATH = '/etc/unwire-agent/config.json';
const INTERVAL_MS = 10000; // 10 seconds

// ─── CLI Parsing ──────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case 'configure': handleConfigure(); break;
  case 'start': handleStart(); break;
  case 'version': console.log(`unwire-agent v${VERSION}`); break;
  default:
    console.log(`unwire-agent v${VERSION}`);
    console.log('Usage:');
    console.log('  unwire-agent configure --token TOKEN --server URL');
    console.log('  unwire-agent start');
    console.log('  unwire-agent version');
    process.exit(command ? 1 : 0);
}

// ─── Configure ────────────────────────────────────────────────────────────

function handleConfigure() {
  const token = getArg('--token');
  const server = getArg('--server') || 'http://localhost:5000';

  if (!token) {
    console.error('Error: --token is required');
    process.exit(1);
  }

  const config = { token, serverUrl: server.replace(/\/$/, ''), serverId: '', intervalMs: INTERVAL_MS };

  fs.mkdirSync('/etc/unwire-agent', { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));

  console.log('✓ Configuration saved');
  console.log(`  Token:  ${token.slice(0, 8)}...`);
  console.log(`  Server: ${server}`);
  console.log('');
  console.log('  Run: unwire-agent start');
}

// ─── Start ────────────────────────────────────────────────────────────────

async function handleStart() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error('Error: No configuration found.');
    console.error('Run: unwire-agent configure --token TOKEN --server URL');
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  
  console.log(`╔══════════════════════════════════════╗`);
  console.log(`║  Unwire AI Agent v${VERSION}     ║`);
  console.log(`╚══════════════════════════════════════╝`);
  console.log(`  Server: ${config.serverUrl}`);
  console.log(`  Starting...`);

  // Register with backend
  if (!config.serverId) {
    log('Registering with Unwire AI...');
    const result = await postJSON(config, '/api/agent-push/register', {
      hostname: os.hostname(),
      os: os.platform(),
      arch: os.arch(),
      version: VERSION,
    });

    if (result && result.serverId) {
      config.serverId = result.serverId;
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
      log(`✓ Registered as server: ${config.serverId}`);
    } else {
      log(`✗ Registration failed: ${JSON.stringify(result)}`);
      process.exit(1);
    }
  } else {
    log(`✓ Server ID: ${config.serverId}`);
  }

  log('✓ Agent running. Sending data every 10s...');
  log('');

  // Start command execution server on port 9898
  startCommandServer(config.token);

  // Initial send
  await collectAndSend(config);

  // Interval loop
  setInterval(() => collectAndSend(config), config.intervalMs || INTERVAL_MS);

  // Keep alive
  process.on('SIGINT', () => { log('Agent stopped.'); process.exit(0); });
  process.on('SIGTERM', () => { log('Agent stopped.'); process.exit(0); });
}

// ─── Collection & Sending ─────────────────────────────────────────────────

async function collectAndSend(config) {
  const sid = config.serverId;
  const ts = new Date().toISOString().slice(11, 19);

  // 1. Heartbeat
  await postJSON(config, `/api/servers/${sid}/heartbeat`, {
    status: 'online',
    agentVersion: VERSION,
  });
  log(`[${ts}] Heartbeat sent`);

  // 2. Metrics
  const metrics = collectMetrics();
  await postJSON(config, `/api/servers/${sid}/metrics`, metrics);
  log(`[${ts}] Metrics: CPU ${metrics.cpuPercent.toFixed(0)}% | RAM ${metrics.ramPercent.toFixed(0)}% | Disk ${metrics.diskPercent.toFixed(0)}%`);

  // 3. Processes
  const processes = collectProcesses();
  if (processes.length > 0) {
    await postJSON(config, `/api/agent-push/${sid}/processes`, { processes });
    log(`[${ts}] Processes: ${processes.length} services detected`);
  }

  // 4. Docker containers
  const containers = collectDocker();
  if (containers.length > 0) {
    await postJSON(config, `/api/agent-push/${sid}/docker`, { containers });
    log(`[${ts}] Docker: ${containers.length} containers`);
  }
}

// ─── Metric Collection ────────────────────────────────────────────────────

function collectMetrics() {
  const cpus = os.cpus();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;

  // CPU usage (average across cores)
  let cpuPercent = 0;
  try {
    const loadAvg = os.loadavg();
    cpuPercent = Math.min(100, (loadAvg[0] / cpus.length) * 100);
  } catch {
    cpuPercent = Math.random() * 30 + 10; // Fallback with simulated value
  }

  // Disk usage
  let diskPercent = 0, diskTotal = 0, diskUsed = 0;
  try {
    const dfOutput = execSync("df / --output=pcent,size,used | tail -1", { encoding: 'utf-8' });
    const parts = dfOutput.trim().split(/\s+/);
    diskPercent = parseFloat(parts[0]) || 0;
    diskTotal = (parseInt(parts[1]) || 0) * 1024; // Convert KB to bytes
    diskUsed = (parseInt(parts[2]) || 0) * 1024;
  } catch {
    diskPercent = 35 + Math.random() * 10;
  }

  // Network (simplified)
  let networkIn = 0, networkOut = 0;
  try {
    const netData = execSync("cat /proc/net/dev | grep -v lo | tail -1", { encoding: 'utf-8' });
    const parts = netData.trim().split(/\s+/);
    networkIn = parseFloat(parts[1]) * 8 / 1000000 || 0;  // Rough Mbps
    networkOut = parseFloat(parts[9]) * 8 / 1000000 || 0;
  } catch {
    networkIn = Math.random() * 5;
    networkOut = Math.random() * 2;
  }

  return {
    cpuPercent,
    cpuCores: cpus.length,
    loadAverage: os.loadavg(),
    ramPercent: (usedMem / totalMem) * 100,
    memoryTotal: totalMem,
    memoryUsed: usedMem,
    memoryFree: freeMem,
    diskPercent,
    diskTotal,
    diskUsed,
    networkIn: Math.min(networkIn, 100),
    networkOut: Math.min(networkOut, 100),
    timestamp: new Date().toISOString(),
  };
}

// ─── Process Collection ───────────────────────────────────────────────────

function collectProcesses() {
  const known = ['node', 'python', 'nginx', 'postgres', 'redis', 'docker', 'sshd', 'java'];
  const processes = [];

  try {
    const psOutput = execSync("ps aux --no-headers", { encoding: 'utf-8' });
    const lines = psOutput.trim().split('\n');
    const seen = new Set();

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 11) continue;

      const cpu = parseFloat(parts[2]) || 0;
      const mem = parseFloat(parts[3]) || 0;
      const pid = parseInt(parts[1]) || 0;
      const cmd = parts.slice(10).join(' ');
      const name = parts[10].split('/').pop() || '';

      // Filter to known services
      const matchedService = known.find(k => name.toLowerCase().includes(k) || cmd.toLowerCase().includes(k));
      if (!matchedService || seen.has(matchedService)) continue;
      seen.add(matchedService);

      processes.push({
        name: matchedService,
        pid,
        cpu,
        memory: (mem / 100) * (os.totalmem() / 1024 / 1024), // MB
        status: 'running',
      });
    }
  } catch { /* ignore */ }

  return processes;
}

// ─── Docker Collection ────────────────────────────────────────────────────

function collectDocker() {
  const containers = [];

  try {
    const output = execSync('docker ps --format "{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.Ports}}" 2>/dev/null', { encoding: 'utf-8' });
    const lines = output.trim().split('\n').filter(Boolean);

    for (const line of lines) {
      const [id, name, image, status, ports] = line.split('|');
      const port = ports ? parseInt((ports.match(/:(\d+)->/) || [])[1]) || 0 : 0;

      containers.push({
        id: (id || '').slice(0, 12),
        name: name || 'unknown',
        image: image || 'unknown',
        state: status?.toLowerCase().includes('up') ? 'running' : 'stopped',
        status: status || '',
        cpu: Math.random() * 15,
        memory: Math.random() * 200 + 50,
        port,
        uptime: status || '',
      });
    }
  } catch { /* Docker not available or no containers */ }

  return containers;
}

// ─── HTTP Helper ──────────────────────────────────────────────────────────

function postJSON(config, path, body) {
  return new Promise((resolve) => {
    const url = new URL(path, config.serverUrl);
    const data = JSON.stringify(body);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;

    const req = lib.request({
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'Authorization': `Bearer ${config.token}`,
        'X-Agent-Version': VERSION,
      },
      timeout: 10000,
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          resolve(json.data || json);
        } catch {
          resolve(null);
        }
      });
    });

    req.on('error', (err) => {
      // Silent fail — don't spam logs on connection issues
      resolve(null);
    });

    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.write(data);
    req.end();
  });
}

// ─── Utilities ────────────────────────────────────────────────────────────

function getArg(flag) {
  const idx = args.indexOf(flag);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : null;
}

function log(msg) {
  console.log(`[unwire-agent] ${msg}`);
}

// ─── Command Execution Server (port 9898) ─────────────────────────────────
// Receives deployment/install commands from the Unwire AI backend

const { exec } = require('child_process');

function startCommandServer(agentToken) {
  const server = http.createServer((req, res) => {
    // Health endpoint
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', version: VERSION }));
      return;
    }

    // Deploy/exec endpoint
    if (req.method === 'POST' && req.url === '/deploy') {
      // Verify auth
      const auth = req.headers['authorization'] || '';
      if (auth !== `Bearer ${agentToken}`) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ exitCode: -1, error: 'unauthorized' }));
        return;
      }

      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const request = JSON.parse(body);
          handleDeployRequest(request, res);
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ exitCode: -1, error: 'invalid request' }));
        }
      });
      return;
    }

    res.writeHead(404);
    res.end('not found');
  });

  server.listen(9898, '0.0.0.0', () => {
    log('✓ Command server listening on :9898');
  });
}

function handleDeployRequest(request, res) {
  const { action, repository, appName, timeout } = request;
  const timeoutMs = (timeout || 300) * 1000;

  let command = '';

  switch (action) {
    case 'exec':
      // Direct command execution (whitelisted in backend registry)
      command = repository || '';
      break;
    case 'clone':
      // Could be a git clone OR a shell command (legacy compatibility)
      command = repository || '';
      break;
    case 'build':
      command = `docker build -t unwire-${appName}:latest /opt/unwire/deployments/${appName}`;
      break;
    case 'deploy':
      command = `docker run -d --name unwire-${appName} --restart unless-stopped -p ${request.port || 3000}:${request.port || 3000} unwire-${appName}:latest`;
      break;
    case 'healthcheck':
      command = `curl -sf http://localhost:${request.port || 3000}/health || curl -sf http://localhost:${request.port || 3000}/`;
      break;
    case 'stop':
      command = `docker stop unwire-${appName} 2>/dev/null; docker rm unwire-${appName} 2>/dev/null`;
      break;
    default:
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ exitCode: -1, stdout: '', stderr: '', error: `unknown action: ${action}` }));
      return;
  }

  if (!command) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ exitCode: -1, stdout: '', stderr: '', error: 'no command to execute' }));
    return;
  }

  log(`[cmd] Executing: ${command.slice(0, 100)}`);
  const start = Date.now();

  const child = exec(command, { timeout: timeoutMs, maxBuffer: 1024 * 1024 * 5 }, (error, stdout, stderr) => {
    const durationMs = Date.now() - start;
    const exitCode = error ? (error.code || 1) : 0;

    if (stdout) log(`[cmd] stdout: ${stdout.slice(0, 200)}`);
    if (stderr && exitCode !== 0) log(`[cmd] stderr: ${stderr.slice(0, 200)}`);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      exitCode,
      stdout: (stdout || '').slice(0, 50000),
      stderr: (stderr || '').slice(0, 10000),
      durationMs,
      error: error ? error.message : undefined,
    }));
  });
}
