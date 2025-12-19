# AGENT.md

## 0) One-liner
Afterglow is a personal "memory palace" that turns a photo (and future AI context) into a saved 3D particle memory you can revisit.

---
## Non-negotiable Rules (read before any change)
- This file (AGENT.md) is the source of truth. Always read it before making code changes.
- Plan first: before editing, write a short plan listing 1) files to touch, 2) risks, 3) how you will verify (smoke tests).
- Do not invent scope: if unclear, state an Assumption and point to the file/path.
- Minimal change policy: no refactors/framework swaps unless explicitly required.
- Hard constraints: do not change DOM IDs or shader semantics unless you update all references and document the new contract here.

---
## 1) Product Vision vs Current Reality

### Vision (future)
1) User uploads a photo representing a moment.
2) User chats with AI about that moment (reflection / emotions / context).
3) System generates a short diary entry.
4) The moment is stored inside a private 3D memory palace the user can browse.
5) User can search/replay memories later.

Non-goals (near-term): no social feed, no accounts, local-first preferred, keep scope realistic.

### Repo reality (today)
- Vite + Three.js interactive particle memory viewer.
- User uploads an image; it becomes the particle texture.
- Archived memories persist locally via IndexedDB (thumb + render blobs with lazy hi-res load); hall navigation works across refresh.
- UI overlays include a black void background, top navbar, and a mic placeholder button. Inspect/rotate uses OrbitControls (rotate only, no pan/zoom).
- No AI chat/summarization yet.

---
## 2) Runbook
- Node: recommended >= 18 (Vite 5 baseline).
- Package manager: npm.
- Commands: `npm install`, `npm run dev`, `npm run build`, `npm run preview`.

---
## 3) Environment & Inputs
- Env vars: none; no `.env*` files in repo.
- Input: user uploads an image via `#fileInput` (index.html).
- Security/privacy: treat photos as sensitive; storage is local IndexedDB only.

---
## 4) Repo Map
- `index.html` — static shell, DOM IDs, loads `/src/main.js`; includes top navbar overlay and bottom mic placeholder UI (UI-only).
- `src/main.js` — boots the app by instantiating `App`.
- `src/app.js` — scene setup, render loop, UI bindings (upload, archive, hall navigation), persistence wiring, OrbitControls inspect.
- `src/dom.js` — DOM queries for controls.
- `src/material.js` — ShaderMaterial factory + clone helper for per-memory uniforms.
- `src/shaders.js` — vertex/fragment shaders for deformation/erosion/dispersion/grid overlay.
- `src/particles.js` — particle geometry generator.
- `src/storage/idb.js` — IndexedDB WebStorageProvider, schemaVersion 1.
- `package.json` / `package-lock.json` — scripts (`dev`, `build`, `preview`), deps (`three@0.128.0`, dev `vite@^5.0.0`).
- `README.md` — brief run/build notes.

---
## 5) Entry Points & Behavior
- `index.html` defines required elements/IDs: `#canvas-container`, `#fileInput`, `#archiveBtn`, `#enter-hall-btn`, `#back-btn`, `#prev-zone`, `#next-zone`, sliders, etc.
- Overlay UI includes a top navbar (brand/links/icons) and a bottom-center mic button plus voice overlay (`#af-voice-overlay`, `#af-voice-pill`, `#af-voice-bubble`, `#af-voice-sub`); overlays are UI-only and should not block canvas interactions beyond their bounds. CSS uses `--af-nav-offset` to offset top-aligned controls.
- `src/main.js` creates `App` and starts its loop.
- `App` (`src/app.js`):
  - Builds Three.js scene, editor particles, shader uniforms.
  - Upload applies processed render texture to the editor; settings sliders update uniforms/layout.
  - Archive clones the current state into `state.memories`, persists to IndexedDB (thumb + render blobs), and lays out gallery (newest-first).
  - Enter/exit hall toggles visibility; gallery navigation adjusts camera target and loads high-res render lazily for the current memory.
  - Inspect/rotate via OrbitControls on the canvas (mouse/touch drag), damping on; pan/zoom disabled. Wheel still adjusts `viewDistance` and syncs OrbitControls radius.

