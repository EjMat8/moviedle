# Moviedle

Wordle, but for movies. Runs as a Discord Activity (embedded web app).

## Layout

```
moviedle/
├── activity/      # Vite + React + TS + Tailwind frontend
│   ├── src/
│   └── package.json
├── convex/        # Convex backend (schema, queries, mutations, actions)
│   └── schema.ts
├── package.json   # Workspace root + shared dev scripts
└── SETUP.md       # First-time setup walkthrough
```

## Quick start

See [SETUP.md](./SETUP.md). TL;DR:

```bash
npm install
# ... follow SETUP.md to register Discord app, configure env, start cloudflared
npm run dev
```

## Status

- ☑ Phase 0 — scaffold + Discord SDK + Convex hello-world
- ☐ Phase 1 — hint generation pipeline (pause for hint quality review)
- ☐ Phase 2 — daily cron + game loop server-side
- ☐ Phase 3 — Activity UI
- ☐ Phase 4 — polish
