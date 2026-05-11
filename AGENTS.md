# AI DevStudio — Agent Development Guide

## Cursor Cloud specific instructions

### Overview

AI DevStudio is a full-stack Vue 3 + Express + TypeScript application with two modules:
- **DevNotes**: Note management with AI auto-summarization
- **FE-Agent**: ReAct-pattern code generation agent

### Required Services

| Service | Directory | Command | Port |
|---------|-----------|---------|------|
| Express Backend | `server/` | `npm run dev` | 3001 |
| Vite Frontend | `client/` | `npm run dev` | 5173 |

No external databases or services are required. SQLite runs in-process via sql.js (WASM). AI features gracefully fall back to mock mode when `AI_API_KEY` is not configured.

### Running Tests

- **Server tests**: `cd server && npm test` (Vitest)
- **Client tests**: `cd client && npm test` (Vitest with happy-dom)

### Building

- **Server**: `cd server && npm run build` (TypeScript → `dist/`)
- **Client**: `cd client && npm run build` (vue-tsc + Vite → `dist/`)

### Environment Setup

- Node.js 20.x is required (`server/package.json` engines field).
- Copy `.env.example` to `.env` in both `server/` and `client/` directories before starting.
- The server `.env` needs `JWT_SECRET` set (any random string works for dev).
- No lint tool (ESLint) is configured in this repo.

### Key Gotchas

- The Yjs duplicate-import warning in backend startup (`Yjs was already imported...`) is benign and does not affect functionality.
- The frontend Vite proxy routes `/api` and `/yjs` to `localhost:3001` — start the backend first.
- The `@y/y` dependency warns about requiring Node >= 22, but works fine with Node 20.x in practice.
- SQLite DB is created automatically at `server/data/devstudio.db` on first backend start.
- With `VITE_AGENT_USE_LLM=false` (default in client `.env.example`), the Agent Workbench uses browser-local ReAct mode without needing AI API keys.
