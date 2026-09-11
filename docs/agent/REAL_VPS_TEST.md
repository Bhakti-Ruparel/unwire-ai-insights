# Real VPS Agent Installation Test

## Prerequisites
- Unwire AI backend running locally
- A tool to expose local backend publicly (ngrok, cloudflared, or public server)
- A real VPS with Debian 13 (or Ubuntu 22+), amd64, systemd
- SSH access to the VPS

---

## Phase A — Backend Preparation

On your development machine:

```bash
cd backend

# 1. Ensure API_PUBLIC_URL is set in .env
# This MUST be the URL your VPS can reach (NOT localhost)
echo 'API_PUBLIC_URL=https://YOUR_TUNNEL_URL' >> .env

# 2. Ensure FRONTEND_URL includes your frontend URL for CORS
# 3. Start backend
npm run dev
```

### Using ngrok:
```bash
ngrok http 5000
# Copy the https://xxxxx.ngrok-free.app URL
# Set API_PUBLIC_URL to that URL in backend/.env
# Restart backend
```

### Using cloudflared:
```bash
cloudflared tunnel --url http://localhost:5000
# Copy the https://xxxxx.trycloudflare.com URL
```

---

## Phase B — Verify Backend is Publicly Reachable

From ANY machine (or your phone browser):

```bash
# Test 1: Health endpoint
curl https://YOUR_PUBLIC_URL/health
# Expected: {"status":"ok","service":"unwire-ai-backend","version":"1.0.0",...}

# Test 2: Installer script
curl https://YOUR_PUBLIC_URL/install.sh | head -5
# Expected: #!/bin/bash
# ═══════════════════...
# Unwire AI Agent Installer...

# Test 3: Agent download
curl -sI https://YOUR_PUBLIC_URL/downloads/unwire-agent.js | head -3
# Expected: HTTP/... 200
# Content-Type: application/javascript
```

If ANY of these fail, stop. The VPS will also fail.

---

## Phase C — Verify Frontend Shows Correct URL

1. Set `VITE_API_URL` in the root `.env` to your public backend URL
2. Restart frontend dev server
3. Go to Infrastructure → Add Server → enter name + host
4. Check that the displayed install command contains YOUR_PUBLIC_URL, NOT localhost

---

## Phase D — Add Server in Dashboard

1. Open Unwire AI dashboard
2. Go to Infrastructure → "+ Add Server"
3. Enter:
   - Name: `My Debian VPS`
   - Host: (your VPS IP address)
   - Provider: Custom
4. Click "Add Server"
5. You should see:
   - Agent token displayed
   - Install command with YOUR_PUBLIC_URL
   - "Waiting for connection..." status

**Copy the full install command.**

---

## Phase E — Install Agent on VPS

SSH into your Debian 13 VPS:

```bash
ssh root@YOUR_VPS_IP
```

Paste the install command:

```bash
curl -fsSL "https://YOUR_PUBLIC_URL/install.sh" | sudo bash -s -- --token "YOUR_TOKEN" --server "https://YOUR_PUBLIC_URL"
```

### Expected output:
```
══════════════════════════════════════════════════
  Unwire AI Agent Installer v1.0.1
══════════════════════════════════════════════════

[1/8] Validating environment...
  ✓ Platform: linux/amd64
  ✓ Server: https://YOUR_PUBLIC_URL

[2/8] Checking Node.js runtime...
  ✓ Node.js already installed: v20.x.x
  (or: → Installing Node.js 20.x... ✓ Node.js installed)

[3/8] Downloading Unwire Agent...
  ✓ Downloaded agent to /opt/unwire-agent/agent.js

[4/8] Installing agent binary...
  ✓ Installed: unwire-agent v1.0.1 at /usr/local/bin/unwire-agent

[5/8] Saving configuration...
  ✓ Config saved: /etc/unwire-agent/config.json (permissions: 600)

[6/8] Registering with Unwire AI...
  ✓ Registered successfully (ID: xxxxxxxx...)

[7/8] Installing systemd service...
  ✓ Service installed and enabled

[8/8] Starting agent...
  ✓ Service is running
  ✓ Backend connection verified ✓

══════════════════════════════════════════════════
  ✓ Unwire AI Agent installed successfully!
══════════════════════════════════════════════════
```

