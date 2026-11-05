# Game relay Worker

Per-game mailbox for the online (server-mediated) mode of the Jet Lag Hide and
Seek map. See [`docs/online-game.md`](../docs/online-game.md) for the design,
what the server holds, and deployment.

```bash
pnpm install --ignore-workspace   # own lockfile; not part of the app's install
pnpm dev                          # wrangler dev on :8787 (needs .dev.vars, see docs)
pnpm typecheck
pnpm e2e                          # drives the running dev server over WebSockets
pnpm deploy
```

The room logic is in `src/room.ts` and is tested from the repo root
(`pnpm test`, `tests/gameRoom.test.ts`); `src/index.ts` is a thin shell.
