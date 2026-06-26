package sender

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"runtime"
	"time"

	"github.com/unwireai/agent/internal/collector/docker"
	"github.com/unwireai/agent/internal/collector/logs"
	"github.com/unwireai/agent/internal/collector/metrics"
	"github.com/unwireai/agent/internal/collector/processes"
)

type Sender struct {
	serverURL string
	token     string
	serverID  string
	client    *http.Client
}

type HeartbeatPayload struct {
	Status       string `json:"status"`
	AgentVersion string `json:"agentVersion"`
	Hostname     string `json:"hostname"`
	OS           string `json:"os"`
	Arch         string `json:"arch"`
}

func New(serverURL, token, serverID string) *Sender {
	return &Sender{
		serverURL: serverURL,
		token:     token,
		serverID:  serverID,
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// Register registers this agent with the Unwire AI backend.
// Returns the serverId assigned by the backend.
func (s *Sender) Register() (string, error) {
	hostname, _ := os.Hostname()

	payload := map[string]interface{}{
		"hostname": hostname,
		"os":       runtime.GOOS,
		"arch":     runtime.GOARCH,
		"version":  "1.0.0",
	}

	resp, err := s.post("/api/agent-push/register", payload)
	if err != nil {
		return "", err
	}

	serverID, ok := resp["serverId"].(string)
	if !ok {
		return "", fmt.Errorf("registration response missing serverId")
	}
	return serverID, nil
}

func (s *Sender) SendHeartbeat(payload *HeartbeatPayload) {
	s.post(fmt.Sprintf("/api/servers/%s/heartbeat", s.serverID), payload)
}

func (s *Sender) SendMetrics(m *metrics.SystemMetrics) {
	s.post(fmt.Sprintf("/api/servers/%s/metrics", s.serverID), m)
}

func (s *Sender) SendProcesses(procs []processes.ProcessInfo) {
	payload := map[string]interface{}{
		"processes": procs,
	}
	s.post(fmt.Sprintf("/api/agent-push/%s/processes", s.serverID), payload)
}

func (s *Sender) SendDocker(containers []docker.ContainerInfo) {
	payload := map[string]interface{}{
		"containers": containers,
	}
	s.post(fmt.Sprintf("/api/agent-push/%s/docker", s.serverID), payload)
}

func (s *Sender) SendLogs(entries []logs.LogEntry) {
	payload := map[string]interface{}{
		"logs": entries,
	}
	s.post(fmt.Sprintf("/api/servers/%s/logs", s.serverID), payload)
}

// post sends a JSON POST request to the backend with agent token auth.
func (s *Sender) post(path string, payload interface{}) (map[string]interface{}, error) {
	data, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	url := s.serverURL + path
	req, err := http.NewRequest("POST", url, bytes.NewReader(data))
	if err != nil {
		return nil, err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+s.token)
	req.Header.Set("X-Agent-Version", "1.0.0")

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(body))
	}

	var result map[string]interface{}
	if len(body) > 0 {
		json.Unmarshal(body, &result)
	}

	// Extract data field if present (backend wraps in {success, data})
	if dataField, ok := result["data"]; ok {
		if dataMap, ok := dataField.(map[string]interface{}); ok {
			return dataMap, nil
		}
	}

	return result, nil
}