### If it fails, check the exact step number and error message.

---

## Phase F — Verify systemd

On the VPS:

```bash
# Service is enabled (starts on boot)
systemctl is-enabled unwire-agent
# Expected: enabled

# Service is running
systemctl is-active unwire-agent
# Expected: active

# View service status
systemctl status unwire-agent
# Expected: Active: active (running)

# View recent logs
journalctl -u unwire-agent -n 30 --no-pager
# Expected: Shows "Unwire AI Agent v1.0.1", "Starting...", "✓ Registered", "✓ Running"
```

---

## Phase G — Verify Registration

On your **backend machine** console, look for:

```
[AGENT] ✓ Registered: server="My Debian VPS" id=xxx hostname=xxx os=linux arch=amd64 ip=xxx
```

If you don't see this, check:
- VPS can reach the backend URL
- Token is correct
- Backend is running

---

## Phase H — Verify Heartbeat

Wait 15 seconds after installation. Then check:

1. **Dashboard:** Server should show "Online" (green dot)
2. **Backend logs:** Should show heartbeat requests (if request logging is verbose)
3. **Database:** Check ServerHeartbeat table has recent entries

On VPS:
```bash
# Agent should log heartbeat activity
journalctl -u unwire-agent --since "1 minute ago" --no-pager
```

---

## Phase I — Verify Metrics

After ~30 seconds:

1. **Dashboard:** Server detail page should show CPU, RAM, Disk values
2. **Database:** ServerMetric table should have entries for this server

---

## Phase J — Verify Command Execution (Port 9898)

This is the most likely failure point. The backend must be able to reach the VPS on port 9898.

### Check if agent is listening:
```bash
# On VPS:
ss -tlnp | grep 9898
# Expected: LISTEN ... *:9898 ... node
```

### Check if backend can reach it:
The backend uses `agentClient.ts` to probe the agent. For this to work:
- VPS firewall must allow inbound TCP 9898
- The server's `host` field must resolve to the VPS IP from the backend's perspective

### Current limitation:
If the backend runs behind NAT/tunnel and the VPS is behind a firewall:
- **Heartbeat/metrics work** (VPS → Backend: outbound from VPS)
- **Commands may fail** (Backend → VPS:9898: requires inbound to VPS)

### To fix for testing:
```bash
# On VPS: ensure port 9898 is open
ufw allow 9898/tcp  # if using ufw
# or
iptables -A INPUT -p tcp --dport 9898 -j ACCEPT
```

### Test manually:
```bash
# From your local machine (if VPS IP is accessible):
curl http://VPS_IP:9898/health
# Expected: {"status":"ok","version":"1.0.1"}
```

---

## Port 9898 Communication — Architecture Note

The agent exposes an HTTP server on port 9898 for **backend → agent** commands:
- Deployments
- Software installation
- Command Center execution

This requires the backend to initiate TCP connections TO the VPS. This works when:
- VPS has a public IP and port 9898 is not firewalled
- Backend and VPS are on the same network

This does NOT work when:
- VPS is behind strict NAT without port forwarding
- Firewall blocks inbound 9898
- Backend runs locally with no route to VPS

**Current behavior when unreachable:** Commands return exit code -1 with "Agent unreachable" error. Monitoring (heartbeat/metrics) continues to work because those are agent-initiated (outbound from VPS).

---

## Restart Persistence Test

```bash
# On VPS:
sudo systemctl restart unwire-agent
# Wait 5 seconds
systemctl is-active unwire-agent
# Expected: active

# Simulate reboot (if safe):
sudo reboot
# After reboot, SSH back in:
systemctl is-active unwire-agent
# Expected: active (started automatically)
```

---

## Troubleshooting

| Symptom | Check |
|---------|-------|
| Installer says "Download failed" | Verify `curl YOUR_PUBLIC_URL/downloads/unwire-agent.js` works from VPS |
| "Registration deferred" | Backend not reachable from VPS, or token invalid |
| Service fails to start | `journalctl -u unwire-agent -n 50` — look for Node.js errors |
| Dashboard stays "Waiting" | Heartbeat not arriving — check backend logs and VPS outbound connectivity |
| Commands fail with exit -1 | Port 9898 not reachable from backend to VPS |
