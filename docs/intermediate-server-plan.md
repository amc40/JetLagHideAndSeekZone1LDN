# Plan: optional intermediate server ("game room") to replace copy-pasting JSON

_Drafted 2026-07-26. Design brainstorm only — nothing here is implemented yet. Line references are to `master` at the time of writing._

## 1. What happens today

Two separate sharing mechanisms exist, and both are manual.

**Whole hiding zone** (`src/lib/shareHidingZone.ts`, consumed in `OptionDrawers.tsx:115-226` and `MobileActionBar.tsx:86`):

- `hidingZone` (a computed atom in `src/lib/context.ts:171-202`: geometry + `questions` + `disabledStations` + `hidingRadius` + `zoneOptions` + `permanentOverlay`) is JSON-stringified, deflated, base64url'd into `?hzc=…`.
- Above 2000 chars — which a real zone with a drawn polygon comfortably exceeds — it falls back to Pastebin, which **requires each user to paste their own Pastebin API key into Options** and then loads back via `?pb=<id>`.

**Single question** (`src/components/cards/base.tsx:200-300` → `src/components/PasteQuestionButton.tsx`):

1. Seeker opens "Share question JSON", taps Copy to Clipboard, pastes the blob into WhatsApp.
2. Hider copies it out of WhatsApp, taps "Answer Question", which reads the clipboard, fetches GPS, runs `hiderifyQuestion()`, sets `data.drag = false` (locked/answered).
3. Hider opens the same dialog on the now-answered question, copies, sends it back.
4. Seeker taps "Input Question Answer"; `findMatchingQuestionIndex()` (`src/lib/questionIdentity.ts`) matches on the question's stable `key` (`schema.ts:205-220`) and updates in place.

So a single question is **four manual copy/paste hops and two app switches**, mid-game, on a phone, on a platform.

### Why it hurts specifically

- **iOS clipboard.** `PasteQuestionButton.tsx:115-132` carries a long comment about Safari's user-activation window: reading the clipboard after awaiting geolocation silently fails. The current code works around it by reading the clipboard _first_ — but that ordering is fragile and the failure mode is a confusing toast.
- **Pastebin API key.** A per-user credential requirement for what should be a "tap share" action.
- **The zone link is one-shot.** Loading `?hzc=`/`?pb=` replaces local state once (`loadHidingZone`, `OptionDrawers.tsx:171`); there is no ongoing channel, so every subsequent question restarts the manual dance.
- **PWA installs make links worse.** On iOS, a shared `?hzc=` link opens in Safari, not in the installed standalone PWA, which has its own `localStorage`. Deep links alone cannot fix this; a channel the _installed app_ polls can.

## 2. Constraints any solution must respect

1. **Deployment stays static.** GitHub Pages, `base: "JetLagHideAndSeekZone1LDN"` (`astro.config.mjs`). Any server is a _separate_ deployment; the app must build and run with no server configured.
2. **Offline-first is a feature, not an accident.** The PWA precaches curated POIs, the elevation grid and the ArcGIS WASM specifically so the app works with no network (`astro.config.mjs:70-100`). Sync must be strictly additive: degrade to today's clipboard flow when offline or unconfigured.
3. **No accounts.** A room code is the whole auth model.
4. **The hider's location must never leave the device.** `hiderMode` / `followMeLocation` are local. Only the _answer_ (already-derived radius/thermometer/etc. geometry) goes out — exactly what the clipboard carries today.
5. **Cheap and boring to operate.** This is a hobby fork; the server should cost ~£0 and need no babysitting.

## 3. Options considered

| Option                                                                                                                      | Fit                                                                                                                                                                   | Verdict                                           |
| --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| **A. Tiny relay ("rooms") on serverless** — Cloudflare Worker / Deno Deploy, room = append-only event log + latest snapshot | Purpose-built, ~200 lines, no SDK weight, self-hostable, endpoint configurable                                                                                        | **Recommended**                                   |
| B. Firebase RTDB / Supabase Realtime                                                                                        | Least server code, but adds a heavy SDK to the bundle, a vendor project with public API keys, and account/config surface                                              | Rejected — more config than the thing it replaces |
| C. WebRTC P2P + signalling (PeerJS)                                                                                         | Avoids storing data, but needs both devices awake and connected simultaneously; phones sleeping in pockets is the _normal_ case here; still needs a signalling server | Rejected as primary; possible later optimisation  |
| D. Public MQTT broker (HiveMQ etc.)                                                                                         | Zero infra, but unreliable, unauthenticated, and retention semantics are wrong for "catch up after 20 min underground"                                                | Rejected                                          |
| E. Keep Pastebin, automate it                                                                                               | Still an API key, still one-shot blobs                                                                                                                                | Rejected                                          |

