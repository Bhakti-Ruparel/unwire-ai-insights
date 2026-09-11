# Project Management & Code Analysis

## Purpose
Upload or connect a code repository, and AI analyzes the architecture, APIs, dependencies, database schema, and external services.

## User Flow
1. Create project (upload ZIP or paste GitHub URL)
2. Backend analyzes: files, framework detection, API extraction, dependency scan
3. User explores: Overview, APIs, Architecture, Backend, Database, Dependencies, Services
4. User chats with AI about their codebase (RAG)

## Frontend Routes
- List: `src/routes/projects.index.tsx`
- Layout: `src/routes/projects.$projectId.tsx`
- Sub-pages: `.index`, `.apis`, `.architecture`, `.backend`, `.database`, `.dependencies`, `.services`, `.chat`, `.deployment`, `.deployments`

## Backend Implementation
- Controller: `backend/src/controllers/projectController.ts`
- Service: `backend/src/services/projectService.ts`
- Analyzers: `analyzerService.ts`, `apiAnalyzer.ts`, `codeScanner.ts`, `dependencyAnalyzer.ts`, `externalServiceDetector.ts`, `schemaExtractor.ts`, `architectureService.ts`
- RAG: `backend/src/ai/chatService.ts`, `ragService.ts`, `vectorStore.ts`, `chunker.ts`
- Routes: `backend/src/routes/projectRoutes.ts`

## Database Models
- `Project` — name, stack, status, githubUrl, embeddingStatus
- `ProjectStats` — file/api/dependency counts
- `APIEndpoint` — method, path, file, description
- `Dependency` — name, version, type
- `ExternalService` — detected external integrations
- `BackendInfo` — framework, routes, controllers
- `SchemaTable` — database tables and fields
- `ChatSession` / `ChatMessage` — RAG conversation history

## Current Status: IMPLEMENTED
- ✅ ZIP upload + GitHub URL support
- ✅ Framework/runtime detection
- ✅ API endpoint extraction
- ✅ Dependency analysis
- ✅ Architecture mapping
- ✅ Database schema extraction
- ✅ External service detection
- ✅ AI chat (with structured fallback when no LLM available)
- ⚠️ RAG requires ChromaDB running + OpenAI API key for embeddings
