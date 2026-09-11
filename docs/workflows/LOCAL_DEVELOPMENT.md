# Local Development Setup

## Prerequisites
- Node.js 20+
- PostgreSQL (local or hosted)
- Redis (optional — system degrades gracefully without it)
- Docker (for test environment)

## 1. Clone and Install

```bash
# Frontend
cd unwire-ai-insights
npm install

# Backend
cd backend
npm install
```

## 2. Environment Configuration

### Backend (`backend/.env`)
```env
PORT=5000
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/unwire_ai?schema=public"
FRONTEND_URL="http://localhost:8080"
JWT_SECRET="your-dev-secret-min-32-chars"
JWT_REFRESH_SECRET="your-dev-refresh-secret"
NODE_ENV="development"

# Optional
REDIS_URL="redis://localhost:6379"
OPENROUTER_API_KEY="your-key"
INFRA_ENCRYPTION_KEY="32-byte-hex-key"
API_PUBLIC_URL="http://YOUR_LAN_IP:5000"
```

### Frontend (`.env`)
```env
VITE_API_URL=http://localhost:5000
```

## 3. Database Setup

```bash
cd backend
npx prisma migrate deploy
npx prisma generate
```

## 4. Start Development Servers

```bash
# Terminal 1 — Backend
cd backend
npm run dev

# Terminal 2 — Frontend
npm run dev
```

Frontend typically runs on `http://localhost:8080`
Backend runs on `http://localhost:5000`

## 5. Test Environment (Docker)

For testing agent connection:
```bash
cd unwire-ai-test-environment
docker compose up -d --build
```

This starts:
- Test server container (Ubuntu + agent + sample app)
- PostgreSQL (port 5433)
- Redis (port 6380)

## 6. Connect Test Agent

1. Create a server in the UI (name: "Test Server", host: "localhost")
2. Copy the install command
3. Run inside test container:
```bash
docker exec -it unwire-test-server bash
# Run the install command or manually:
unwire-agent configure --token <TOKEN> --server http://host.docker.internal:5000
unwire-agent start &
```

## Important Notes

- **Never use `localhost` as server host** when the agent is in Docker — use `host.docker.internal` or your LAN IP
- **API_PUBLIC_URL** should be your machine's LAN IP (e.g., `http://192.168.1.100:5000`) for the installer to generate correct commands
- **Port 9898** must be exposed from Docker containers for command execution to work
- **CORS** must allow the frontend origin (configured in `FRONTEND_URL`)
