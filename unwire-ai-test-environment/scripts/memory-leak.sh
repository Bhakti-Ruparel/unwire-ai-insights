#!/bin/bash
# Unwire AI Test — Memory Pressure Simulation
# Gradually increases RAM usage to trigger memory alerts

echo "╔══════════════════════════════════════╗"
echo "║  Memory Pressure Simulation          ║"
echo "║  Duration: 120 seconds               ║"
echo "║  Expected: RAM alert in Unwire AI    ║"
echo "╚══════════════════════════════════════╝"

DURATION=${1:-120}

echo "→ Starting memory stress for ${DURATION}s..."
stress-ng --vm 2 --vm-bytes 256M --timeout ${DURATION}s --metrics-brief 2>/dev/null &

echo "→ Memory pressure active."
echo ""
echo "  Expected alerts:"
echo "  - RAM usage above 80% (WARNING)"
echo "  - RAM usage above 95% (CRITICAL)"
echo ""
echo "  Test AI Agent:"
echo "  Ask: 'Why is memory high on my server?'"
echo "  Ask: 'Is there a memory leak?'"

wait
echo "→ Memory stress ended."
