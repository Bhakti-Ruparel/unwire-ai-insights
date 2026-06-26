package docker

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"runtime"
	"strings"
	"time"
)

// Docker API types (minimal subset needed)
type dockerContainer struct {
	ID      string   `json:"Id"`
	Names   []string `json:"Names"`
	Image   string   `json:"Image"`
	State   string   `json:"State"`
	Status  string   `json:"Status"`
	Created int64    `json:"Created"`
	Ports   []struct {
		PublicPort int `json:"PublicPort"`
	} `json:"Ports"`
}

type dockerStats struct {
	CPUStats struct {
		CPUUsage struct {
			TotalUsage uint64 `json:"total_usage"`
		} `json:"cpu_usage"`
		SystemCPUUsage uint64 `json:"system_cpu_usage"`
		OnlineCPUs     int    `json:"online_cpus"`
	} `json:"cpu_stats"`
	PreCPUStats struct {
		CPUUsage struct {
			TotalUsage uint64 `json:"total_usage"`
		} `json:"cpu_usage"`
		SystemCPUUsage uint64 `json:"system_cpu_usage"`
	} `json:"precpu_stats"`
	MemoryStats struct {
		Usage uint64 `json:"usage"`
		Limit uint64 `json:"limit"`
	} `json:"memory_stats"`
}

func getDockerClient() *http.Client {
	socketPath := "/var/run/docker.sock"
	if runtime.GOOS == "windows" {
		socketPath = `\\.\pipe\docker_engine`
	}

	return &http.Client{
		Timeout: 5 * time.Second,
		Transport: &http.Transport{
			DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
				if runtime.GOOS == "windows" {
					// Windows named pipe - fallback to TCP
					return net.DialTimeout("tcp", "localhost:2375", 3*time.Second)
				}
				return net.DialTimeout("unix", socketPath, 3*time.Second)
			},
		},
	}
}

func listContainersHTTP(ctx context.Context) ([]ContainerInfo, error) {
	client := getDockerClient()

	req, err := http.NewRequestWithContext(ctx, "GET", "http://localhost/containers/json?all=true", nil)
	if err != nil {
		return nil, err
	}

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("docker not available: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("docker API returned %d", resp.StatusCode)
	}

	var containers []dockerContainer
	if err := json.NewDecoder(resp.Body).Decode(&containers); err != nil {
		return nil, err
	}

	var results []ContainerInfo
	for _, c := range containers {
		name := ""
		if len(c.Names) > 0 {
			name = strings.TrimPrefix(c.Names[0], "/")
		}

		port := 0
		if len(c.Ports) > 0 {
			port = c.Ports[0].PublicPort
		}

		info := ContainerInfo{
			ID:     c.ID[:12],
			Name:   name,
			Image:  c.Image,
			Status: c.Status,
			State:  c.State,
			Port:   port,
			Uptime: formatUptime(c.Created),
		}

		// Try to get stats (CPU/RAM) for running containers
		if c.State == "running" {
			cpu, mem := getContainerStats(ctx, client, c.ID)
			info.CPU = cpu
			info.Memory = mem
		}

		results = append(results, info)
	}

	return results, nil
}

func getContainerStats(ctx context.Context, client *http.Client, containerID string) (float64, float64) {
	url := fmt.Sprintf("http://localhost/containers/%s/stats?stream=false", containerID)
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return 0, 0
	}

	resp, err := client.Do(req)
	if err != nil {
		return 0, 0
	}
	defer resp.Body.Close()

	var stats dockerStats
	if err := json.NewDecoder(resp.Body).Decode(&stats); err != nil {
		return 0, 0
	}

	// Calculate CPU percentage
	cpuDelta := float64(stats.CPUStats.CPUUsage.TotalUsage - stats.PreCPUStats.CPUUsage.TotalUsage)
	systemDelta := float64(stats.CPUStats.SystemCPUUsage - stats.PreCPUStats.SystemCPUUsage)
	cpuPercent := 0.0
	if systemDelta > 0 && cpuDelta > 0 {
		cpuPercent = (cpuDelta / systemDelta) * float64(stats.CPUStats.OnlineCPUs) * 100.0
	}

	// Memory in MB
	memMB := float64(stats.MemoryStats.Usage) / 1024 / 1024

	return cpuPercent, memMB
}
