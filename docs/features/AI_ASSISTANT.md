# AI DevOps Agent

## Purpose
Natural language interface to the entire infrastructure. Users ask questions, AI analyzes metrics/logs/deployments and provides actionable answers.

## User Flow
1. Open AI Assistant (sidebar) or ask on server detail page
2. Type: "Why is my server slow?" / "Show unhealthy servers" / "Analyze deployment failure"
3. AI classifies intent → plans tool execution → executes tools → synthesizes response
4. Response includes data from real metrics, logs, and infrastructure

## Architecture
```
User message → classifyIntent() → createPlan() → executePlan() → synthesizeResponse()
```

### Pipeline Components
- **Intent Classifier:** Pattern-based NLU — determines action vs info, category, entities
- **Planner:** Creates ExecutionPlan with tool steps based on intent
- **Tool Executor:** Registry of 12 tools, 30s timeout per tool
- **Verifier:** Synthesizes response from tool outputs + conversation history
- **Memory:** Sessions persisted in PostgreSQL (ChatSession model)

## Backend Implementation
- Orchestrator: `backend/src/ai/agent/agentOrchestrator.ts`
- Intent: `backend/src/ai/agent/intentClassifier.ts`
- Planner: `backend/src/ai/agent/agentPlanner.ts`
- Tools: `backend/src/ai/tools/` (12 tool files)
- Model router: `backend/src/ai/providers/modelRouter.ts`
- Server AI: `backend/src/servers/serverAI.ts`

## AI Tools (12)
- serverMetricsTool, logsSearchTool, projectContextTool
- deploymentHistoryTool, codebaseSearchTool, fileReaderTool
- gitTool, deploymentTool, infrastructureHealthTool
- incidentAnalysisTool, remediationTool, cloudInfrastructureTool

## Model Routing
| Intent Category | Model | Role |
|----------------|-------|------|
| server_metrics, log_analysis | DeepSeek R1 | Reasoner |
| codebase, git_operations | Qwen3 Coder | Coder |
| deployment, general | Llama 3.3 70B | General |

Fallback chain: Primary → Qwen3 → DeepSeek → Llama → HuggingFace → Graceful message

## API Endpoints
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/agent/chat` | Send message to AI agent |
| GET | `/api/agent/health` | AI system health |
| POST | `/api/servers/:id/ask` | Server-specific AI questions |

## Current Status: PARTIALLY IMPLEMENTED
- ✅ Full orchestrator pipeline
- ✅ 12 registered tools
- ✅ Multi-model routing with fallback
- ✅ Approval workflow for dangerous actions
- ✅ Session memory persistence
- ✅ Rate limiting (daily AI request limit per plan)
- ⚠️ Requires `OPENROUTER_API_KEY` environment variable
- ⚠️ Free-tier models have rate limits under load
- ⚠️ RAG (project chat) requires ChromaDB + OpenAI API key
