# Contracts & Invariants (Do Not Break)

## 1. API Contracts (Port 8787)
- **POST `/api/analyze-image`**: Returns `{ vibe, caption, questions }`.
- **POST `/api/chat`**: Returns `{ text }`.
- **POST `/api/generate-diary`**: Returns `{ title, mood, diary, tags }`.

## 2. Storage Contracts (IndexedDB)
- **DB Name**: `memory-particles` (Version 1).
- **Stores**:
  - `memories` (Key: UUID `id`).
  - `assets` (Key: String `key`).
- **Invariant**: Assets must be stored as **Blobs**, not Base64 strings.

## 3. DOM & UI Invariants
- **Do not rename these IDs** (used by `src/dom.js`):
  - `#canvas-container`, `#fileInput`
  - `#af-hud`, `#af-chat-stream`
  - `#af-diary-modal`, `#enter-hall-btn`

## 4. Shader Uniforms
- **Vertex**: `uTime`, `uSize`, `uWaveAmplitude`.
- **Fragment**: `uTexture`, `uGridOpacity`.
