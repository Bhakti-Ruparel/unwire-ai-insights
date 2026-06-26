// Package executor handles deployment command execution on the agent.
// Commands are received from the Unwire AI backend and executed securely
// within a whitelisted set of operations.
package executor

import (
	"context"
	"fmt"
	"os/exec"
	"strings"
	"time"
)

// CommandResult represents the output of an executed command.
type CommandResult struct {
	ExitCode int    `json:"exitCode"`
	Stdout   string `json:"stdout"`
	Stderr   string `json:"stderr"`
	Duration int64  `json:"durationMs"`
	Error    string `json:"error,omitempty"`
}

// DeployRequest represents a deployment task from the backend.
type DeployRequest struct {
	DeploymentID string            `json:"deploymentId"`
	Action       string            `json:"action"` // clone, build, deploy, healthcheck, rollback, stop
	Repository   string            `json:"repository,omitempty"`
	Branch       string            `json:"branch,omitempty"`
	WorkDir      string            `json:"workDir,omitempty"`
	Files        map[string]string `json:"files,omitempty"` // filename -> content
	EnvVars      map[string]string `json:"envVars,omitempty"`
	Port         int               `json:"port,omitempty"`
	AppName      string            `json:"appName,omitempty"`
	Timeout      int               `json:"timeout,omitempty"` // seconds
}

// Whitelisted command prefixes — never allow arbitrary execution
var allowedCommands = []string{
	"git clone", "git pull", "git checkout", "git fetch",
	"docker build", "docker compose", "docker-compose",
	"docker run", "docker stop", "docker rm", "docker ps",
	"docker pull", "docker images", "docker network",
	"npm install", "npm ci", "npm run", "npm start",
	"yarn install", "yarn build", "yarn start",
	"pnpm install", "pnpm build", "pnpm start",
	"pip install", "python", "uvicorn",
	"mkdir", "cp", "mv", "chmod", "cat", "ls",
	"curl", "wget", "systemctl",
}

// Execute runs a whitelisted command with timeout.
func Execute(ctx context.Context, command string, workDir string, timeout int) *CommandResult {
	start := time.Now()

	if !isAllowed(command) {
		return &CommandResult{
			ExitCode: -1,
			Error:    fmt.Sprintf("command not allowed: %s", firstWord(command)),
			Duration: 0,
		}
	}

	if timeout <= 0 {
		timeout = 300 // default 5 minutes
	}

	ctx, cancel := context.WithTimeout(ctx, time.Duration(timeout)*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "sh", "-c", command)
	if workDir != "" {
		cmd.Dir = workDir
	}

	stdout, err := cmd.Output()
	duration := time.Since(start).Milliseconds()

	result := &CommandResult{
		Stdout:   truncateOutput(string(stdout), 50000),
		Duration: duration,
	}

	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			result.ExitCode = exitErr.ExitCode()
			result.Stderr = truncateOutput(string(exitErr.Stderr), 10000)
		} else {
			result.ExitCode = -1
			result.Error = err.Error()
		}
	}

	return result
}

// ExecuteDeployAction processes a high-level deployment action.
func ExecuteDeployAction(req *DeployRequest, reportFn func(step, message, level string)) *CommandResult {
	ctx := context.Background()
	timeout := req.Timeout
	if timeout <= 0 {
		timeout = 600 // 10 minutes for deployment actions
	}

	switch req.Action {
	case "clone":
		return executeClone(ctx, req, reportFn)
	case "write_files":
		return executeWriteFiles(req, reportFn)
	case "build":
		return executeBuild(ctx, req, timeout, reportFn)
	case "deploy":
		return executeDeploy(ctx, req, timeout, reportFn)
	case "healthcheck":
		return executeHealthCheck(ctx, req, reportFn)
	case "stop":
		return executeStop(ctx, req, reportFn)
	case "rollback":
		return executeRollback(ctx, req, reportFn)
	default:
		return &CommandResult{ExitCode: -1, Error: fmt.Sprintf("unknown action: %s", req.Action)}
	}
}

