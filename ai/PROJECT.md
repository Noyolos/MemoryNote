# Project: Afterglow (MemoryNote)

## 1. Overview
Afterglow is a local-first web app that turns photos into 3D particle memories.
- **Vision**: Upload Photo -> AI Chat -> Generate Diary -> 3D Memory Artifact.
- **Status**: Vite + Three.js prototype with Express backend.
- **Tech Stack**:
  - **Frontend**: Vite 5, Three.js (0.128.0), Vanilla JS (ES Modules).
  - **Backend**: Node.js (Express), Google GenAI SDK (@google/genai).
  - **Storage**: IndexedDB (Browser) + LocalStorage.
  - **Environment**: Node.js >= 20.0.0 (Strict).

## 2. How to Run
### Requirements
- Node.js >= 20.0.0

### Frontend
```bash
npm install
npm run dev
# Runs on http://localhost:5173
```
- Default API base: same-origin `/api/...` (Vite dev proxy -> `http://localhost:8787`).
- Optional override for device testing: set `VITE_API_BASE` (see `.env.example`).

### Backend (API)
Canonical Path: `memory-particles-v1/server/` (root `server/` is legacy; do not use).
```bash
# From repo root (memory-particles-v1/)
cd server
npm install
npm run start
# Runs on http://localhost:8787
```

## 3. Architecture
Entry Points:

Web: index.html -> src/main.js -> src/app.js.

API: server/index.js (Express).

Key Modules:

src/app.js: Main controller (Scene, UI, Data).

src/storage/idb.js: IndexedDB wrapper (Schema v1).

src/particles.js: Particle geometry generator.

src/shaders.js: Custom GLSL shaders.

## 4. Core Flows
Upload: Image -> Texture -> Particles -> AI Analysis.

Chat: Voice/Text -> /api/chat -> JSON reply (typing effect is client-side).

Save: Generate Diary -> Save memory + asset render Blob to IDB -> Enter Hall.

## 5. Smoke Tests
Boot: npm run dev (No console errors).

Upload: Select image, verify particles appear.

Chat: Send message, verify AI reply appears (JSON-backed; typing effect is client-side).

Save: Save memory, verify Diary Modal appears, then see item in Hall.
