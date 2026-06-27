#!/bin/bash
# Unwire AI Test Server — Entrypoint
# Starts all services that simulate a real production server

set -e

echo "╔══════════════════════════════════════════╗"
echo "║  Unwire AI Test Server Starting...       ║"
echo "╚══════════════════════════════════════════╝"

# ─── Start SSH server ──────────────────────────────────────────────────────
echo "→ Starting SSH server..."
/usr/sbin/sshd

# ─── Start nginx ───────────────────────────────────────────────────────────
echo "→ Starting nginx..."
nginx -g "daemon on;" 2>/dev/null || true

# ─── Start sample Node.js application ─────────────────────────────────────
echo "→ Starting Express demo app on port 4000..."
cd /opt/apps/express-demo
if [ -f "package.json" ]; then
  npm install --production 2>/dev/null
  node server.js &
  echo "  ✓ Express app running on :4000"
fi

# ─── Generate some initial log activity ───────────────────────────────────
echo "→ Generating sample log activity..."
(
  while true; do
    echo "[$(date -Iseconds)] [INFO] Request processed: GET /api/users ($(( RANDOM % 50 + 10 ))ms)" >> /var/log/apps/api.log
    if (( RANDOM % 10 == 0 )); then
      echo "[$(date -Iseconds)] [WARN] Slow query detected ($(( RANDOM % 500 + 200 ))ms)" >> /var/log/apps/api.log
    fi
    if (( RANDOM % 50 == 0 )); then
      echo "[$(date -Iseconds)] [ERROR] Connection timeout to database" >> /var/log/apps/api.log
    fi
    sleep $(( RANDOM % 5 + 2 ))
  done
) &

# ─── Simulate background system activity ──────────────────────────────────
echo "→ Simulating system activity..."
(
  while true; do
    # Create some disk I/O
    dd if=/dev/zero of=/tmp/io-test bs=1M count=1 2>/dev/null
    rm -f /tmp/io-test
    sleep 30
  done
) &

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  Test Server Ready                       ║"
echo "║                                          ║"
echo "║  SSH:  ssh root@localhost -p 2222        ║"
echo "║  Pass: unwire-test                       ║"
echo "║  App:  http://localhost:4000             ║"
echo "║                                          ║"
echo "║  To install Unwire Agent:                ║"
echo "║  unwire-agent configure --token <T>      ║"
echo "║  unwire-agent start                      ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# Keep container running
tail -f /var/log/apps/api.log 2>/dev/null || sleep infinity
