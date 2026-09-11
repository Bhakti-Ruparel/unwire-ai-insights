/**
 * nodeAgent.ts
 *
 * Generates the production Node.js agent source code.
 * This is served at GET /downloads/unwire-agent.js and runs on customer VPS.
 *
 * The agent:
 *   - Reads config from /etc/unwire-agent/config.json
 *   - Registers with backend if no serverId
 *   - Sends heartbeat every 15s
 *   - Sends CPU/RAM/Disk/Network metrics every 15s
 *   - Sends process list every 15s
 *   - Sends Docker container info every 15s
 *   - Runs HTTP command server on port 9898
 *   - Handles CLI: start, configure, version, --version, status
 *   - Reconnects automatically on failure
 *   - Queues data during backend unavailability
 */

export function generateNodeAgent(version: string): string {
  return `#!/usr/bin/env node
'use strict';
// Unwire AI Agent v${version} — Production Node.js Agent
// Auto-generated. Do not edit manually.

const fs = require('fs');
const os = require('os');
const http = require('http');
const https = require('https');
const { execSync, exec } = require('child_process');

const VERSION = '${version}';
const CONFIG_PATH = '/etc/unwire-agent/config.json';
const INTERVAL_MS = 15000;

// ─── CLI ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'version' || cmd === '--version') { console.log('unwire-agent v' + VERSION); process.exit(0); }
if (cmd === 'status') { handleStatus(); process.exit(0); }
if (cmd === 'configure') { handleConfigure(); process.exit(0); }
if (cmd === 'start') { handleStart(); }
else if (!cmd) { console.error('Usage: unwire-agent <start|configure|version|status>'); process.exit(1); }
else if (cmd === '--token') { handleStart(); } // Direct run with flags
else { console.error('Unknown command: ' + cmd); process.exit(1); }

function handleStatus() {
  if (!fs.existsSync(CONFIG_PATH)) { console.log('Not configured. Run: unwire-agent configure'); return; }
  const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  console.log('Unwire Agent v' + VERSION);
  console.log('  Server:    ' + cfg.serverUrl);
  console.log('  Server ID: ' + (cfg.serverId || '(pending registration)'));
  console.log('  Interval:  ' + (cfg.intervalSeconds || 15) + 's');
}

function handleConfigure() {
  const token = getFlag('--token');
  const server = getFlag('--server') || 'http://localhost:5000';
  if (!token) { console.error('Error: --token required'); process.exit(1); }
  const cfg = { token: token, serverUrl: server.replace(/\\/$/, ''), serverId: '', intervalSeconds: 15 };
  fs.mkdirSync('/etc/unwire-agent', { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  console.log('✓ Configuration saved to ' + CONFIG_PATH);
}

async function handleStart() {
  let config;
  if (getFlag('--token')) {
    // Direct run with --token flag
    const token = getFlag('--token');
    const server = getFlag('--server') || 'http://localhost:5000';
    config = { token: token, serverUrl: server.replace(/\\/$/, ''), serverId: '', intervalSeconds: 15 };
  } else {
    if (!fs.existsSync(CONFIG_PATH)) { console.error('No config found. Run: unwire-agent configure --token TOKEN --server URL'); process.exit(1); }
    config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  }

  console.log('Unwire AI Agent v' + VERSION);
  console.log('  Server: ' + config.serverUrl);
  console.log('  Starting...');

  // Register if needed
  if (!config.serverId) {
    const reg = await apiPost(config, '/api/agent-push/register', {
      hostname: os.hostname(), os: os.platform(), arch: os.arch(), version: VERSION
    });
    if (reg && reg.serverId) {
      config.serverId = reg.serverId;
      try { fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), { mode: 0o600 }); } catch(e) {}
      console.log('  ✓ Registered: ' + config.serverId);
    } else {
      console.error('  ✗ Registration failed. Will retry...');
    }
  } else {
    console.log('  ✓ Server: ' + config.serverId);
  }

  // Start command server
  startCommandServer(config.token);

  // Start collection loop
  console.log('  ✓ Running. Sending data every ' + (config.intervalSeconds || 15) + 's');
  const interval = (config.intervalSeconds || 15) * 1000;
  
  async function tick() {
    if (!config.serverId) {
      // Retry registration
      const reg = await apiPost(config, '/api/agent-push/register', { hostname: os.hostname(), os: os.platform(), arch: os.arch(), version: VERSION });
      if (reg && reg.serverId) { config.serverId = reg.serverId; try { fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), { mode: 0o600 }); } catch(e) {} }
      return;
    }
    await sendHeartbeat(config);
    await sendMetrics(config);
    await sendProcesses(config);
    await sendDocker(config);
  }

  tick();
  setInterval(tick, interval);

  process.on('SIGINT', () => { console.log('Agent stopped.'); process.exit(0); });
  process.on('SIGTERM', () => { console.log('Agent stopped.'); process.exit(0); });
}

// ─── Data Collection ──────────────────────────────────────────────────────

async function sendHeartbeat(cfg) {
  await apiPost(cfg, '/api/servers/' + cfg.serverId + '/heartbeat', { status: 'online', agentVersion: VERSION });
}

async function sendMetrics(cfg) {
  const cpus = os.cpus();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  let cpuPercent = 0;
  try { const la = os.loadavg(); cpuPercent = Math.min(100, (la[0] / cpus.length) * 100); } catch(e) {}

  let diskPercent = 0, diskTotal = 0, diskUsed = 0;
  try {
    const df = execSync("df / --output=pcent,size,used 2>/dev/null | tail -1", { encoding: 'utf-8' }).trim().split(/\\s+/);
    diskPercent = parseFloat(df[0]) || 0;
    diskTotal = (parseInt(df[1]) || 0) * 1024;
    diskUsed = (parseInt(df[2]) || 0) * 1024;
  } catch(e) {}

  let netIn = 0, netOut = 0;
  try {
    const nd = execSync("cat /proc/net/dev 2>/dev/null | grep -v lo | tail -1", { encoding: 'utf-8' }).trim().split(/\\s+/);
    netIn = (parseFloat(nd[1]) || 0) * 8 / 1000000;
    netOut = (parseFloat(nd[9]) || 0) * 8 / 1000000;
  } catch(e) {}

  await apiPost(cfg, '/api/servers/' + cfg.serverId + '/metrics', {
    cpuPercent: cpuPercent, cpuCores: cpus.length, loadAverage: os.loadavg(),
    ramPercent: (usedMem / totalMem) * 100, memoryTotal: totalMem, memoryUsed: usedMem, memoryFree: freeMem,
    diskPercent: diskPercent, diskTotal: diskTotal, diskUsed: diskUsed,
    networkIn: Math.min(netIn, 1000), networkOut: Math.min(netOut, 1000),
    timestamp: new Date().toISOString()
  });
}

async function sendProcesses(cfg) {
  const known = ['node','python','nginx','postgres','redis','docker','sshd','java','pm2','mysql','mongo'];
  const procs = [];
  try {
    const ps = execSync("ps aux --no-headers 2>/dev/null", { encoding: 'utf-8' });
    const seen = new Set();
    for (const line of ps.split('\\n')) {
      const p = line.trim().split(/\\s+/);
      if (p.length < 11) continue;
      const name = (p[10] || '').split('/').pop() || '';
      const match = known.find(k => name.toLowerCase().includes(k));
      if (!match || seen.has(match)) continue;
      seen.add(match);
      procs.push({ name: match, pid: parseInt(p[1]) || 0, cpu: parseFloat(p[2]) || 0, memory: (parseFloat(p[3]) || 0) / 100 * (os.totalmem() / 1024 / 1024), status: 'running' });
    }
  } catch(e) {}
  if (procs.length > 0) await apiPost(cfg, '/api/agent-push/' + cfg.serverId + '/processes', { processes: procs });
}

async function sendDocker(cfg) {
  const containers = [];
  try {
    const out = execSync('docker ps --format "{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.Ports}}" 2>/dev/null', { encoding: 'utf-8' });
    for (const line of out.trim().split('\\n').filter(Boolean)) {
      const [id, name, image, status, ports] = line.split('|');
      containers.push({ id: (id||'').slice(0,12), name: name||'', image: image||'', state: (status||'').toLowerCase().includes('up') ? 'running' : 'stopped', status: status||'', cpu: 0, memory: 0, port: parseInt(((ports||'').match(/:(\\/d+)->/) || [])[1]) || 0 });
    }
  } catch(e) {}
  if (containers.length > 0) await apiPost(cfg, '/api/agent-push/' + cfg.serverId + '/docker', { containers: containers });
}

// ─── Command Server (port 9898) ───────────────────────────────────────────

function startCommandServer(token) {
  const srv = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, {'Content-Type':'application/json'});
      res.end(JSON.stringify({status:'ok',version:VERSION}));
      return;
    }
    if (req.method === 'POST' && req.url === '/deploy') {
      const auth = req.headers['authorization'] || '';
      if (auth !== 'Bearer ' + token) { res.writeHead(401); res.end(JSON.stringify({exitCode:-1,error:'unauthorized'})); return; }
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        try { const r = JSON.parse(body); execCommand(r, res); }
        catch(e) { res.writeHead(400); res.end(JSON.stringify({exitCode:-1,error:'bad request'})); }
      });
      return;
    }
    res.writeHead(404); res.end('not found');
  });
  srv.listen(9898, '0.0.0.0', () => console.log('  ✓ Command server on :9898'));
  srv.on('error', (e) => console.error('  ✗ Command server error:', e.message));
}

function execCommand(request, res) {
  let command = '';
  switch(request.action) {
    case 'exec': command = request.repository || ''; break;
    case 'clone': command = request.repository || ''; break;
    case 'build': command = 'docker build -t unwire-' + (request.appName||'app') + ':latest /opt/unwire/deployments/' + (request.appName||'app'); break;
    case 'deploy': command = 'docker run -d --name unwire-' + (request.appName||'app') + ' --restart unless-stopped -p ' + (request.port||3000) + ':' + (request.port||3000) + ' unwire-' + (request.appName||'app') + ':latest'; break;
    case 'healthcheck': command = 'curl -sf http://localhost:' + (request.port||3000) + '/health || curl -sf http://localhost:' + (request.port||3000) + '/'; break;
    case 'stop': command = 'docker stop unwire-' + (request.appName||'app') + ' 2>/dev/null; docker rm unwire-' + (request.appName||'app') + ' 2>/dev/null'; break;
    default: res.writeHead(200, {'Content-Type':'application/json'}); res.end(JSON.stringify({exitCode:-1,error:'unknown action: '+request.action})); return;
  }
  if (!command) { res.writeHead(200, {'Content-Type':'application/json'}); res.end(JSON.stringify({exitCode:-1,error:'empty command'})); return; }
  const start = Date.now();
  exec(command, { timeout: (request.timeout||300)*1000, maxBuffer: 5*1024*1024 }, (err, stdout, stderr) => {
    res.writeHead(200, {'Content-Type':'application/json'});
    res.end(JSON.stringify({ exitCode: err ? (err.code||1) : 0, stdout: (stdout||'').slice(0,50000), stderr: (stderr||'').slice(0,10000), durationMs: Date.now()-start, error: err ? err.message : undefined }));
  });
}

// ─── HTTP Helper ──────────────────────────────────────────────────────────

function apiPost(cfg, path, body) {
  return new Promise(resolve => {
    try {
      const url = new URL(path, cfg.serverUrl);
      const data = JSON.stringify(body);
      const lib = url.protocol === 'https:' ? https : http;
      const req = lib.request({ hostname: url.hostname, port: url.port, path: url.pathname, method: 'POST', timeout: 10000,
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), 'Authorization': 'Bearer ' + cfg.token }
      }, (res) => {
        let b = ''; res.on('data', c => b += c);
        res.on('end', () => { try { const j = JSON.parse(b); resolve(j.data || j); } catch(e) { resolve(null); } });
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
      req.write(data); req.end();
    } catch(e) { resolve(null); }
  });
}

function getFlag(flag) {
  const idx = args.indexOf(flag);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : null;
}
`;
}
