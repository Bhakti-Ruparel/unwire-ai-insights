#!/bin/bash
# Unwire AI Test — Application Crash Simulation
# Kills the running Express application to trigger alerts

echo "╔══════════════════════════════════════╗"
echo "║  Application Crash Simulation        ║"
echo "║  Killing Express demo app            ║"
echo "║  Expected: App crash alert           ║"
echo "╚══════════════════════════════════════╝"

# Find and kill the Node.js application
NODE_PID=$(pgrep -f "node server.js" | head -1)

if [ -z "$NODE_PID" ]; then
  echo "→ Express app not running. Nothing to kill."
  exit 0
fi

echo "→ Killing Express app (PID: $NODE_PID)..."
kill -9 $NODE_PID 2>/dev/null

echo "→ Application killed."
echo ""
echo "  Expected behavior:"
echo "  - Health check fails"
echo "  - Process disappears from monitoring"
echo "  - Alert: 'Application crashed'"
echo ""
echo "  Test AI Agent:"
echo "  Ask: 'Which application is unhealthy?'"
echo ""
echo "  To restart:"
echo "  cd /opt/apps/express-demo && node server.js &"
