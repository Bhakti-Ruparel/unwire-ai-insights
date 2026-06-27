# Unwire AI — Test Environment

Complete isolated testing environment that simulates real customer servers for end-to-end platform testing.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Unwire AI Backend (localhost:5000)                          │
│ Unwire AI Frontend (localhost:3000)                         │
└─────────────────────────┬───────────────────────────────────┘
                          │ API calls
┌─────────────────────────▼───────────────────────────────────┐
│ Test Environment (Docker Compose)                           │
│                                                             │
│  ┌──────────────────┐  ┌──────────────────┐               │
│  │ test-server      │  │ test-postgres    │               │
│  │ (Linux + Agent)  │  │ (PostgreSQL 16)  │               │
│  │ Port: 2222 (SSH) │  │ Port: 5433       │               │
│  │ Port: 9898 (Cmd) │  └──────────────────┘               │
│  │ Port: 4000 (App) │                                      │
│  └──────────────────┘  ┌──────────────────┐               │
│                         │ test-redis       │               │
│                         │ Port: 6380       │               │
│                         └──────────────────┘               │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Start the test environment

```bash
cd unwire-ai-test-environment
docker compose up -d --build
```

### 2. Connect to Unwire AI

1. Open Unwire AI dashboard: http://localhost:3000
2. Go to **Infrastructure** → **Add Server**
3. Enter:
   - Name: `Test Server`
   - Host: `host.docker.internal` (or `172.17.0.1` on Linux)
4. Copy the agent token
5. Install agent on test server:

```bash
docker exec -it unwire-test-server bash
unwire-agent configure --token <YOUR_TOKEN> --server http://host.docker.internal:5000
unwire-agent start &
```

### 3. Verify connection

- Server should appear as **Online** in Infrastructure page
- Metrics (CPU/RAM/Disk) should start flowing
- Processes and Docker containers should be detected

## Test Scenarios

### Monitoring Test
```bash
# Create CPU spike
docker exec unwire-test-server /scripts/high-cpu.sh

# Check: Alert should trigger in Unwire AI
# Check: AI Agent should diagnose "High CPU usage detected"
```

### Application Test
```bash
# The Node.js demo app is running on port 4000
# Hit the slow endpoint:
curl http://localhost:4000/slow

# Ask AI: "Why is my application slow?"
```

### Deployment Test
```bash
# Use Unwire AI deployment page to deploy sample-app
# The test server has Docker and can build/run containers
```

### Failure Simulation
```bash
# Fill disk
docker exec unwire-test-server /scripts/disk-fill.sh

# Kill application
docker exec unwire-test-server /scripts/kill-app.sh

# Verify alerts trigger and AI diagnoses correctly
```

## Access Test Server

```bash
# SSH into test server
ssh root@localhost -p 2222
# Password: unwire-test

# Or use docker exec
docker exec -it unwire-test-server bash
```

## Stop Environment

```bash
docker compose down
# With volume cleanup:
docker compose down -v
```

## File Structure

```
unwire-ai-test-environment/
├── docker-compose.yml          # Full test stack
├── test-server/
│   ├── Dockerfile              # Simulated customer server
│   ├── entrypoint.sh           # Server initialization
│   └── sshd_config             # SSH configuration
├── sample-apps/
│   ├── express-demo/
│   │   ├── package.json
│   │   ├── server.js           # Express app with slow endpoints
│   │   └── Dockerfile
│   └── docker-demo/
│       ├── docker-compose.yml
│       └── Dockerfile
├── scripts/
│   ├── high-cpu.sh             # CPU spike simulation
│   ├── disk-fill.sh            # Disk pressure simulation
│   ├── kill-app.sh             # Application crash simulation
│   ├── memory-leak.sh          # Memory pressure simulation
│   └── install-agent.sh        # Agent installation helper
└── README.md
```
