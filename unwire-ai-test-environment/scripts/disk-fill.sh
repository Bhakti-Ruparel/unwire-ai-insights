#!/bin/bash
# Unwire AI Test — Disk Pressure Simulation
# Creates a large file to push disk usage above threshold

echo "╔══════════════════════════════════════╗"
echo "║  Disk Pressure Simulation            ║"
echo "║  Creates 500MB temporary file        ║"
echo "║  Expected: Disk alert in Unwire AI   ║"
echo "╚══════════════════════════════════════╝"

SIZE_MB=${1:-500}
FILL_FILE="/tmp/unwire-disk-test-fill"

echo "→ Creating ${SIZE_MB}MB file..."
dd if=/dev/zero of=$FILL_FILE bs=1M count=$SIZE_MB 2>/dev/null

USAGE=$(df / --output=pcent | tail -1 | tr -d ' %')
echo "→ Disk usage now: ${USAGE}%"
echo ""
echo "  Expected alerts:"
echo "  - Disk usage above 85% (WARNING)"
echo "  - Disk usage above 95% (CRITICAL)"
echo ""
echo "  To clean up:"
echo "  rm -f $FILL_FILE"
echo ""
echo "  Test AI Agent:"
echo "  Ask: 'Why is disk usage high on my server?'"
