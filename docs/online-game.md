# Online game (server-mediated play)

An optional way to play that replaces copy/paste with a small relay server.
Everything in the original Share / Paste flow still works and is the fallback.

> **Status: phase 1.** Questions, answers, notifications, the install/readiness
> check and the kill switch are built. **Not built yet:** automatic zone-entry
> detection and live location sharing (phase 2, designed below). Nothing here
> has been run on a real iPhone or Android phone yet; see
> [What has and hasn't been verified](#what-has-and-hasnt-been-verified).

## The idea in one paragraph

The server is a **mailbox, not the database**. Each device's `questions` list
(`src/lib/context.ts`) stays the source of truth, in exactly the JSON the paste
flow uses. Every action commits locally first and is then queued for the
server; every received message goes through the same `mergeIncomingQuestion()`
the paste button uses. So the server never holds anything a device lacks, and
switching it off mid-game loses nothing.

## How the original requirements are met

| #   | Requirement                                 | How                                                                                                                                                                                                                                                                       |
| --- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | No location history                         | No tracks are ever stored (no live location in phase 1). The server keeps the question log until the game ends or its 12h TTL, then wipes it. Request logging is off (`observability` disabled in `wrangler.jsonc`). See [What the server holds](#what-the-server-holds). |
| 2   | Pick a server game up on copy/paste         | Local-first (above). The wire payload is the paste JSON, and sync state lives in a separate store, so question JSON is unchanged. Verified in a browser: server killed mid-game, answer moved by Share and Paste, updated in place with no duplicate.                     |
| 3   | Explore questions without telling the hider | A question is a local draft until the seeker taps **Ask the hider** (with a confirm).                                                                                                                                                                                     |
| 4   | Hider notified of a question                | In-app toast while the app is open; Web Push when it isn't.                                                                                                                                                                                                               |
| 5   | Seekers notified of an answer               | Same. (Read as "answer"; the envelope is symmetric if hiders ever need to initiate.)                                                                                                                                                                                      |
| 6   | Pay only during games                       | Cloudflare Worker + SQLite Durable Object with WebSocket hibernation: idle games cost nothing and the free plan has hard caps rather than surprise bills (check current limits).                                                                                          |
| 7   | Automatic zone-entry alert                  | **Phase 2.** Phase 1 has the hider's manual "Tell the seekers they're in my zone" button, which is also the permanent fallback.                                                                                                                                           |
| 8   | Seekers can't learn the zone from traffic   | The hider's station/zone is **never sent to the server in phase 1**. Phase 2 keeps it server-side only and never returns it.                                                                                                                                              |
| 9   | Optional live location sharing              | **Phase 2.**                                                                                                                                                                                                                                                              |

## Architecture

```
 seeker phone ──┐                              ┌── hider phone
 (questions     │  WebSocket   ┌────────────┐  │   (questions
  in localStorage)├───────────▶│ Worker     │◀─┤    in localStorage)
                │              │  └ Durable │  │
 teammate ──────┘              │    Object  │  └── Web Push (locked/pocketed)
                               │  per game  │
                               └────────────┘
```

- `src/lib/game/protocol.ts` — wire types shared by app and Worker (no imports).
- `worker/src/room.ts` — **all the rules**, independent of Cloudflare, so it is
  unit-tested without a runtime. Auth by role, sequencing, de-duplication,
  catch-up, bounded log, expiry.
- `worker/src/index.ts` — thin Durable Object shell: sockets, alarm, push.
- `worker/src/webpush.ts` — RFC 8291 encryption + RFC 8292 VAPID on WebCrypto.
- `src/lib/game/connection.ts` — one resilient WebSocket (backoff, heartbeat,
  zombie-socket detection, resume on foreground).
- `src/lib/game/sync.ts` — outbox, incoming handling, actions.
- `src/lib/game/store.ts` — state. `questions` is **not** here by design.
- `src/components/Online*.tsx` — drawer, controller, per-question actions.

### Roles and credentials

The **game code** (10 chars, Crockford base32, ~50 bits) is the seeker's
credential and the Durable Object's name. The **hider key** (128 bits) is
shown once to the creator and stored only as a hash on the server. The server
decides what each role may send (`SENDABLE_KINDS`); a client claiming a role in
the UI gains nothing. A second hider device (or recovery after losing browser
data) joins with the code **and** the hider key.

### Delivery semantics

At-least-once from the client, exactly-once effect: each message has a client
id; the server stores `id → seq` and acknowledges duplicates without
re-broadcasting. Messages get a server sequence number; a reconnecting device
sends the highest `seq` it processed and gets everything after it replayed
(never its own messages). A single serial queue in the room core guarantees
seq order equals delivery order.

## What the server holds

Per game, until the game ends, the hider ends it, or 12 hours pass (an alarm
deletes everything):

- the question log (**question payloads contain seeker coordinates** — a
  question's position is usually the seeker's GPS at that moment), capped at 500;
- a hash of the hider key and the expiry time;
- each device's push subscription (an opaque endpoint, no location).

It never holds: live location, location tracks, the hider's station or radius
(phase 1), or any request logs.

Push payloads are content-free (`{k: "ask", s: 12}`); the lock screen says that
something happened, and the app fetches what.

## Platform behaviour you must plan around

- **iOS web push only works for apps installed to the Home Screen** (16.4+). In
  a Safari tab `PushManager` doesn't exist; the readiness check says so.
- **Install before the game.** An installed iOS app has its own storage,
  separate from Safari: questions saved in a Safari tab are not visible in it.
- **Links don't open in the installed app on iOS**, so joining is by typing the
  code, not by a link.
- **No background location or live sockets** on either platform. Seekers must
  keep the app open; the drawer offers a screen wake lock (battery cost).
- iOS requires every push to show a notification; the service worker always does.
- Users can grant _approximate_ location; the readiness check warns when
  accuracy is poor.

## Falling back to copy/paste mid-game

Nothing to migrate. Turn off **Online game → Use the game server**, or just
carry on if the server is down. Use **Share question JSON** and the paste
button as before. An answer pasted by hand marks the question answered; a
queued online message that is later delivered is idempotent. If an app version
can't read a message, it is kept under "Messages this version couldn't read"
with a Copy button.

## Phase 2 (designed, not built)

**Zone-entry alert: Gate variant.** Because the hider must stop moving once the
seekers enter the zone, the hider is the authority:

1. The hider uploads station + radius once; stored server-side only, never sent
   to anyone, wiped with the game.
2. Seekers stream fixes (with `coords.accuracy`) while the app is open. The
   server evaluates them **in memory**, accuracy-aware, requiring consecutive
   good fixes. It writes nothing and returns nothing to the seeker.
3. A detected entry notifies **only the hider**, who confirms; confirmation
   notifies the seekers. The hider's manual button (already built) sends the
   same message, so detection is an assist, not a dependency.
4. Detection and confirmation **timestamps** (not locations) are kept and shown
   to both players after the game, which deters a hider who sits on the prompt.
   An optional auto-confirm timeout can be added as a game setting.

Why this shape: seekers learn nothing from their own fixes, so spoofed fixes or
walking the boundary don't reveal the zone (an automatic alert would be a
boundary oracle). Hashing or obscuring the zone for the client does **not**
work: Zone 1 has only a few thousand ~100 m cells, so it is brute-forceable.

**Live location** is an opt-in stream relayed to the hider and never stored.

## Deploying

Prerequisites: a Cloudflare account.

```bash
cd worker
pnpm install --ignore-workspace      # the Worker has its own lockfile
pnpm generate:vapid                  # prints a public/private key pair
pnpm exec wrangler login
echo '<public key>'  | pnpm exec wrangler secret put VAPID_PUBLIC_KEY
echo '<private key>' | pnpm exec wrangler secret put VAPID_PRIVATE_KEY
# optional: stop strangers creating games on your server (joining never needs it)
pnpm exec wrangler secret put CREATE_PASSPHRASE
pnpm deploy
```

Then in the app: **Questions → Online → Game server**, enter the Worker URL
(and the passphrase, if you set one). To bake the URL in at build time instead,
set `PUBLIC_GAME_SERVER_URL` for the Pages build (the deploy workflow does not
set it today). Edit `ALLOWED_ORIGINS` in `worker/wrangler.jsonc` if you serve
the app from somewhere other than `amc40.github.io`.

Changing the VAPID key later means everyone must re-enable notifications.

### Local development

```bash
cd worker && pnpm generate:vapid   # copy the two lines into worker/.dev.vars (git-ignored)
cd worker && pnpm dev              # http://127.0.0.1:8787
PUBLIC_GAME_SERVER_URL=http://127.0.0.1:8787 pnpm dev   # the app, in another terminal
cd worker && pnpm e2e              # drives the real Worker over WebSockets (E2E_HIBERNATE=1 adds an idle step)
```

## What has and hasn't been verified

Verified:

- Room rules: 42 unit tests, mutation-checked (dedupe, roles, replay, ordering,
  expiry, push allowlist).
- Connection and sync layers: unit tests with fakes, mutation-checked.
- **Web Push crypto against the `web-push` reference library**: payloads
  decrypt with `http_ece`; VAPID JWTs verify; corrupting the key derivation,
  padding, auth secret or signature input is caught.
- Real runtime: `worker/scripts/e2e.mjs` (15 steps) against `wrangler dev`.
- Two real browser profiles (desktop hider, phone-sized seeker) against the real
  app and Worker: ask, answer, paste-compatible storage, kill switch, queue
  during a server outage and delivery after, late joiner catch-up, end-of-game
  wipe, and the finish-on-copy/paste fallback.

**Not** verified, and worth doing before relying on it in a real game:

- Any real iPhone or Android device: Home Screen install, push delivery through
  Apple/Google, wake lock, location prompts, links vs the installed app.
- Push against live push services (only the cryptography is checked).
- That the Durable Object actually hibernates and is evicted in production (the
  idle e2e step passes but local logs don't show an eviction).
- A deployed Worker (all testing was on `wrangler dev`).

## Known limitations

- A seeker who edits an asked question locally diverges until the answer
  arrives, which replaces it with the asked version.
- An asked-but-unanswered question still affects the seeker's map with its
  default answer (as an unanswered pasted question always has); planning mode
  hides unlocked questions.
- Asks can't be retracted.
- The manifest's icon `src` paths (`/JLIcon.png` etc.) are root-absolute, which
  look wrong under the `/JetLagHideAndSeekZone1LDN/` base and may stop Android
  offering "Install app". Pre-existing; worth checking.
- No end-to-end encryption: the relay can read question payloads (it is yours).