The decisive argument for A: the game's real network conditions are _intermittent_. Someone is on the Victoria line with no signal for six minutes. A durable, replayable event log with a cursor handles that trivially; a live peer connection does not.

## 4. Recommended architecture

```
Seeker phone ──┐                         ┌── question/answer events ──┐
               ├─→  relay ("room" ABC123) ┤                            ├─→ Hider phone
Seeker phone ──┘      snapshot + log      └── zone snapshot ───────────┘
```

The relay is **dumb**: it stores opaque (optionally encrypted) blobs keyed by room code, assigns sequence numbers, and hands back everything after a client's cursor. All game semantics — validation, merging, hiderifying — stay in the client, where they already live.

### 4.1 Server API sketch

```
POST   /room                      → { code, token }          create; optional initial snapshot
GET    /room/:code                → { snapshot, seq }        bootstrap a joining device
PUT    /room/:code/snapshot       ← { blob }                 replace latest zone snapshot
POST   /room/:code/events         ← { blob } → { seq }       append one event
GET    /room/:code/events?since=N → { events: [{seq, blob}] } long-poll (hold ≤25s), else 204
```

- **Transport:** start with HTTP long-poll + `since` cursor. It survives sleeping phones, captive portals and corporate proxies, resumes with one integer, and needs no reconnect state machine. Upgrade to SSE or a WebSocket (Durable Object with hibernation) later if latency proves annoying — the client interface should be written to allow swapping transports.
- **Codes:** 6 chars from an unambiguous alphabet (no `0/O`, `1/I`), generated server-side, collision-checked.
- **Limits:** ≤64 KB per event, ≤1 MB per snapshot, ≤500 events per room, 48h TTL, per-IP rate limit. All rooms auto-expire — no delete endpoint, no GDPR surface.
- **CORS:** allow the Pages origin plus `*` for self-hosters (the code is the capability).
- **Hosting:** Cloudflare Worker + KV or a Durable Object per room is the natural fit; Deno Deploy and Val.town are equally viable. Verify current free-tier write limits at implementation time — KV's daily _write_ quota is the one that could bite, and is the reason to prefer a Durable Object if the free tier allows it. Server lives in this repo under `server/` with its own workflow, so self-hosting is copy-paste.

### 4.2 Event model

Two payload kinds, both reusing formats that already exist:

