/**
 * installerScript.ts
 *
 * Generates a production-ready bash installer for Unwire AI Agent.
 * Tested target: Debian 13 (trixie) amd64 with systemd.
 *
 * The script:
 *  1. Validates environment (OS, arch, root, systemd)
 *  2. Installs Node.js if missing (required runtime)
 *  3. Downloads agent from backend
 *  4. Installs to /usr/local/bin + /opt/unwire-agent
 *  5. Creates config with token
 *  6. Registers with backend
 *  7. Creates + enables systemd service
 *  8. Starts service and verifies
 *  9. Confirms backend connection
 */

export function generateInstallerScript(version: string, serverUrl: string): string {
  return `#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# Unwire AI Agent Installer v${version}
# Usage: curl -fsSL <backend>/install.sh | sudo bash -s -- --token TOKEN --server URL
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

VERSION="${version}"
RED='\\033[0;31m'; GREEN='\\033[0;32m'; YELLOW='\\033[1;33m'; CYAN='\\033[0;36m'; NC='\\033[0m'
INSTALL_DIR="/opt/unwire-agent"
BIN_PATH="/usr/local/bin/unwire-agent"
CONFIG_DIR="/etc/unwire-agent"
CONFIG_FILE="\$CONFIG_DIR/config.json"
SERVICE_FILE="/etc/systemd/system/unwire-agent.service"

# ─── Parse arguments ───────────────────────────────────────────────────────
TOKEN=""
SERVER_URL="${serverUrl}"

while [[ \$# -gt 0 ]]; do
  case "\$1" in
    --token) TOKEN="\$2"; shift 2 ;;
    --server) SERVER_URL="\$2"; shift 2 ;;
    *) shift ;;
  esac
done

SERVER_URL="\${SERVER_URL%/}"

log()  { echo -e "  \${GREEN}✓\${NC} \$1"; }
warn() { echo -e "  \${YELLOW}⚠\${NC} \$1"; }
fail() { echo -e "  \${RED}✗\${NC} \$1"; exit 1; }
step() { echo -e "\\n\${CYAN}[\$1]\${NC} \$2"; }

echo ""
echo -e "\${CYAN}══════════════════════════════════════════════════\${NC}"
echo -e "\${CYAN}  Unwire AI Agent Installer v\${VERSION}\${NC}"
echo -e "\${CYAN}══════════════════════════════════════════════════\${NC}"

# ─── Step 1: Validate ──────────────────────────────────────────────────────
step "1/8" "Validating environment..."

if [ -z "\$TOKEN" ]; then
  fail "Missing --token. Usage: curl ... | sudo bash -s -- --token TOKEN --server URL"
fi

if [ "\$(id -u)" -ne 0 ]; then
  fail "This installer must run as root. Use: sudo bash -s -- ..."
fi

OS=\$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=\$(uname -m)
case "\$ARCH" in
  x86_64) ARCH="amd64" ;;
  aarch64) ARCH="arm64" ;;
  *) fail "Unsupported architecture: \$ARCH. Supported: x86_64 (amd64), aarch64 (arm64)" ;;
esac

if [ "\$OS" != "linux" ]; then
  fail "Unsupported OS: \$OS. This installer supports Linux only."
fi

if ! command -v systemctl &>/dev/null; then
  fail "systemd not found. This installer requires systemd."
fi

log "Platform: linux/\$ARCH"
log "Server: \$SERVER_URL"

# ─── Step 2: Install Node.js if missing ───────────────────────────────────
step "2/8" "Checking Node.js runtime..."

if command -v node &>/dev/null; then
  NODE_VER=\$(node --version 2>/dev/null || echo "unknown")
  log "Node.js already installed: \$NODE_VER"
else
  echo "  → Installing Node.js 20.x..."
  if command -v apt-get &>/dev/null; then
    # Debian/Ubuntu
    apt-get update -qq 2>/dev/null
    apt-get install -y -qq ca-certificates curl gnupg 2>/dev/null
    mkdir -p /etc/apt/keyrings
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg 2>/dev/null
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
    apt-get update -qq 2>/dev/null
    apt-get install -y -qq nodejs 2>/dev/null
  elif command -v dnf &>/dev/null; then
    curl -fsSL https://rpm.nodesource.com/setup_20.x | bash - 2>/dev/null
    dnf install -y -q nodejs 2>/dev/null
  elif command -v yum &>/dev/null; then
    curl -fsSL https://rpm.nodesource.com/setup_20.x | bash - 2>/dev/null
    yum install -y -q nodejs 2>/dev/null
  else
    fail "Cannot install Node.js. No supported package manager found (apt/dnf/yum)."
  fi

  if ! command -v node &>/dev/null; then
    fail "Node.js installation failed. Install manually: https://nodejs.org"
  fi
  log "Node.js installed: \$(node --version)"
fi

# ─── Step 3: Download agent ────────────────────────────────────────────────
step "3/8" "Downloading Unwire Agent..."

mkdir -p "\$INSTALL_DIR"
DOWNLOAD_URL="\${SERVER_URL}/downloads/unwire-agent.js"

HTTP_CODE=\$(curl -sL -o "\$INSTALL_DIR/agent.js" -w "%{http_code}" "\$DOWNLOAD_URL" 2>/dev/null || echo "000")
if [ "\$HTTP_CODE" != "200" ] || [ ! -s "\$INSTALL_DIR/agent.js" ]; then
  fail "Download failed (HTTP \$HTTP_CODE). Is the backend running at \$SERVER_URL?"
fi

log "Downloaded agent to \$INSTALL_DIR/agent.js"

# ─── Step 4: Install binary wrapper ───────────────────────────────────────
step "4/8" "Installing agent binary..."

cat > "\$BIN_PATH" << 'WRAPPER'
#!/bin/bash
exec /usr/bin/env node /opt/unwire-agent/agent.js "$@"
WRAPPER
chmod 755 "\$BIN_PATH"

# Verify
if ! "\$BIN_PATH" --version &>/dev/null; then
  fail "Installation verification failed. Check: node /opt/unwire-agent/agent.js --version"
fi

INSTALLED_VER=\$("\$BIN_PATH" --version 2>/dev/null || echo "unknown")
log "Installed: \$INSTALLED_VER at \$BIN_PATH"

# ─── Step 5: Save configuration ───────────────────────────────────────────
step "5/8" "Saving configuration..."

mkdir -p "\$CONFIG_DIR"
cat > "\$CONFIG_FILE" << EOF
{
  "token": "\$TOKEN",
  "serverUrl": "\$SERVER_URL",
  "serverId": "",
  "intervalSeconds": 15
}
EOF
chmod 600 "\$CONFIG_FILE"
log "Config saved: \$CONFIG_FILE (permissions: 600)"

# ─── Step 6: Register with backend ────────────────────────────────────────
step "6/8" "Registering with Unwire AI..."

REGISTER_RESP=\$(curl -sS --max-time 15 -X POST "\${SERVER_URL}/api/agent-push/register" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer \$TOKEN" \\
  -d "{\\"hostname\\": \\"\$(hostname)\\", \\"os\\": \\"linux\\", \\"arch\\": \\"\$ARCH\\", \\"version\\": \\"\$VERSION\\"}" 2>/dev/null || echo '{}')

SERVER_ID=\$(echo "\$REGISTER_RESP" | grep -oP '"serverId"\\s*:\\s*"\\K[^"]+' 2>/dev/null || echo "")

if [ -n "\$SERVER_ID" ]; then
  # Update config with server ID
  cat > "\$CONFIG_FILE" << EOF
{
  "token": "\$TOKEN",
  "serverUrl": "\$SERVER_URL",
  "serverId": "\$SERVER_ID",
  "intervalSeconds": 15
}
EOF
  chmod 600 "\$CONFIG_FILE"
  log "Registered successfully (ID: \${SERVER_ID:0:8}...)"
else
  warn "Registration deferred. Agent will register on first start."
fi

# ─── Step 7: Create systemd service ───────────────────────────────────────
step "7/8" "Installing systemd service..."

cat > "\$SERVICE_FILE" << EOF
[Unit]
Description=Unwire AI Server Monitoring Agent
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=300
StartLimitBurst=5

[Service]
Type=simple
ExecStart=\$BIN_PATH start
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=unwire-agent
WorkingDirectory=\$INSTALL_DIR

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable unwire-agent --quiet 2>/dev/null
log "Service installed and enabled"

# ─── Step 8: Start and verify ──────────────────────────────────────────────
step "8/8" "Starting agent..."

systemctl restart unwire-agent

# Wait for service to stabilize
sleep 3

if systemctl is-active unwire-agent &>/dev/null; then
  log "Service is running"
else
  echo ""
  warn "Service started but may not be stable. Check:"
  echo "    journalctl -u unwire-agent -n 50 --no-pager"
  echo "    systemctl status unwire-agent"
fi

# Verify backend connectivity
if [ -n "\$SERVER_ID" ]; then
  sleep 2
  HB_RESP=\$(curl -sS --max-time 5 -o /dev/null -w "%{http_code}" -X POST "\${SERVER_URL}/api/servers/\${SERVER_ID}/heartbeat" \\
    -H "Content-Type: application/json" \\
    -H "Authorization: Bearer \$TOKEN" \\
    -d "{\\"status\\":\\"online\\",\\"agentVersion\\":\\"\$VERSION\\"}" 2>/dev/null || echo "000")
  
  if [ "\$HB_RESP" = "200" ]; then
    log "Backend connection verified ✓"
  else
    warn "Agent running but backend connection not confirmed (HTTP \$HB_RESP)"
    echo "    The agent will keep retrying automatically."
  fi
fi

# ─── Done ──────────────────────────────────────────────────────────────────
echo ""
echo -e "\${GREEN}══════════════════════════════════════════════════\${NC}"
echo -e "\${GREEN}  ✓ Unwire AI Agent installed successfully!\${NC}"
echo -e "\${GREEN}══════════════════════════════════════════════════\${NC}"
echo ""
echo "  Binary:   \$BIN_PATH"
echo "  Agent:    \$INSTALL_DIR/agent.js"
echo "  Config:   \$CONFIG_FILE"
echo "  Service:  unwire-agent.service"
echo ""
echo "  Commands:"
echo "    systemctl status unwire-agent"
echo "    journalctl -u unwire-agent -f"
echo "    unwire-agent --version"
echo ""
if [ -n "\$SERVER_ID" ]; then
  echo "  Your server should now be ONLINE in the Unwire AI dashboard."
else
  echo "  The agent will register automatically. Check dashboard shortly."
fi
echo ""
`;
}
