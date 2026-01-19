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
### Frontend
```bash
npm install
npm run dev
# Runs on http://localhost:5173
Backend (API)
Canonical Path: memory-particles-v1/server/ (Ignore root server)

Bash

cd server
npm install
npm run start
# Runs on http://localhost:8787
3. Architecture
Entry Points:

Web: index.html -> src/main.js -> src/app.js.

API: server/index.js (Express).

Key Modules:

src/app.js: Main controller (Scene, UI, Data).

src/storage/idb.js: IndexedDB wrapper (Schema v1).

src/particles.js: Particle geometry generator.

src/shaders.js: Custom GLSL shaders.

4. Core Flows
Upload: Image -> Texture -> Particles -> AI Analysis.

Chat: Voice/Text -> /api/chat -> Stream Reply.

Save: Generate Diary -> Save Blob to IDB -> Enter Hall.

5. Smoke Tests
Boot: npm run dev (No console errors).

Upload: Select image, verify particles appear.

Chat: Send message, verify AI reply stream.

Save: Save memory, verify Diary Modal appears, then see item in Hall.