---
## 6) Smoke Tests (manual)
After any non-trivial change, run these:

1) Boot: `npm run dev` → page loads without fatal console errors.
2) Upload: choose JPG/PNG → particles update to the image; no crashes.
3) Controls: move sliders → visual response is immediate; no console spam.
4) Inspect drag: drag on canvas (mouse or one-finger touch) → camera orbits smoothly with damping; UI overlays remain clickable.
5) Archive + Hall: archive a memory, enter hall, navigate prev/next → archived items render and animate independently.
6) Refresh persistence: archive 3 memories, refresh → all 3 remain in hall/gallery; navigation works; no fatal errors.
7) Lazy hi-res: after entering hall, navigating to a memory upgrades its texture to the render blob without freezing UI.

---
## 7) Current Status / Known Issues
- Persistence: IndexedDB (DB `memory-particles`, version 1). Memories store metadata + blob keys; assets stored as blobs (thumb <=512px, render <=1536px). schemaVersion = 1.
- Restore flow: loads metadata, then thumb blobs for initial gallery; render blobs load lazily when a memory becomes active.
- Corrupted/missing assets are skipped with warnings; app continues.
- UI overlays: black background, top navbar, mic placeholder; inspect rotation via OrbitControls (rotate only, no pan/zoom).
- No automated tests or CI.

---
## 8) Data Model / Persistence
- DB name/version: `memory-particles` v1.
- Stores: `memories` (keyPath `id`, index `createdAt`), `assets` (keyPath `key`).
- Keys: memory `id` uses `crypto.randomUUID()` fallback; asset keys: `${id}:thumb`, `${id}:render`.
- Memory record: `{ id, createdAt, schemaVersion: 1, assets: { thumbKey, renderKey }, settingsSnapshot, dimensions }`.
- Assets: blobs stored separately with MIME; no base64/data URLs in JSON; never persist Three.js objects.

---
## 9) Backlog (prioritized, acceptance criteria)
- P0: Inspect UI polish. Acceptance: navbar/mic overlays remain functional; OrbitControls inspect works on mouse/touch with damping; background stays pure black; `npm run build` passes.
- P1: Native/mobile storage provider parity. Acceptance: implement native provider stub (Capacitor-ready) with same schemaVersion and blob separation; documented in AGENT/README; web still works.
- P2: Chat/summary stub. Acceptance: local chat UI attaches messages to current memory; stub summary string; no network by default; AGENT/README updated.

---
## 10) Do-not-touch (hard constraints)
- Do not change DOM IDs/selectors without updating all references (`index.html`, `src/dom.js`, `src/app.js`, AGENT.md).
- Do not change shader uniform semantics or material cloning without documenting and updating dependents.
- Do not swap frameworks/tooling (keep Vite + Three.js) unless explicitly requested.
- Keep persistence contract (IndexedDB schemaVersion 1, blob separation) unless updated here + in code.
- Keep OrbitControls inspect behavior rotate-only (no pan/zoom); if changed, document here and update UI expectations.

---
## 11) Assumptions
- Node >=18 needed for Vite 5 smoothness.
- Local-only storage is acceptable for now; no cloud sync.
- Images can be safely downscaled to 1536px render / 512px thumb without breaking UX.

---
## 12) Definition of Done (any change)
- [ ] Scope contained; no unrelated rewrites.
- [ ] `npm run dev` boots and smoke tests pass.
- [ ] No new fatal console errors.
- [ ] If behavior/commands/requirements changed: update AGENT.md (+ README if user-facing).
- [ ] If persistence/data shape changed: update the Data Model section.

---
## 13) Agent Contract
1) Read AGENT.md + README.md first.
2) Identify impacted files + risks; write a plan.
3) Implement in small, scoped commits.
4) Verify via smoke tests; list exact commands in PR notes.
5) Update docs when scripts/entry points/DOM IDs/data model change.
