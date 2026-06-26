package processes

import (
	"strings"

	"github.com/shirou/gopsutil/v3/process"
)

type ProcessInfo struct {
	Name   string  `json:"name"`
	PID    int32   `json:"pid"`
	CPU    float64 `json:"cpu"`
	Memory float64 `json:"memory"` // MB
	Status string  `json:"status"`
	Port   int     `json:"port,omitempty"`
}

// Well-known service names to detect
var knownServices = []string{
	"node", "python", "java", "nginx", "apache", "postgres",
	"mysql", "redis", "mongodb", "docker", "containerd",
	"pm2", "next", "nuxt", "express", "flask", "django",
	"n8n", "grafana", "prometheus", "caddy", "traefik",
}

func Collect() ([]ProcessInfo, error) {
	procs, err := process.Processes()
	if err != nil {
		return nil, err
	}

	var results []ProcessInfo
	seen := make(map[string]bool)

	for _, p := range procs {
		name, err := p.Name()
		if err != nil || name == "" {
			continue
		}

		nameLower := strings.ToLower(name)

		// Only report known/interesting services (not all 200+ processes)
		if !isKnownService(nameLower) {
			continue
		}

		// Deduplicate by name (keep highest CPU)
		if seen[nameLower] {
			continue
		}
		seen[nameLower] = true

		cpuPercent, _ := p.CPUPercent()
		memInfo, _ := p.MemoryInfo()
		status, _ := p.Status()

		memMB := float64(0)
		if memInfo != nil {
			memMB = float64(memInfo.RSS) / 1024 / 1024
		}

		statusStr := "running"
		if len(status) > 0 {
			statusStr = strings.Join(status, ",")
		}

		results = append(results, ProcessInfo{
			Name:   name,
			PID:    p.Pid,
			CPU:    cpuPercent,
			Memory: memMB,
			Status: statusStr,
		})
	}

	return results, nil
}

func isKnownService(name string) bool {
	for _, svc := range knownServices {
		if strings.Contains(name, svc) {
			return true
		}
	}
	return false
}
