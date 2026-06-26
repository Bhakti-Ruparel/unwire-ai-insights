// Package executor provides an HTTP API for receiving deployment commands.
// The agent runs a small HTTP server that the Unwire AI backend calls
// to execute deployment steps on this server.
package executor

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
)

var (
	serverToken string
	mu          sync.Mutex
	activeDeploy string // track active deployment to prevent concurrent deploys
)

// StartCommandServer starts the agent's command API server.
// The backend POSTs deployment commands to this endpoint.
func StartCommandServer(port int, agentToken string) {
	serverToken = agentToken

	mux := http.NewServeMux()
	mux.HandleFunc("/deploy", handleDeploy)
	mux.HandleFunc("/status", handleStatus)
	mux.HandleFunc("/health", handleHealth)

	addr := fmt.Sprintf(":%d", port)
	fmt.Printf("  ✓ Command server listening on %s\n", addr)
	go http.ListenAndServe(addr, mux)
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func handleStatus(w http.ResponseWriter, r *http.Request) {
	mu.Lock()
	deploy := activeDeploy
	mu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":           "ready",
		"activeDeployment": deploy,
	})
}

func handleDeploy(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "POST required", http.StatusMethodNotAllowed)
		return
	}

	// Verify auth token
	auth := r.Header.Get("Authorization")
	if auth != "Bearer "+serverToken {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req DeployRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	// Deployment lock — one at a time
	mu.Lock()
	if activeDeploy != "" && req.Action != "healthcheck" && req.Action != "stop" {
		mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusConflict)
		json.NewEncoder(w).Encode(map[string]string{
			"error": fmt.Sprintf("deployment %s is already in progress", activeDeploy),
		})
		return
	}
	if req.Action == "clone" || req.Action == "build" || req.Action == "deploy" {
		activeDeploy = req.DeploymentID
	}
	mu.Unlock()

	// Execute the action
	reportFn := func(step, message, level string) {
		// In future: could stream via WebSocket/SSE to backend
		fmt.Printf("[deploy:%s] [%s] %s\n", req.DeploymentID[:8], step, message)
	}

	result := ExecuteDeployAction(&req, reportFn)

	// Clear lock on terminal actions
	if req.Action == "deploy" || req.Action == "stop" || req.Action == "rollback" || result.ExitCode != 0 {
		mu.Lock()
		activeDeploy = ""
		mu.Unlock()
	}

	w.Header().Set("Content-Type", "application/json")
	if result.ExitCode != 0 {
		w.WriteHeader(http.StatusInternalServerError)
	}
	json.NewEncoder(w).Encode(result)
}
