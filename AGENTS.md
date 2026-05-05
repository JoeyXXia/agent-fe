# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

AI DevStudio is a two-package Node.js/TypeScript monorepo (no root workspace) with:
- `server/` — Express + SQLite (sql.js WASM) backend on port 3001
- `client/` — Vue 3 + Vite frontend on port 5173

Each package has its own `package.json` and `package-lock.json`; install and run them independently.

### Prerequisites

- **Node.js 20.x** (pinned in `server/.nvmrc`). Use nvm: `nvm use 20` or `nvm install 20`.

### Running services

- **Server**: `cd server && npm run dev` — starts tsx watch on port 3001. SQLite is embedded (sql.js WASM) so no external DB is needed.
- **Client**: `cd client && npm run dev` — starts Vite dev server on port 5173 with proxy to backend (`/api` → `localhost:3001`).
- The `.env` files are created from `.env.example`. The server runs without `AI_API_KEY` (falls back to mock AI mode). The client has `VITE_AGENT_USE_LLM=false` by default, so the Agent workbench uses local browser-side ReAct.

### Lint / Test / Build

There is no ESLint configuration. Standard commands per `package.json`:

| Action | Server (`cd server`) | Client (`cd client`) |
|--------|---------------------|---------------------|
| Test   | `npm run test`      | `npm run test`      |
| Build  | `npm run build`     | `npm run build`     |
| Dev    | `npm run dev`       | `npm run dev`       |

### Gotchas

- The Yjs import warning (`Yjs was already imported`) on server startup is benign and can be ignored.
- `server/data/` is the runtime SQLite data directory; it is created automatically on first run.
- The `@y/y@14.0.0-rc.7` package warns about requiring Node >= 22, but works fine on Node 20.
