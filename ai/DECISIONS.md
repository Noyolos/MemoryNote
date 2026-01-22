# Architectural Decision Records (ADR)

## ADR-001: Canonical Backend
- **Decision**: Use `memory-particles-v1/server/` as the only valid backend.
- **Status**: Active.
- **Context**: Root `server/` is legacy; do not use. If present, archive/remove it.

## ADR-002: Cloud Identity (UUID)
- **Decision**: Use UUIDv4 from Web Crypto (`crypto.randomUUID()` or `crypto.getRandomValues`) for all IDs (Memories & Assets).
- **Status**: Active.
- **Rationale**: Prevents ID collisions when eventually syncing local IndexedDB with a future Cloud DB. Auto-increment IDs are forbidden.

## ADR-003: Asset Migration Strategy
- **Decision**: Store Blobs locally in IndexedDB (Current) -> Upload to Cloud Storage (Future).
- **Status**: Planned.
- **Rationale**: We use a `key` based system (`${id}:render`) so we can easily swap the Blob content for a URL later without breaking the schema.
