package docker

import (
	"context"
	"strings"
	"time"
)

type ContainerInfo struct {
	ID      string  `json:"id"`
	Name    string  `json:"name"`
	Image   string  `json:"image"`
	Status  string  `json:"status"`
	State   string  `json:"state"`
	CPU     float64 `json:"cpu"`
	Memory  float64 `json:"memory"` // MB
	Uptime  string  `json:"uptime"`
	Port    int     `json:"port,omitempty"`
}

// Collect tries to list Docker containers via the Docker API.
// Falls back gracefully if Docker is not available.
func Collect() ([]ContainerInfo, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	return collectViaAPI(ctx)
}

// collectViaAPI uses Docker HTTP API directly (no heavy SDK needed at compile time)
func collectViaAPI(ctx context.Context) ([]ContainerInfo, error) {
	containers, err := listContainersHTTP(ctx)
	if err != nil {
		return nil, err
	}
	return containers, nil
}

func formatUptime(created int64) string {
	dur := time.Since(time.Unix(created, 0))
	if dur.Hours() > 24*7 {
		return strings.TrimRight(strings.TrimRight(
			time.Duration(dur.Hours()/24/7).String()+"w", "0"), ".")
	}
	if dur.Hours() > 24 {
		days := int(dur.Hours() / 24)
		hours := int(dur.Hours()) % 24
		return strings.TrimRight(strings.TrimRight(
			formatDH(days, hours), "0"), ".")
	}
	if dur.Hours() >= 1 {
		return strings.TrimRight(dur.Round(time.Minute).String(), "0s")
	}
	return dur.Round(time.Second).String()
}

func formatDH(days, hours int) string {
	if hours > 0 {
		return strings.Replace(strings.Replace("%dd %dh", "%d", string(rune('0'+days%10)), 1), "%d", string(rune('0'+hours%10)), 1)
	}
	return string(rune('0'+days%10)) + "d"
}
