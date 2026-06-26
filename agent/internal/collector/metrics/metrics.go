package metrics

import (
	"runtime"
	"time"

	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/host"
	"github.com/shirou/gopsutil/v3/load"
	"github.com/shirou/gopsutil/v3/mem"
	"github.com/shirou/gopsutil/v3/net"
)

type SystemMetrics struct {
	CPUPercent  float64   `json:"cpuPercent"`
	CPUCores    int       `json:"cpuCores"`
	LoadAverage []float64 `json:"loadAverage"`

	MemoryTotal float64 `json:"memoryTotal"`
	MemoryUsed  float64 `json:"memoryUsed"`
	MemoryFree  float64 `json:"memoryFree"`
	RAMPercent  float64 `json:"ramPercent"`

	DiskTotal   float64 `json:"diskTotal"`
	DiskUsed    float64 `json:"diskUsed"`
	DiskPercent float64 `json:"diskPercent"`

	NetworkIn  float64 `json:"networkIn"`
	NetworkOut float64 `json:"networkOut"`

	OS       string `json:"os"`
	Platform string `json:"platform"`
	Kernel   string `json:"kernel"`
	Hostname string `json:"hostname"`
	Uptime   uint64 `json:"uptime"`

	Timestamp string `json:"timestamp"`
}

var lastNetIn, lastNetOut uint64
var lastNetTime time.Time

func Collect() (*SystemMetrics, error) {
	m := &SystemMetrics{
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	}

	// CPU
	cpuPercent, err := cpu.Percent(time.Second, false)
	if err == nil && len(cpuPercent) > 0 {
		m.CPUPercent = cpuPercent[0]
	}
	m.CPUCores = runtime.NumCPU()

	// Load average
	if loadAvg, err := load.Avg(); err == nil {
		m.LoadAverage = []float64{loadAvg.Load1, loadAvg.Load5, loadAvg.Load15}
	}

	// Memory
	if vmem, err := mem.VirtualMemory(); err == nil {
		m.MemoryTotal = float64(vmem.Total)
		m.MemoryUsed = float64(vmem.Used)
		m.MemoryFree = float64(vmem.Free)
		m.RAMPercent = vmem.UsedPercent
	}

	// Disk (root partition)
	rootPath := "/"
	if runtime.GOOS == "windows" {
		rootPath = "C:\\"
	}
	if diskUsage, err := disk.Usage(rootPath); err == nil {
		m.DiskTotal = float64(diskUsage.Total)
		m.DiskUsed = float64(diskUsage.Used)
		m.DiskPercent = diskUsage.UsedPercent
	}

	// Network (calculate rate in Mbps)
	if counters, err := net.IOCounters(false); err == nil && len(counters) > 0 {
		now := time.Now()
		totalIn := counters[0].BytesRecv
		totalOut := counters[0].BytesSent

		if lastNetTime.IsZero() {
			lastNetIn = totalIn
			lastNetOut = totalOut
			lastNetTime = now
		} else {
			elapsed := now.Sub(lastNetTime).Seconds()
			if elapsed > 0 {
				m.NetworkIn = float64(totalIn-lastNetIn) * 8 / elapsed / 1_000_000  // Mbps
				m.NetworkOut = float64(totalOut-lastNetOut) * 8 / elapsed / 1_000_000
			}
			lastNetIn = totalIn
			lastNetOut = totalOut
			lastNetTime = now
		}
	}

	// Host info
	if hostInfo, err := host.Info(); err == nil {
		m.OS = hostInfo.OS
		m.Platform = hostInfo.Platform + " " + hostInfo.PlatformVersion
		m.Kernel = hostInfo.KernelVersion
		m.Hostname = hostInfo.Hostname
		m.Uptime = hostInfo.Uptime
	}

	return m, nil
}
