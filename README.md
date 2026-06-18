# Unwire AI

AI-powered codebase intelligence — upload any project and instantly get architecture maps, API discovery, dependency analysis, database schema extraction, and an AI chat grounded in your code.

---

## Project Structure

```
unwire-ai-insights/
├── src/                     # Frontend (TanStack Start + React)
│   ├── components/
│   ├── context/             # ProjectContext (global state)
│   ├── mock/                # Mock data (used as fallback / dev seed)
│   ├── routes/              # File-based routes (TanStack Router)
│   ├── services/
│   │   ├── api.ts           # All fetch() calls — swap URL to go live
│   │   └── projectService.ts
│   └── types/
│       └── project.ts       # Shared frontend types
│
├── backend/                 # Node.js backend (Express + Prisma + PostgreSQL)
│   ├── prisma/
│   │   └── schema.prisma    # Database schema
│   ├── src/
│   │   ├── server.ts        # Express entry point
│   │   ├── routes/
│   │   │   └── projectRoutes.ts
│   │   ├── controllers/
│   │   │   └── projectController.ts
│   │   ├── services/
│   │   │   ├── projectService.ts   # DB queries + business logic
│   │   │   └── analyzerService.ts  # Placeholder AI analyzer
│   │   ├── models/
│   │   │   └── Project.ts   # Shared backend DTOs / types
│   │   └── database/
│   │       └── db.ts        # Prisma client singleton
│   └── uploads/             # ZIP uploads stored here (gitignored)
│
└── README.md
```

---

## Prerequisites

- **Node.js** ≥ 20
- **PostgreSQL** ≥ 14 running locally (or a hosted instance)
- **npm** ≥ 10

---

## Backend Setup

```bash
cd backend

# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env — set DATABASE_URL to your PostgreSQL connection string
# Example: postgresql://postgres:password@localhost:5432/unwire_ai

# 3. Generate Prisma client
npx prisma generate

# 4. Run database migration (creates all tables)
npx prisma migrate dev --name init

# 5. Start the development server (hot-reload via nodemon)
npm run dev
```

The backend will start at **http://localhost:5000**.

### Available backend scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start with nodemon (auto-restarts on file changes) |
| `npm run build` | Compile TypeScript → `dist/` |
| `npm start` | Run compiled output (production) |
| `npm run prisma:generate` | Re-generate Prisma client after schema changes |
| `npm run prisma:migrate` | Create and apply a new migration |
| `npm run prisma:studio` | Open Prisma Studio (visual DB browser) |

---

## Frontend Setup

```bash
# From the project root (unwire-ai-insights/)

# 1. Install dependencies
npm install

# 2. Configure environment
# .env is already created — verify VITE_API_URL matches your backend port
cat .env
# VITE_API_URL=http://localhost:5000

# 3. Start the dev server
npm run dev
```

The frontend will start at **http://localhost:3000** (or the port shown in the terminal).

---

## API Endpoints

All responses follow the envelope:
```json
{ "success": true, "data": { ... } }
{ "success": false, "error": "..." }
```

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/projects` | List all projects |
| `GET` | `/api/projects/:id` | Get single project |
| `POST` | `/api/projects` | Create new project |
| `POST` | `/api/projects/:id/upload` | Upload ZIP file (multipart) |
| `GET` | `/api/projects/:id/overview` | Project overview + architecture nodes |
| `GET` | `/api/projects/:id/apis` | Discovered API endpoints |
| `GET` | `/api/projects/:id/dependencies` | Package dependencies |
| `GET` | `/api/projects/:id/backend` | Backend framework info |
| `GET` | `/api/projects/:id/schema` | Database schema tables |
| `GET` | `/health` | Health check |

### POST /api/projects — Request body
```json
{
  "name": "My Project",
  "sourceType": "github",
  "githubUrl": "https://github.com/org/repo"
}
```
or for ZIP upload:
```json
{
  "name": "My Project",
  "sourceType": "zip"
}
```
Then `POST /api/projects/:id/upload` with `multipart/form-data`, field name `file`.

---

## Application Flow

```
User opens frontend
  ↓
Clicks "Create New Project"
  ↓
Frontend sends POST /api/projects
  ↓
Backend creates project record (status: Queued)
  ↓
Backend triggers analyzerService.analyzeProject() in background
  ↓
Project status → Analyzing → Analyzed
  ↓
Projects page polls / re-fetches from GET /api/projects
  ↓
Dashboard loads dynamic data from backend
```

---

## Connecting the AI Analyzer

The `backend/src/services/analyzerService.ts` file contains a `analyzeProject()` function that currently returns mock data. Replace its body with your AI agent pipeline:

```ts
export async function analyzeProject(
  projectPath: string,
  projectName: string
): Promise<AnalysisResult> {
  // TODO: replace with real pipeline
  // 1. Walk file tree → count files, detect framework
  // 2. AST parse → extract API routes
  // 3. Parse package.json/requirements.txt → dependencies
  // 4. Parse ORM models → database schema
  // 5. Build vector index for RAG chat
  return { ... };
}
```

No other files need to change — the service layer calls this function and persists whatever it returns.

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `5000` | Port the Express server listens on |
| `DATABASE_URL` | — | PostgreSQL connection string |
| `FRONTEND_URL` | `http://localhost:3000` | CORS allowed origin |
| `NODE_ENV` | `development` | `development` or `production` |

### Frontend (`.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_URL` | `http://localhost:5000` | Backend base URL |