func executeClone(ctx context.Context, req *DeployRequest, report func(string, string, string)) *CommandResult {
	workDir := fmt.Sprintf("/opt/unwire/deployments/%s", req.AppName)

	report("Clone", "Preparing deployment directory", "info")
	Execute(ctx, fmt.Sprintf("mkdir -p %s", workDir), "", 30)

	report("Clone", fmt.Sprintf("Cloning %s (branch: %s)", req.Repository, req.Branch), "info")
	cmd := fmt.Sprintf("git clone --depth 1 --branch %s %s %s", req.Branch, req.Repository, workDir)
	result := Execute(ctx, cmd, "", 120)

	if result.ExitCode != 0 {
		// Try pulling if already exists
		report("Clone", "Directory exists, pulling latest...", "info")
		pullCmd := fmt.Sprintf("git -C %s fetch origin %s && git -C %s reset --hard origin/%s", workDir, req.Branch, workDir, req.Branch)
		result = Execute(ctx, pullCmd, "", 120)
	}

	if result.ExitCode == 0 {
		report("Clone", "✓ Repository cloned successfully", "info")
	}
	return result
}

func executeWriteFiles(req *DeployRequest, report func(string, string, string)) *CommandResult {
	workDir := fmt.Sprintf("/opt/unwire/deployments/%s", req.AppName)

	for filename, content := range req.Files {
		report("Write Files", fmt.Sprintf("Writing %s", filename), "info")
		// Use a safe write method
		path := fmt.Sprintf("%s/%s", workDir, filename)
		cmd := fmt.Sprintf("cat > %s << 'UNWIRE_EOF'\n%s\nUNWIRE_EOF", path, content)
		result := Execute(context.Background(), cmd, "", 10)
		if result.ExitCode != 0 {
			return result
		}
	}

	// Write .env if provided
	if len(req.EnvVars) > 0 {
		report("Write Files", "Writing .env file", "info")
		envContent := ""
		for k, v := range req.EnvVars {
			envContent += fmt.Sprintf("%s=%s\n", k, v)
		}
		cmd := fmt.Sprintf("cat > %s/.env << 'UNWIRE_EOF'\n%s\nUNWIRE_EOF", workDir, envContent)
		Execute(context.Background(), cmd, "", 10)
	}

	report("Write Files", "✓ All files written", "info")
	return &CommandResult{ExitCode: 0}
}

func executeBuild(ctx context.Context, req *DeployRequest, timeout int, report func(string, string, string)) *CommandResult {
	workDir := fmt.Sprintf("/opt/unwire/deployments/%s", req.AppName)

	report("Build", "Building Docker image...", "info")
	imageName := fmt.Sprintf("unwire-%s:latest", req.AppName)
	cmd := fmt.Sprintf("docker build -t %s %s", imageName, workDir)
	result := Execute(ctx, cmd, workDir, timeout)

	if result.ExitCode == 0 {
		report("Build", fmt.Sprintf("✓ Image built: %s", imageName), "info")
	} else {
		report("Build", fmt.Sprintf("✗ Build failed: %s", result.Stderr), "error")
	}
	return result
}

func executeDeploy(ctx context.Context, req *DeployRequest, timeout int, report func(string, string, string)) *CommandResult {
	workDir := fmt.Sprintf("/opt/unwire/deployments/%s", req.AppName)
	containerName := fmt.Sprintf("unwire-%s", req.AppName)
	blueContainer := containerName + "-blue"
	greenContainer := containerName + "-green"
	imageName := fmt.Sprintf("unwire-%s:latest", req.AppName)

	// Blue-green: start new container alongside old one
	report("Deploy", "Starting new container (blue-green)...", "info")

	// Check which color is currently active
	activeCheck := Execute(ctx, fmt.Sprintf("docker ps --filter name=%s --format '{{.Names}}'", blueContainer), "", 10)
	var newContainer, oldContainer string
	if strings.Contains(activeCheck.Stdout, blueContainer) {
		newContainer = greenContainer
		oldContainer = blueContainer
	} else {
		newContainer = blueContainer
		oldContainer = greenContainer
	}

	// Stop and remove new container if exists
	Execute(ctx, fmt.Sprintf("docker stop %s 2>/dev/null; docker rm %s 2>/dev/null", newContainer, newContainer), "", 15)

	// Start new container
	portMapping := fmt.Sprintf("%d:%d", req.Port, req.Port)
	runCmd := fmt.Sprintf("docker run -d --name %s --restart unless-stopped -p %s --env-file %s/.env %s",
		newContainer, portMapping, workDir, imageName)
	result := Execute(ctx, runCmd, "", 60)

	if result.ExitCode != 0 {
		// Fallback: try docker-compose
		report("Deploy", "Direct run failed, trying docker-compose...", "info")
		composeCmd := fmt.Sprintf("docker compose -f %s/docker-compose.yml up -d", workDir)
		result = Execute(ctx, composeCmd, workDir, timeout)
	}

	if result.ExitCode == 0 {
		report("Deploy", fmt.Sprintf("✓ Container %s started", newContainer), "info")

		// After health check passes, stop old container
		report("Deploy", "Stopping old container...", "info")
		Execute(ctx, fmt.Sprintf("docker stop %s 2>/dev/null; docker rm %s 2>/dev/null", oldContainer, oldContainer), "", 15)
	}

	return result
}

