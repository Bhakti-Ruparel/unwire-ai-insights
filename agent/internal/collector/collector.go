package collector

import (
	"fmt"
	"os"
	"runtime"
	"time"

	"github.com/unwireai/agent/internal/sender"
	"github.com/unwireai/agent/internal/collector/metrics"
	"github.com/unwireai/agent/internal/collector/processes"
	"github.com/unwireai/agent/internal/collector/docker"
	"github.com/unwireai/agent/internal/collector/logs"
)

type Collector struct {
	interval time.Duration
}

func New(intervalSeconds int) *Collector {
	return &Collector{
		interval: time.Duration(intervalSeconds) * time.Second,
	}
}

func (c *Collector) Run(stop <-chan struct{}, s *sender.Sender) {
	// Initial collection immediately
	c.collect(s)

	ticker := time.NewTicker(c.interval)
	defer ticker.Stop()

	for {
		select {
		case <-stop:
			return
		case <-ticker.C:
			c.collect(s)
		}
	}
}

func (c *Collector) collect(s *sender.Sender) {
	// 1. Send heartbeat
	hostname, _ := os.Hostname()
	s.SendHeartbeat(&sender.HeartbeatPayload{
		Status:       "online",
		AgentVersion: "1.0.0",
		Hostname:     hostname,
		OS:           runtime.GOOS,
		Arch:         runtime.GOARCH,
	})

	// 2. Collect and send system metrics
	m, err := metrics.Collect()
	if err == nil {
		s.SendMetrics(m)
	} else {
		fmt.Fprintf(os.Stderr, "[agent] metrics error: %v\n", err)
	}

	// 3. Collect and send processes
	procs, err := processes.Collect()
	if err == nil && len(procs) > 0 {
		s.SendProcesses(procs)
	}

	// 4. Collect Docker containers (if available)
	containers, err := docker.Collect()
	if err == nil && len(containers) > 0 {
		s.SendDocker(containers)
	}

	// 5. Collect and send logs (batched)
	logEntries := logs.Collect()
	if len(logEntries) > 0 {
		s.SendLogs(logEntries)
	}
}
