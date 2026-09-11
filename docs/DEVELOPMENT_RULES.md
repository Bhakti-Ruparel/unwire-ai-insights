# Development Rules

## Feature Completion Definition

A feature is ONLY complete when:
- [ ] UI exists and is interactive
- [ ] API endpoint exists and returns correct data
- [ ] Backend service logic works
- [ ] Database operations succeed
- [ ] Agent/external integration works (where applicable)
- [ ] Errors are handled (show error state, not blank)
- [ ] Loading states exist
- [ ] Empty states exist
- [ ] Authorization is enforced
- [ ] TypeScript compiles without errors
- [ ] Documentation is updated

## UI Rule

Do NOT create a beautiful UI for functionality that does not exist on the backend.
If backend functionality is incomplete:
- Either implement it first
- Or clearly show the feature as "Coming Soon" / disabled

## Architecture Rules

1. **No duplicate systems.** Check existing code before creating new services.
2. **API calls go through `src/services/api.ts`** — never use raw `fetch()` in components.
3. **Agent communication goes through `agentClient.ts`** — never call agent directly.
4. **Validation uses Zod schemas** in `backend/src/schemas/index.ts`.
5. **All org-scoped routes must use `withOrgContext` middleware.**
6. **Command/software execution must use the registry pattern** — no arbitrary commands.

## Security Rules

Never expose in code, docs, or logs:
- JWT secrets
- Database passwords
- API keys (OpenRouter, Razorpay, etc.)
- Agent tokens
- Encryption keys
- Real user emails

Use placeholders: `<YOUR_SECRET>`, `process.env.SECRET_NAME`

## Testing Rules

Before declaring a fix:
1. Run `npx tsc --noEmit` in both frontend and backend
2. Run `get_diagnostics` on modified files
3. Verify the actual user-facing behavior if possible

## Git Rules

- Never commit `.env` files with real secrets
- Never commit `node_modules/`, `dist/`, `.prisma/`
- Commit meaningful messages: `fix: resolve agent heartbeat not updating status`

## Code Style

- TypeScript strict mode
- Controllers are thin — delegate to services
- Services contain business logic
- Prisma is only called from services, never controllers
- Frontend components under 300 lines (split into sub-components)
- Use existing CSS utilities (`glass`, `btn-primary-grad`) before creating new ones
