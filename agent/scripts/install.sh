#!/bin/bash
# Unwire AI Agent — Install Script
# Usage: curl -fsSL https://get.unwire.ai/agent | bash
#
# Supports: Linux (amd64, arm64), macOS (amd64, arm64)

set -e

AGENT_VERSION="1.0.0"
INSTALL_DIR="/usr/local/bin"
CONFIG_DIR="/etc/unwire-agent"
SERVICE_NAME="unwire-agent"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║   Unwire AI Server Agent v${AGENT_VERSION}    ║"
echo "  ╚══════════════════════════════════════╝"
echo ""

# Detect OS and architecture
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

case "$ARCH" in
  x86_64|amd64) ARCH="amd64" ;;
  aarch64|arm64) ARCH="arm64" ;;
  *) echo -e "${RED}Unsupported architecture: $ARCH${NC}"; exit 1 ;;
esac

case "$OS" in
  linux) ;;
  darwin) ;;
  *) echo -e "${RED}Unsupported OS: $OS${NC}"; exit 1 ;;
esac

BINARY_NAME="unwire-agent-${OS}-${ARCH}"
DOWNLOAD_URL="https://github.com/unwireai/agent/releases/download/v${AGENT_VERSION}/${BINARY_NAME}"

echo -e "${GREEN}→${NC} Detected: ${OS}/${ARCH}"
echo -e "${GREEN}→${NC} Installing to: ${INSTALL_DIR}/unwire-agent"

# Check for root
if [ "$EUID" -ne 0 ]; then
  echo -e "${YELLOW}⚠ Running without root. Using sudo for installation.${NC}"
  SUDO="sudo"
else
  SUDO=""
fi

# Download binary
echo -e "${GREEN}→${NC} Downloading agent..."
$SUDO mkdir -p "$INSTALL_DIR"
$SUDO mkdir -p "$CONFIG_DIR"

if command -v curl &> /dev/null; then
  $SUDO curl -fsSL -o "${INSTALL_DIR}/unwire-agent" "$DOWNLOAD_URL" 2>/dev/null || {
    echo -e "${YELLOW}⚠ Download failed. Agent binary not yet published.${NC}"
    echo -e "${YELLOW}  Build from source: cd agent && go build -o unwire-agent .${NC}"
    echo -e "${YELLOW}  Then move to: ${INSTALL_DIR}/unwire-agent${NC}"
    exit 0
  }
elif command -v wget &> /dev/null; then
  $SUDO wget -qO "${INSTALL_DIR}/unwire-agent" "$DOWNLOAD_URL" 2>/dev/null || {
    echo -e "${YELLOW}⚠ Download failed. Build from source instead.${NC}"
    exit 0
  }
fi

$SUDO chmod +x "${INSTALL_DIR}/unwire-agent"

# Create systemd service (Linux only)
if [ "$OS" = "linux" ] && command -v systemctl &> /dev/null; then
  echo -e "${GREEN}→${NC} Creating systemd service..."

  $SUDO tee /etc/systemd/system/${SERVICE_NAME}.service > /dev/null <<EOF
[Unit]
Description=Unwire AI Server Monitoring Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=${INSTALL_DIR}/unwire-agent start
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=unwire-agent

[Install]
WantedBy=multi-user.target
EOF

  $SUDO systemctl daemon-reload
  echo -e "${GREEN}✓${NC} Systemd service created"
fi

echo ""
echo -e "${GREEN}✓ Installation complete!${NC}"
echo ""
echo "  Next steps:"
echo "  1. Configure:  unwire-agent configure --token <YOUR_TOKEN> --server <API_URL>"
echo "  2. Start:      unwire-agent start"
echo ""
echo "  Or with systemd:"
echo "  1. Configure:  unwire-agent configure --token <YOUR_TOKEN> --server <API_URL>"
echo "  2. Enable:     sudo systemctl enable unwire-agent"
echo "  3. Start:      sudo systemctl start unwire-agent"
echo ""