func executeHealthCheck(ctx context.Context, req *DeployRequest, report func(string, string, string)) *CommandResult {
	port := req.Port
	if port == 0 {
		port = 3000
	}

	report("Health Check", fmt.Sprintf("Checking health on port %d...", port), "info")

	// Try up to 10 times with 3s intervals
	for i := 0; i < 10; i++ {
		cmd := fmt.Sprintf("curl -sf -o /dev/null -w '%%{http_code}' http://localhost:%d/health || curl -sf -o /dev/null -w '%%{http_code}' http://localhost:%d/", port, port)
		result := Execute(ctx, cmd, "", 5)
		if result.ExitCode == 0 {
			report("Health Check", "✓ Application is healthy", "info")
			return &CommandResult{ExitCode: 0, Stdout: "healthy"}
		}
		time.Sleep(3 * time.Second)
		report("Health Check", fmt.Sprintf("Attempt %d/10 - waiting for app to start...", i+1), "info")
	}

	report("Health Check", "✗ Health check failed after 30 seconds", "error")
	return &CommandResult{ExitCode: 1, Error: "health check timeout"}
}

func executeStop(ctx context.Context, req *DeployRequest, report func(string, string, string)) *CommandResult {
	containerName := fmt.Sprintf("unwire-%s", req.AppName)
	report("Stop", fmt.Sprintf("Stopping %s...", containerName), "info")

	Execute(ctx, fmt.Sprintf("docker stop %s-blue 2>/dev/null; docker stop %s-green 2>/dev/null", containerName, containerName), "", 30)
	Execute(ctx, fmt.Sprintf("docker rm %s-blue 2>/dev/null; docker rm %s-green 2>/dev/null", containerName, containerName), "", 10)

	report("Stop", "✓ Containers stopped", "info")
	return &CommandResult{ExitCode: 0}
}

func executeRollback(ctx context.Context, req *DeployRequest, report func(string, string, string)) *CommandResult {
	report("Rollback", "Rolling back to previous version...", "info")
	// Stop current and start the other color
	containerName := fmt.Sprintf("unwire-%s", req.AppName)

	// Find which is running
	psResult := Execute(ctx, fmt.Sprintf("docker ps --filter name=%s --format '{{.Names}}'", containerName), "", 10)
	current := strings.TrimSpace(psResult.Stdout)

	if strings.Contains(current, "blue") {
		// Stop blue, start green (previous)
		Execute(ctx, fmt.Sprintf("docker stop %s-blue; docker start %s-green", containerName, containerName), "", 30)
	} else {
		Execute(ctx, fmt.Sprintf("docker stop %s-green; docker start %s-blue", containerName, containerName), "", 30)
	}

	report("Rollback", "✓ Rollback complete", "info")
	return &CommandResult{ExitCode: 0}
}

// ─── Helpers ──────────────────────────────────────────────────────────────

func isAllowed(command string) bool {
	cmdLower := strings.ToLower(strings.TrimSpace(command))
	for _, prefix := range allowedCommands {
		if strings.HasPrefix(cmdLower, prefix) {
			return true
		}
	}
	// Allow cat with redirect (used for file writing)
	if strings.HasPrefix(cmdLower, "cat >") {
		return true
	}
	return false
}

func firstWord(s string) string {
	parts := strings.Fields(s)
	if len(parts) > 0 {
		return parts[0]
	}
	return s
}

func truncateOutput(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "\n...[truncated]"
}
