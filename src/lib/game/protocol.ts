/**
 * Wire protocol between the app and the game-relay Worker (see
 * `worker/` and `docs/online-game.md`).
 *
 * This file is imported by both the browser app and the Worker, so it must stay
 * free of imports and of any browser- or Cloudflare-specific types.
 *
 * The server is a mailbox, not the source of truth: `payload` is opaque to it
 * (today it is a question serialised exactly as the copy/paste flow does), so
 * adding a question type never needs a server deploy and falling back to paste
 * is always lossless.
 */

export const PROTOCOL_VERSION = 1;

export type GameRole = "hider" | "seeker";

/**
 * - `ask`         seeker -> everyone else: an unanswered question.
 * - `answer`      hider  -> everyone else: the settled (locked) answer.
 * - `zone-notice` hider  -> everyone else: "seekers are in my zone" (manual,
 *                 the hider-confirmed alert; also the fallback when
 *                 automatic detection isn't running).
 */
export type MessageKind = "ask" | "answer" | "zone-notice";

export const SENDABLE_KINDS: Record<GameRole, readonly MessageKind[]> = {
    seeker: ["ask"],
    hider: ["answer", "zone-notice"],
};

export const MAX_PAYLOAD_BYTES = 8 * 1024;
export const MAX_LOG_MESSAGES = 500;
/** How long a game lives before the server wipes everything. */
export const DEFAULT_GAME_TTL_MS = 12 * 60 * 60 * 1000;
/** The client heartbeat; a device heard from this recently counts as foreground. */
export const HEARTBEAT_INTERVAL_MS = 20_000;
export const FOREGROUND_WINDOW_MS = 45_000;

/** Subset of the browser's PushSubscriptionJSON that the server needs. */
export interface PushSubscriptionData {
    endpoint: string;
    keys: { p256dh: string; auth: string };
}

export type ClientMessage =
    | {
          t: "auth";
          v: number;
          role: GameRole;
          deviceId: string;
          /** Required for the hider role. The game code itself is the seeker credential. */
          hiderKey?: string;
          /** Highest seq this device has already processed; the server replays everything after it. */
          since: number;
      }
    | { t: "send"; id: string; kind: MessageKind; payload: string }
    | { t: "ping" }
    | { t: "push-subscribe"; subscription: PushSubscriptionData }
    | { t: "push-unsubscribe" }
    | { t: "push-test" }
    /** Hider only: wipe the game now. */
    | { t: "end" };

export type ErrorCode =
    | "bad-request"
    | "unauthorized"
    | "forbidden"
    | "no-such-game"
    | "game-ended"
    | "too-large"
    | "rate-limited"
    | "version"
    | "full";

export type ServerMessage =
    | {
          t: "ready";
          role: GameRole;
          /** Latest seq in the game; after replay the client is up to date through this. */
          head: number;
          expiresAt: number;
      }
    | {
          t: "msg";
          seq: number;
          id: string;
          kind: MessageKind;
          from: GameRole;
          at: number;
          payload: string;
      }
    | { t: "sent"; id: string; seq: number; duplicate: boolean }
    | { t: "pong"; now: number }
    | { t: "push-test"; sent: number; error?: string }
    | { t: "ended" }
    | { t: "error"; code: ErrorCode; message: string };

// --- Game codes -----------------------------------------------------------

/** Crockford base32: no I, L, O or U, so a code read aloud or retyped survives. */
export const GAME_CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const GAME_CODE_LENGTH = 10;

/**
 * Normalises what a person typed into a canonical code, or null if it can't be
 * one. Case, spaces and hyphens are ignored, and the usual look-alikes are
 * mapped the way Crockford base32 specifies (O -> 0, I/L -> 1).
 */
export const normalizeGameCode = (input: string): string | null => {
    const cleaned = input
        .toUpperCase()
        .replace(/[\s-]/g, "")
        .replace(/O/g, "0")
        .replace(/[IL]/g, "1");

    if (cleaned.length !== GAME_CODE_LENGTH) return null;
    for (const char of cleaned) {
        if (!GAME_CODE_ALPHABET.includes(char)) return null;
    }
    return cleaned;
};

/** `K7QXM2PD9T` -> `K7QXM-2PD9T`, for display. */
export const formatGameCode = (code: string): string =>
    `${code.slice(0, GAME_CODE_LENGTH / 2)}-${code.slice(GAME_CODE_LENGTH / 2)}`;

// --- Validation helpers shared by both ends -------------------------------

export const DEVICE_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
export const MESSAGE_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
