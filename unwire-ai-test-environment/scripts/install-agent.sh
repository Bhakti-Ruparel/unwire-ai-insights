#!/bin/bash
# Unwire AI Test — Agent Installation Helper
# Configures and starts the Unwire Agent on the test server
#
# Usage: ./install-agent.sh <AGENT_TOKEN> [SERVER_URL]

TOKEN=${1:-""}
SERVER_URL=${2:-"http://host.docker.internal:5000"}

if [ -z "$TOKEN" ]; then
  echo "Usage: ./install-agent.sh <AGENT_TOKEN> [SERVER_URL]"
  echo ""
  echo "Get your agent token from:"
  echo "  1. Open Unwire AI dashboard"
  echo "  2. Go to Infrastructure → Add Server"
  echo "  3. Copy the generated token"
  echo ""
  exit 1
fi

echo "╔══════════════════════════════════════╗"
echo "║  Installing Unwire AI Agent          ║"
echo "╚══════════════════════════════════════╝"
echo ""
echo "  Token:  ${TOKEN:0:8}..."
echo "  Server: $SERVER_URL"
echo ""

# Configure agent
echo "→ Configuring agent..."
mkdir -p /etc/unwire-agent
cat > /etc/unwire-agent/config.json << EOF
{
  "token": "$TOKEN",
  "serverUrl": "$SERVER_URL",
  "serverId": "",
  "intervalSeconds": 30
}
EOF

echo "→ Configuration saved to /etc/unwire-agent/config.json"
echo ""
echo "  To start agent:"
echo "  unwire-agent start"
echo ""
echo "  Or run in background:"
echo "  unwire-agent start &"
echo ""
echo "  ✓ Agent configured. Start it to connect to Unwire AI."
