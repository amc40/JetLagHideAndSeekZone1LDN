import { persistentAtom } from "@nanostores/persistent";
import { atom } from "nanostores";

import type { ConnectionStatus } from "@/lib/game/connection";
import type { GameRole, MessageKind } from "@/lib/game/protocol";
import type { Question } from "@/maps/schema";

/**
 * State for the online (server-mediated) game. Deliberately all separate from
 * `questions` in `@/lib/context`: that list stays the source of truth and keeps
 * the exact shape the copy/paste flow uses, so switching the server off at any
 * moment loses nothing.
 */

const json = <T>(fallback: T) => ({
    encode: JSON.stringify,
    // Corrupt storage must never take the app down.
    decode: (stored: string): T => {
        try {
            return JSON.parse(stored) as T;
        } catch {
            return fallback;
        }
    },
});

export interface GameSession {
    /** http(s) base URL of the relay, without a trailing slash. */
    serverUrl: string;
    /** Canonical game code. For seekers this is the credential. */
    code: string;
    role: GameRole;
    /** Hider devices only. */
    hiderKey?: string;
    /** Highest server seq already processed; sent on reconnect for catch-up. */
    lastSeq: number;
    expiresAt?: number;
}

export const gameSession = persistentAtom<GameSession | null>(
    "gameSession",
    null,
    json<GameSession | null>(null),
);

/**
 * The kill switch. Off means no connection at all and the app behaves exactly
 * like the copy/paste-only version; the session is kept so it can be switched
 * back on.
 */
export const onlineEnabled = persistentAtom<boolean>(
    "gameOnlineEnabled",
    true,
    json(true),
);

export const DEFAULT_SERVER_URL: string =
    (import.meta.env?.PUBLIC_GAME_SERVER_URL as string | undefined) ?? "";

export const gameServerUrl = persistentAtom<string>(
    "gameServerUrl",
    DEFAULT_SERVER_URL,
    { encode: (value) => value, decode: (value) => value },
);

/** Shared secret that gates *creating* games on the relay (joining never needs it). */
export const createPassphrase = persistentAtom<string>(
    "gameCreatePassphrase",
    "",
    {
        encode: (value) => value,
        decode: (value) => value,
    },
);

/** Stable per-browser-profile id; lets the server skip echoing a device's own messages. */
export const gameDeviceId = persistentAtom<string>("gameDeviceId", "", {
    encode: (value) => value,
    decode: (value) => value,
});

export const ensureDeviceId = (): string => {
    let id = gameDeviceId.get();
    if (!id) {
        id = (
            globalThis.crypto?.randomUUID?.() ?? `${Date.now()}${Math.random()}`
        )
            .replace(/[^A-Za-z0-9]/g, "")
            .slice(0, 32)
            .padEnd(8, "0");
        gameDeviceId.set(id);
    }
    return id;
};

export type QuestionSyncState = "asked" | "answered";

/**
 * Where each question is in its life: absent = a local draft the other side
 * knows nothing about, `asked` = in play awaiting an answer, `answered` =
 * settled. Kept outside the question so its JSON is unchanged for paste.
 */
export const questionSync = persistentAtom<Record<string, QuestionSyncState>>(
    "gameQuestionSync",
    {},
    json<Record<string, QuestionSyncState>>({}),
);

export const syncKey = (question: Pick<Question, "id" | "key">): string =>
    `${question.id}:${question.key}`;

export interface OutboxEntry {
    /** Idempotency key: the server delivers each id at most once. */
    id: string;
    kind: MessageKind;
    payload: string;
    queuedAt: number;
}

/** Messages composed locally but not yet acknowledged by the server. */
export const outbox = persistentAtom<OutboxEntry[]>(
    "gameOutbox",
    [],
    json<OutboxEntry[]>([]),
);

export interface UnreadableMessage {
    seq: number;
    kind: MessageKind;
    from: GameRole;
    at: number;
    payload: string;
}

/**
 * Messages that arrived but that this app version could not parse (e.g. a
 * question type added since it was installed). Kept so nothing is lost: the
 * payload is the same JSON the paste flow uses, so it can be copied out.
 */
export const unreadableMessages = persistentAtom<UnreadableMessage[]>(
    "gameUnreadable",
    [],
    json<UnreadableMessage[]>([]),
);

export const connectionStatus = atom<{
    status: ConnectionStatus;
    detail?: string;
}>({ status: "idle" });

/** When the hider last told the seekers they are in the zone (ms), or null. */
export const zoneNoticeAt = atom<number | null>(null);

/** The most recent answer to "send me a test push", for the readiness check. */
export const pushTestResult = atom<{
    sent: number;
    error?: string;
    at: number;
} | null>(null);

/** Opens the Online game drawer (from the Questions panel or the mobile More menu). */
export const onlineGameDrawerOpen = atom<boolean>(false);

/**
 * Hold a screen wake lock while a game is open. Phones can't track location or
 * keep sockets alive with the screen off, so this is how a seeker keeps the
 * app working through the final approach (at some battery cost).
 */
export const keepScreenOn = persistentAtom<boolean>(
    "gameKeepScreenOn",
    false,
    json(false),
);
