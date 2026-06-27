#!/bin/bash
# Unwire AI Test — CPU Spike Simulation
# Creates high CPU usage for 60 seconds to trigger alerts

echo "╔══════════════════════════════════════╗"
echo "║  CPU Spike Simulation                ║"
echo "║  Duration: 60 seconds                ║"
echo "║  Expected: CPU alert in Unwire AI    ║"
echo "╚══════════════════════════════════════╝"

DURATION=${1:-60}

echo "→ Starting CPU stress for ${DURATION}s..."
stress-ng --cpu $(nproc) --timeout ${DURATION}s --metrics-brief 2>/dev/null &

echo "→ CPU spike active. Monitor in Unwire AI dashboard."
echo "→ Will auto-stop after ${DURATION} seconds."
echo ""
echo "  Expected alerts:"
echo "  - CPU usage above 75% (WARNING)"
echo "  - CPU usage above 90% (CRITICAL)"
echo ""
echo "  Test AI Agent:"
echo "  Ask: 'Why is my server CPU high?'"

wait
echo "→ CPU spike ended."
