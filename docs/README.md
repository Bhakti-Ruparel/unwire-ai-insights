# Unwire AI Documentation

## Quick Navigation

| Document | Purpose |
|----------|---------|
| [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md) | **Start here.** Full project overview, architecture, tech stack |
| [AI_CONTEXT.md](./AI_CONTEXT.md) | Rules for AI agents working on this codebase |
| [CURRENT_STATE.md](./CURRENT_STATE.md) | Feature status matrix, known issues, next priorities |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System diagrams, data flows, component relationships |
| [DEVELOPMENT_RULES.md](./DEVELOPMENT_RULES.md) | Coding standards, security rules, completion criteria |
| [CHANGELOG.md](./CHANGELOG.md) | What changed and when |

## For AI Coding Agents

**Read these files IN ORDER before making any changes:**

1. `docs/PROJECT_CONTEXT.md` — Understand what this project is
2. `docs/CURRENT_STATE.md` — Know what works and what doesn't
3. `docs/AI_CONTEXT.md` — Follow the rules
4. Relevant source files — Verify before changing

## Key Principle

> Every UI element must have a complete backend execution path.
> A visually complete interface is NOT a completed feature.
> Verify the full chain: Frontend → API → Service → Database/Agent → Response → UI Update.
