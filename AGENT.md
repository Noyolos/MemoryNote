# AI Agent Guidelines

##  Source of Truth
**ALL** project knowledge lives in the `ai/` directory.
1. `ai/PROJECT.md` - Context, architecture, and run instructions.
2. `ai/CONTRACTS.md` - Hard rules, API shapes, and strict constraints.
3. `ai/DECISIONS.md` - Architectural decisions (Cloud/UUID strategy).

## Guardrails
- Backend: use `memory-particles-v1/server/` only; root `server/` is legacy.
- Node.js >= 20.0.0 required.

## ⚡ Workflow
1. **Plan**: Read `ai/CONTRACTS.md` first.
2. **Act**: Make minimal changes.
3. **Verify**: Run Smoke Tests in `ai/PROJECT.md`.