- `question` — one serialized `Question`, exactly what "Share question JSON" copies today (schema-validated on receipt via `questionSchema.parse`).
- `question-deleted` — `{ key, id }`.
- `snapshot` — the `hidingZone` object `shareHidingZone` already serializes, stored latest-only rather than in the log (it's the big one). Joining a room = fetch snapshot → feed it to the existing `loadHidingZone()`.

**Merge rules already exist** and are the right ones — they're currently buried in `PasteQuestionButton.tsx:163-185`:

- No match on `key` → append.
- Match, incoming is locked (`drag === false`, i.e. answered) → replace in place.
- Match, incoming is unlocked → ignore (stale/in-progress copy never clobbers what we have).

That's a serviceable last-writer-wins-with-precedence rule for this domain, and it makes duplicate delivery harmless — which means the relay only needs at-least-once delivery.

### 4.3 Client design

New `src/lib/sync/`:

- **`merge.ts`** — `applyIncomingQuestion(question)`, extracted verbatim from `PasteQuestionButton`. Both clipboard paste and sync then go through one code path. **This is worth doing on its own merit even if the server never ships.**
- **`transport.ts`** — `createRoom` / `joinRoom` / `pushEvent` / `subscribe`, with backoff, `navigator.onLine` awareness, and re-poll on `visibilitychange` (the "phone came out of the tunnel" trigger). An in-memory fake implementation makes the whole thing unit-testable and gives a `?syncTransport=memory` dev mode.
- **`outbox.ts`** — a persistent queue of un-acked outbound events, flushed on reconnect. Without this, answering a question in a basement loses the answer.
- **`redact.ts`** — an explicit **allowlist** serializer for anything leaving the device, plus a unit test asserting `hiderMode`, `followMeLocation`, `pastebinApiKey` and `thunderforestApiKey` can never appear in an outbound payload.

New atoms in `src/lib/context.ts`: `syncServerUrl` (persistent; default the hosted instance, editable for self-hosters), `syncRoomCode`, `syncEnabled`, `syncCursor` (persistent), `syncStatus` (`idle | connecting | live | offline | error`, in-memory).

### 4.4 UX

- **Options → "Play together"**: Create room (shows code + QR + share link) / Join room (6-char input) / Leave room. Handle a `?room=ABC123` param right next to the existing `hzc`/`pb` handling in `OptionDrawers.tsx:115`.
- **Status pill** near the offline indicator: `Room ABC123 · Live` / `Reconnecting…` / `Offline — 2 queued`.
- **Sending:** in the share dialog, "Send to room" sits _next to_ "Copy to Clipboard" (never replacing it). When the hider locks an answer, it pushes automatically.
- **Receiving, seeker side:** answers land silently and the map updates, with a toast.
- **Receiving, hider side — the important one:** an incoming question goes into an **inbox** with an "Answer" button; it does _not_ auto-answer. The hider must physically be somewhere when they answer, and — conveniently — running `hiderifyQuestion()` inside a tap handler keeps the geolocation call within iOS's user-activation window, sidestepping the entire class of bug documented in `PasteQuestionButton.tsx:115-132`.

### 4.5 Privacy

The room code is a bearer capability, so anyone with the link sees the room. For a public hosted instance that also means _the server operator_ can read game state. Cheap fix, worth doing in phase 2: derive an AES-GCM key from a secret in the URL **fragment** (`?room=ABC123#k=…`, fragments are never sent to the server), encrypt blobs with WebCrypto client-side. The relay then stores ciphertext and is untrusted by construction. Note this makes debugging harder, hence phase 2 rather than phase 1.

## 5. Phasing

**Phase 0 — no server at all (do this regardless).**
Extract `applyIncomingQuestion` + tests. Add a "Share as link" option to the question dialog producing `?q=<deflated>` using the existing `compress()` helper — a single question is small enough for a URL, so this alone collapses the four-hop dance to "tap link, tap Answer" for browser users. Caveat honestly documented: iOS PWA installs open links in Safari, so this helps browser users and not installed-PWA users — which is the motivation for the rest.

**Phase 1 — MVP relay.** Server (create/join/snapshot/append/long-poll), `sync/` client module, room create/join UI, status pill, explicit "Send to room", automatic receive, hider inbox. Clipboard path untouched throughout.

**Phase 2 — hardening.** Outbox flush, E2E encryption via URL fragment, QR code join, deletion propagation, presence ("hider connected").

**Phase 3 — nice to have.** Debounced automatic push of question edits (behind a toggle — accidental broadcast of a half-dragged marker is the risk), live snapshot sync, per-team channels so competing seeker teams don't see each other's questions.

## 6. Testing

- Vitest, alongside the existing `tests/` suite: merge precedence, cursor/dedupe/out-of-order delivery, outbox flush, redaction allowlist.
- The in-memory transport lets a test drive two simulated clients through a full ask→answer→apply round trip with no network.
- Manual two-browser check via Playwright before shipping; then a real game.

## 7. Open questions for the maintainer

1. **Who hosts?** A single instance you run for your group, or does every user paste a server URL? (Recommendation: ship a default instance you control, keep the field editable.)
2. **Should seekers see each other's questions?** Fine for one seeker team, a leak for competing teams — decides whether rooms need per-team channels in phase 1 or phase 3.
3. **Does the zone snapshot sync continuously, or only at room creation?** Continuous is nicer but means the hider's device receives the seekers' deduction map, which is arguably a spoiler.
4. **Retire the Pastebin path** once rooms exist, or keep it as a second fallback?
