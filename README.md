# memory-particles-v1

Refactor of your single-file prototype into a small Vite + ES Modules project (same UI/IDs, same effect).

## Run (web)
```bash
npm install
npm run dev
```

## Run (api)
```bash
cd server
npm install
npm run start
```

Server runs on `http://localhost:8787` and reads `GEMINI_API_KEY` or `GOOGLE_API_KEY` from `server/.env` (see `server/.env.example`).

## Build
```bash
npm run build
npm run preview
```

## Next: ship to iOS/Android
Use Capacitor (recommended) so you keep ONE codebase:
```bash
npm install @capacitor/core @capacitor/cli
npx cap init "MemoryParticles" "com.yourname.memoryparticles" --web-dir=dist
npm install @capacitor/android @capacitor/ios
npx cap add android
npx cap add ios
npm run build
npx cap sync
npx cap open android
npx cap open ios
```
"# MemoryNote" 
