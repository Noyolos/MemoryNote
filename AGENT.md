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
- Saved memories persist locally via IndexedDB (thumb + render blobs with lazy hi-res load); hall navigation works across refresh.
- UI overlays include a black void background, top navbar, Home HUD (agent pill + voice controls + live reply), and INFO panel. Inspect/rotate uses OrbitControls (rotate only, no pan/zoom).
- No AI chat/summarization yet.

---
## 2) Runbook
- Node: recommended >= 18 (Vite 5 baseline).
- Package manager: npm.
- Commands: `npm install`, `npm run dev`, `npm run build`, `npm run preview`.
- Backend: `cd server`, `npm install`, `npm run start` (Express on 8787).

---
## 3) Environment & Inputs
- Env vars: server reads `GEMINI_API_KEY` or `GOOGLE_API_KEY` from `server/.env` (see `server/.env.example`).
- Input: user uploads an image via `#fileInput` (index.html).
- Security/privacy: treat photos as sensitive; storage is local IndexedDB only.

---
## 4) Repo Map
- `index.html` — static shell, DOM IDs, loads `/src/main.js`; includes top navbar overlay, Home HUD (agent pill + voice controls + live reply), and INFO panel.
- `src/main.js` — boots the app by instantiating `App`.
- `src/app.js` — scene setup, render loop, UI bindings (upload, save, hall navigation), persistence wiring, OrbitControls inspect.
- `src/dom.js` — DOM queries for controls.
- `src/material.js` — ShaderMaterial factory + clone helper for per-memory uniforms.
- `src/shaders.js` — vertex/fragment shaders for deformation/erosion/dispersion/grid overlay.
- `src/particles.js` — particle geometry generator.
- `src/storage/idb.js` — IndexedDB WebStorageProvider, schemaVersion 1.
- `package.json` / `package-lock.json` — scripts (`dev`, `build`, `preview`), deps (`three@0.128.0`, dev `vite@^5.0.0`).
- `server/index.js` — Express API server (port 8787) for analyze/chat/diary.
- `server/package.json` — backend deps/scripts.
- `server/.env.example` — env template for Gemini API key.
- `README.md` — brief run/build notes.

---
## 5) Entry Points & Behavior
- `index.html` defines required elements/IDs: `#canvas-container`, `#fileInput`, `#enter-hall-btn`, `#back-btn`, `#prev-zone`, `#next-zone`, sliders, etc.
- Overlay UI includes a top navbar (brand/links/icons), Home-only HUD (`#af-hud`, `#af-agent-pill`, `#af-home-voice`, `#af-home-prompt`, `#af-live-reply`, `#af-mic-btn`, `#af-voice-timer`, `#af-save-memory`, `#af-close-voice`), INFO panel (`#af-info-panel`, `#af-info-close`, `#af-info-memno`, `#af-info-empty`, `#af-info-diary`), landing gate (`#af-landing`, `#af-landing-upload`), and save blocker (`#af-save-blocker`, `#af-blocker-text`). All app UI is wrapped in `#af-app-shell`. INFO opens via `[data-action="open-info"]`. Page visibility is controlled by body classes (`mode-landing`, `mode-home`, `mode-gallery`): landing hides the app shell, home/gallery show it. `body.is-blocked` disables all app-shell pointer events while the blocker is visible. `#af-hud` keeps `pointer-events:none` while interactive elements use `pointer-events:auto`. CSS uses `--af-nav-offset` to offset top-aligned controls.
- INFO panel content is memory-specific: it reads `diaryCard`/`transcript` from the selected memory (`state.memories[galleryIndex].id`), while the "MEM 01" label is display-only (`index + 1`).
- Render mode toggle IDs: `#af-render-toggle`, `#af-render-kolam`, `#af-render-halo`, `#af-render-layered`. LocalStorage key `afterglow_render_mode` stores the current mode (`kolam`/`halo`/`layered`).
- Hall ring tuning sliders (TEMP): `#af-ring-radius`, `#af-ring-depth`, `#af-ring-angle`, `#af-hall-fov` in the settings panel; localStorage keys `afterglow_ring_radius`, `afterglow_ring_depth`, `afterglow_ring_angle`, `afterglow_hall_fov`.
- Landing gate localStorage key: `afterglow_has_uploaded_once` (first upload unlocks home if no memories exist).
- Render mode switching updates existing shader uniforms via `App.materialRegistry`; no material or texture allocations on toggle.
- `src/main.js` creates `App` and starts its loop.
- `App` (`src/app.js`):
  - Builds Three.js scene, editor particles, shader uniforms.
  - Upload applies processed render texture to the editor and calls `/api/analyze-image` (multipart `image`) for caption/questions; Home shows the opening line in `#af-live-reply` and questions in `#af-home-prompt` (falls back to mock analysis on failure).
  - Chat sends `contents[]` to `/api/chat` and streams the reply into `#af-live-reply` (falls back to mock reply on failure).
  - Save Memory calls `/api/generate-diary` with `transcriptText`/`dateISO`, maps to `diaryCard`, then persists a single memory record (thumb + render blobs + transcript + diaryCard) and lays out gallery (newest-first).
  - Enter/exit hall toggles visibility; Hall uses a 5-item ring carousel (center ±2) with arc layout/scale/rotation and wrap-around nav; only those 5 are visible; high-res render loads lazily for the selected memory. Hall memory opacity is driven per-offset for a translucent "ghost film" look.
  - Inspect/rotate via OrbitControls on the canvas (mouse/touch drag), damping on; pan/zoom disabled. Wheel still adjusts `viewDistance` and syncs OrbitControls radius.

---
## 6) Smoke Tests (manual)
After any non-trivial change, run these:

1) Boot: `npm run dev` → page loads without fatal console errors.
2) Upload: choose JPG/PNG → particles update to the image; no crashes.
3) Controls: move sliders → visual response is immediate; no console spam.
4) Inspect drag: drag on canvas (mouse or one-finger touch) → camera orbits smoothly with damping; UI overlays remain clickable.
5) Save Memory + Hall: save a memory, enter hall, navigate prev/next → saved items render and animate independently.
6) Refresh persistence: save 3 memories, refresh → all 3 remain in hall/gallery; navigation works; no fatal errors.
7) Lazy hi-res: after entering hall, navigating to a memory upgrades its texture to the render blob without freezing UI.

---
## 7) Current Status / Known Issues
- Persistence: IndexedDB (DB `memory-particles`, version 1). Memories store metadata + blob keys; assets stored as blobs (thumb <=512px, render <=1536px). schemaVersion = 1.
- Restore flow: loads metadata, then thumb blobs for initial gallery; render blobs load lazily when a memory becomes active.
- Corrupted/missing assets are skipped with warnings; app continues.
- UI overlays: black background, top navbar, Home HUD (agent pill + voice controls + live reply), INFO panel; inspect rotation via OrbitControls (rotate only, no pan/zoom).
- No automated tests or CI.

---
## 8) Data Model / Persistence
- DB name/version: `memory-particles` v1.
- Stores: `memories` (keyPath `id`, index `createdAt`), `assets` (keyPath `key`).
- Keys: memory `id` uses `crypto.randomUUID()` fallback; asset keys: `${id}:thumb`, `${id}:render`.
- Memory record: `{ id, createdAt, schemaVersion: 1, assets: { thumbKey, renderKey }, settingsSnapshot, dimensions, diaryCard, transcript }`.
- Diary card: `{ title, summary, mood, tags, dateISO }` stored per memory (keyed by memory id, not UI index).
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
- Render mode toggles must not allocate new materials or textures; only update uniforms on existing materials via `App.materialRegistry`.
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
