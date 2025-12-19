# AGENTS.md (Startup Guardrails)

Non-negotiable: read AGENT.md first, then propose a plan, then act. If you cannot comply, stop.

Proof step (must be first):
Before any action, you MUST:
- Quote the first 2 lines of this file (AGENTS.md) exactly.
- Provide a 5-bullet summary of AGENT.md.

Required workflow:
1) Provide proof (AGENTS.md 2-line quote + AGENT.md 5 bullets).
2) State which AGENT.md sections you will rely on (short list).
3) Propose a plan BEFORE editing any file:
   - files to touch (exact paths)
   - risks
   - acceptance criteria
   - verification steps (smoke tests / build)
4) Only after the plan is written, start making changes.
5) If you change scripts, entry points, DOM IDs, runtime requirements, or data flow, you MUST update AGENT.md in the same PR.
6) Docs-only changes: verification may be marked N/A, but you must write the reason explicitly.
