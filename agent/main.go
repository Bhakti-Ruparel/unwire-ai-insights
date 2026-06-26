// Unwire AI Server Agent
// Lightweight monitoring agent that collects system metrics, processes,
// Docker containers, and logs — sends them to the Unwire AI backend.
//
// Usage:
//   unwire-agent --token <AGENT_TOKEN> --server https://api.unwire.ai
//   unwire-agent configure --token <TOKEN> --server <URL>
//   unwire-agent start

package main

import (
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/unwireai/agent/internal/config"
	"github.com/unwireai/agent/internal/collector"
	"github.com/unwireai/agent/internal/executor"
	"github.com/unwireai/agent/internal/sender"
)

const VERSION = "1.0.0"

func main() {
	if len(os.Args) < 2 {
		printUsage()
		os.Exit(1)
	}

	switch os.Args[1] {
	case "configure":
		handleConfigure()
	case "start":
		handleStart()
	case "version":
		fmt.Printf("unwire-agent v%s\n", VERSION)
	case "--token":
		// Direct run: unwire-agent --token xxx --server url
		handleDirectRun()
	case "help", "--help", "-h":
		printUsage()
	default:
		fmt.Fprintf(os.Stderr, "Unknown command: %s\n", os.Args[1])
		printUsage()
		os.Exit(1)
	}
}

func handleConfigure() {
	cfg := config.ParseFlags(os.Args[2:])
	if cfg.Token == "" {
		fmt.Fprintln(os.Stderr, "Error: --token is required")
		os.Exit(1)
	}
	if err := config.Save(cfg); err != nil {
		fmt.Fprintf(os.Stderr, "Error saving config: %v\n", err)
		os.Exit(1)
	}
	fmt.Println("✓ Configuration saved to /etc/unwire-agent/config.json")
	fmt.Println("  Run: unwire-agent start")
}

func handleStart() {
	cfg, err := config.Load()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error loading config: %v\n", err)
		fmt.Fprintln(os.Stderr, "Run: unwire-agent configure --token <TOKEN> --server <URL>")
		os.Exit(1)
	}
	runAgent(cfg)
}

func handleDirectRun() {
	cfg := config.ParseFlags(os.Args[1:])
	if cfg.Token == "" {
		fmt.Fprintln(os.Stderr, "Error: --token is required")
		os.Exit(1)
	}
	runAgent(cfg)
}

func runAgent(cfg *config.Config) {
	fmt.Printf("Unwire AI Agent v%s\n", VERSION)
	fmt.Printf("  Server:   %s\n", cfg.ServerURL)
	fmt.Printf("  Interval: %ds\n", cfg.IntervalSeconds)
	fmt.Println("  Starting...")

	// Create sender
	s := sender.New(cfg.ServerURL, cfg.Token, cfg.ServerID)

	// Register with backend
	if cfg.ServerID == "" {
		serverID, err := s.Register()
		if err != nil {
			fmt.Fprintf(os.Stderr, "Registration failed: %v\n", err)
			fmt.Fprintln(os.Stderr, "Check your token and server URL.")
			os.Exit(1)
		}
		cfg.ServerID = serverID
		config.Save(cfg)
		fmt.Printf("  ✓ Registered as server: %s\n", serverID)
	} else {
		fmt.Printf("  ✓ Server ID: %s\n", cfg.ServerID)
	}

	// Start command server for deployment execution
	executor.StartCommandServer(9898, cfg.Token)

	// Create collector
	c := collector.New(cfg.IntervalSeconds)

	// Start collection loop
	stop := make(chan struct{})
	go c.Run(stop, s)

	fmt.Println("  ✓ Agent running. Press Ctrl+C to stop.")

	// Wait for interrupt
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	<-sigCh

	close(stop)
	fmt.Println("\n  Agent stopped.")
}

func printUsage() {
	fmt.Printf(`Unwire AI Server Agent v%s

Usage:
  unwire-agent configure --token <TOKEN> [--server <URL>] [--interval <SECONDS>]
  unwire-agent start
  unwire-agent --token <TOKEN> [--server <URL>]
  unwire-agent version

Commands:
  configure   Save configuration to /etc/unwire-agent/config.json
  start       Start the agent using saved configuration
  version     Print version

Flags:
  --token     Agent authentication token (required)
  --server    Unwire AI backend URL (default: http://localhost:5000)
  --interval  Metrics collection interval in seconds (default: 30)

`, VERSION)
}
