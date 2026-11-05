/**
 * The game-room logic, deliberately independent of Cloudflare.
 *
 * The Durable Object in `index.ts` is a thin shell: it owns the sockets and
 * persists each socket's `Session`, and calls `GameRoomCore.handle()` for every
 * incoming frame. The core owns the rules (who may send what, sequencing,
 * de-duplication, catch-up, expiry) and returns the effects to perform, so it
 * can be tested with an in-memory storage and no runtime.
 *
 * Privacy: what is stored is the question log (needed so a device that was
 * offline can catch up), each device's push subscription, and a hash of the
 * hider's key. Everything is wiped when the game ends or expires. Live
 * positions never reach this code in phase 1.
 */
import {
    DEFAULT_GAME_TTL_MS,
    DEVICE_ID_PATTERN,
    type ClientMessage,
    type ErrorCode,
    type GameRole,
    MAX_LOG_MESSAGES,
    MAX_PAYLOAD_BYTES,
    MESSAGE_ID_PATTERN,
    type MessageKind,
    PROTOCOL_VERSION,
    type PushSubscriptionData,
    SENDABLE_KINDS,
    type ServerMessage,
} from "../../src/lib/game/protocol";

export interface RoomStorage {
    get<T>(key: string): Promise<T | undefined>;
    put(key: string, value: unknown): Promise<void>;
    delete(key: string): Promise<void>;
    list<T>(options: {
        prefix: string;
        startAfter?: string;
        limit?: number;
    }): Promise<Map<string, T>>;
    deleteAll(): Promise<void>;
}

/** Per-socket state; the Durable Object persists this in the socket attachment. */
export interface Session {
    authed: boolean;
    role?: GameRole;
    deviceId?: string;
}

export interface Broadcast {
    message: ServerMessage;
    /** Skip sockets belonging to this device (the sender). */
    excludeDeviceId?: string;
}

export interface NotifyRequest {
    kind: MessageKind;
    seq: number;
    excludeDeviceId: string;
}

export interface Outcome {
    session: Session;
    /** Frames for the socket that sent the message, in order. */
    reply: ServerMessage[];
    /** Frames for the other authed sockets. */
    broadcast: Broadcast[];
    /** Ask the shell to Web Push devices that aren't in the foreground. */
    notify?: NotifyRequest;
    /** Ask the shell to send a test push to this device. */
    pushTest?: boolean;
    /** Close the sending socket. */
    close?: { code: number; reason: string };
    /** Delete everything after delivering the frames above, and close all sockets. */
    wipe?: boolean;
}

export const CLOSE = {
    unauthorized: 4001,
    noSuchGame: 4002,
    ended: 4003,
    badRequest: 4004,
    version: 4005,
} as const;

const RATE_LIMIT = { max: 20, windowMs: 60_000 };
const MAX_PUSH_SUBSCRIPTIONS = 20;

interface Meta {
    hiderKeyHash: string;
    createdAt: number;
    expiresAt: number;
}

interface StoredMessage {
    seq: number;
    id: string;
    kind: MessageKind;
    from: GameRole;
    fromDevice: string;
    at: number;
    payload: string;
}

interface StoredPush {
    role: GameRole;
    subscription: PushSubscriptionData;
    updatedAt: number;
}

export interface PushTarget {
    deviceId: string;
    role: GameRole;
    subscription: PushSubscriptionData;
}

const META_KEY = "meta";
const HEAD_KEY = "head";
const msgKey = (seq: number) => `m:${String(seq).padStart(10, "0")}`;
const idKey = (id: string) => `id:${id}`;
const pushKey = (deviceId: string) => `push:${deviceId}`;

export const sha256Hex = async (value: string): Promise<string> => {
    const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(value),
    );
    return [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
};

const timingSafeEqual = (a: string, b: string): boolean => {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
        diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
};

/**
 * Only real browser push services may be called back. The endpoint comes from
 * the client, so without this the Worker could be pointed at any HTTPS host.
 */
const PUSH_HOST_PATTERNS = [
    /^fcm\.googleapis\.com$/,
    /^updates\.push\.services\.mozilla\.com$/,
    /^web\.push\.apple\.com$/,
    /\.notify\.windows\.com$/,
];

export const isAllowedPushEndpoint = (endpoint: string): boolean => {
    if (endpoint.length > 1024) return false;
    let url: URL;
    try {
        url = new URL(endpoint);
    } catch {
        return false;
    }
    return (
        url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        (url.port === "" || url.port === "443") &&
        PUSH_HOST_PATTERNS.some((pattern) => pattern.test(url.hostname))
    );
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

/** Validates an untrusted, already-JSON-parsed frame. Returns null if malformed. */
export const parseClientMessage = (raw: unknown): ClientMessage | null => {
    if (!isRecord(raw) || typeof raw.t !== "string") return null;

    switch (raw.t) {
        case "auth": {
            if (
                typeof raw.v !== "number" ||
                (raw.role !== "hider" && raw.role !== "seeker") ||
                typeof raw.deviceId !== "string" ||
                typeof raw.since !== "number" ||
                !Number.isFinite(raw.since) ||
                (raw.hiderKey !== undefined && typeof raw.hiderKey !== "string")
            ) {
                return null;
            }
            return {
                t: "auth",
                v: raw.v,
                role: raw.role,
                deviceId: raw.deviceId,
                hiderKey: raw.hiderKey as string | undefined,
                since: Math.max(0, Math.floor(raw.since)),
            };
        }
        case "send": {
            if (
                typeof raw.id !== "string" ||
                typeof raw.payload !== "string" ||
                (raw.kind !== "ask" &&
                    raw.kind !== "answer" &&
                    raw.kind !== "zone-notice")
            ) {
                return null;
            }
            return {
                t: "send",
                id: raw.id,
                kind: raw.kind,
                payload: raw.payload,
            };
        }
        case "push-subscribe": {
            const sub = raw.subscription;
            if (
                !isRecord(sub) ||
                typeof sub.endpoint !== "string" ||
                !isRecord(sub.keys) ||
                typeof sub.keys.p256dh !== "string" ||
                typeof sub.keys.auth !== "string"
            ) {
                return null;
            }
            return {
                t: "push-subscribe",
                subscription: {
                    endpoint: sub.endpoint,
                    keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
                },
            };
        }
        case "ping":
        case "push-unsubscribe":
        case "push-test":
        case "end":
            return { t: raw.t };
        default:
            return null;
    }
};

export class GameRoomCore {
    private chain: Promise<unknown> = Promise.resolve();
    private recentSends = new Map<string, number[]>();

    constructor(
        private storage: RoomStorage,
        private deps: {
            now: () => number;
            hash?: (value: string) => Promise<string>;
        },
    ) {}

    private hash(value: string) {
        return (this.deps.hash ?? sha256Hex)(value);
    }

    /** Runs `fn` after every earlier call has finished, so seq order == delivery order. */
    private serial<T>(fn: () => Promise<T>): Promise<T> {
        const result = this.chain.then(fn);
        this.chain = result.catch(() => undefined);
        return result;
    }

    create(
        hiderKey: string,
        ttlMs: number = DEFAULT_GAME_TTL_MS,
    ): Promise<{ expiresAt: number }> {
        return this.serial(async () => {
            if (await this.storage.get(META_KEY)) {
                throw new Error("game already exists");
            }
            const createdAt = this.deps.now();
            const meta: Meta = {
                hiderKeyHash: await this.hash(hiderKey),
                createdAt,
                expiresAt: createdAt + ttlMs,
            };
            await this.storage.put(META_KEY, meta);
            await this.storage.put(HEAD_KEY, 0);
            return { expiresAt: meta.expiresAt };
        });
    }

    exists(): Promise<boolean> {
        return this.serial(async () => !!(await this.storage.get(META_KEY)));
    }

    /** Called from the alarm: wipes the game once it has expired. */
    expire(): Promise<{ wiped: boolean; nextAlarm?: number }> {
        return this.serial(async () => {
            const meta = await this.storage.get<Meta>(META_KEY);
            if (!meta) return { wiped: false };
            if (this.deps.now() >= meta.expiresAt) {
                await this.storage.deleteAll();
                return { wiped: true };
            }
            return { wiped: false, nextAlarm: meta.expiresAt };
        });
    }

    handle(session: Session, message: ClientMessage): Promise<Outcome> {
        return this.serial(() => this.handleNow(session, message));
    }

    /** Devices to Web Push for a new message: everyone but the sender and the foreground. */
    pushTargets(
        excludeDeviceId: string,
        foreground: ReadonlySet<string>,
    ): Promise<PushTarget[]> {
        return this.serial(async () => {
            const entries = await this.storage.list<StoredPush>({
                prefix: "push:",
            });
            const targets: PushTarget[] = [];
            for (const [key, value] of entries) {
                const deviceId = key.slice("push:".length);
                if (deviceId === excludeDeviceId || foreground.has(deviceId)) {
                    continue;
                }
                targets.push({
                    deviceId,
                    role: value.role,
                    subscription: value.subscription,
                });
            }
            return targets;
        });
    }

    pushTargetFor(deviceId: string): Promise<PushTarget | null> {
        return this.serial(async () => {
            const stored = await this.storage.get<StoredPush>(
                pushKey(deviceId),
            );
            return stored
                ? {
                      deviceId,
                      role: stored.role,
                      subscription: stored.subscription,
                  }
                : null;
        });
    }

    /** The push service said the subscription is gone (404/410). */
    dropPush(deviceId: string): Promise<void> {
        return this.serial(() => this.storage.delete(pushKey(deviceId)));
    }

    private async handleNow(
        session: Session,
        message: ClientMessage,
    ): Promise<Outcome> {
        if (message.t === "auth") {
            return this.handleAuth(session, message);
        }

        if (!session.authed || !session.role || !session.deviceId) {
            return fail(
                session,
                "unauthorized",
                "Authenticate first",
                CLOSE.unauthorized,
            );
        }

        const meta = await this.storage.get<Meta>(META_KEY);
        if (!meta || this.deps.now() >= meta.expiresAt) {
            return {
                session,
                reply: [{ t: "ended" }],
                broadcast: [],
                close: { code: CLOSE.ended, reason: "game ended" },
                wipe: true,
            };
        }

        const { role, deviceId } = session;

        switch (message.t) {
            case "ping":
                return {
                    session,
                    reply: [{ t: "pong", now: this.deps.now() }],
                    broadcast: [],
                };

            case "send":
                return this.handleSend(session, role, deviceId, message);

            case "push-subscribe": {
                if (!isAllowedPushEndpoint(message.subscription.endpoint)) {
                    return fail(
                        session,
                        "bad-request",
                        "Unsupported push endpoint",
                    );
                }
                const existing = await this.storage.list<StoredPush>({
                    prefix: "push:",
                    limit: MAX_PUSH_SUBSCRIPTIONS + 1,
                });
                if (
                    existing.size >= MAX_PUSH_SUBSCRIPTIONS &&
                    !existing.has(pushKey(deviceId))
                ) {
                    return fail(session, "full", "Too many devices");
                }
                const stored: StoredPush = {
                    role,
                    subscription: message.subscription,
                    updatedAt: this.deps.now(),
                };
                await this.storage.put(pushKey(deviceId), stored);
                return { session, reply: [], broadcast: [] };
            }

            case "push-unsubscribe":
                await this.storage.delete(pushKey(deviceId));
                return { session, reply: [], broadcast: [] };

            case "push-test":
                return { session, reply: [], broadcast: [], pushTest: true };

            case "end": {
                if (role !== "hider") {
                    return fail(session, "forbidden", "Only the hider can end");
                }
                return {
                    session,
                    reply: [{ t: "ended" }],
                    broadcast: [
                        { message: { t: "ended" }, excludeDeviceId: deviceId },
                    ],
                    close: { code: CLOSE.ended, reason: "game ended" },
                    wipe: true,
                };
            }
        }
    }

    private async handleAuth(
        session: Session,
        message: Extract<ClientMessage, { t: "auth" }>,
    ): Promise<Outcome> {
        if (session.authed) {
            return fail(session, "bad-request", "Already authenticated");
        }
        if (message.v !== PROTOCOL_VERSION) {
            return fail(
                session,
                "version",
                "Please update the app",
                CLOSE.version,
            );
        }
        if (!DEVICE_ID_PATTERN.test(message.deviceId)) {
            return fail(
                session,
                "bad-request",
                "Bad device id",
                CLOSE.badRequest,
            );
        }

        const meta = await this.storage.get<Meta>(META_KEY);
        if (!meta) {
            return fail(
                session,
                "no-such-game",
                "No such game",
                CLOSE.noSuchGame,
            );
        }
        if (this.deps.now() >= meta.expiresAt) {
            return {
                session,
                reply: [
                    {
                        t: "error",
                        code: "game-ended",
                        message: "This game has ended",
                    },
                ],
                broadcast: [],
                close: { code: CLOSE.ended, reason: "game ended" },
                wipe: true,
            };
        }

        if (message.role === "hider") {
            const supplied = await this.hash(message.hiderKey ?? "");
            if (!timingSafeEqual(supplied, meta.hiderKeyHash)) {
                return fail(
                    session,
                    "unauthorized",
                    "Wrong hider key",
                    CLOSE.unauthorized,
                );
            }
        }

        const head = (await this.storage.get<number>(HEAD_KEY)) ?? 0;
        const since = Math.min(message.since, head);

        const replay = await this.storage.list<StoredMessage>({
            prefix: "m:",
            startAfter: msgKey(since),
            limit: MAX_LOG_MESSAGES,
        });

        const reply: ServerMessage[] = [];
        for (const stored of replay.values()) {
            // A device already has what it sent itself.
            if (stored.fromDevice === message.deviceId) continue;
            reply.push(toFrame(stored));
        }
        reply.push({
            t: "ready",
            role: message.role,
            head,
            expiresAt: meta.expiresAt,
        });

        return {
            session: {
                authed: true,
                role: message.role,
                deviceId: message.deviceId,
            },
            reply,
            broadcast: [],
        };
    }

    private async handleSend(
        session: Session,
        role: GameRole,
        deviceId: string,
        message: Extract<ClientMessage, { t: "send" }>,
    ): Promise<Outcome> {
        if (!SENDABLE_KINDS[role].includes(message.kind)) {
            return fail(
                session,
                "forbidden",
                `A ${role} cannot send "${message.kind}"`,
                undefined,
                message.id,
            );
        }
        if (!MESSAGE_ID_PATTERN.test(message.id)) {
            return fail(
                session,
                "bad-request",
                "Bad message id",
                undefined,
                message.id,
            );
        }
        if (
            new TextEncoder().encode(message.payload).length > MAX_PAYLOAD_BYTES
        ) {
            return fail(
                session,
                "too-large",
                "Message too large",
                undefined,
                message.id,
            );
        }
        if (this.isRateLimited(deviceId)) {
            return fail(
                session,
                "rate-limited",
                "Slow down",
                undefined,
                message.id,
            );
        }

        // At-least-once from the client: a retry of something already stored
        // is acknowledged but not delivered a second time.
        const previous = await this.storage.get<number>(idKey(message.id));
        if (previous !== undefined) {
            return {
                session,
                reply: [
                    {
                        t: "sent",
                        id: message.id,
                        seq: previous,
                        duplicate: true,
                    },
                ],
                broadcast: [],
            };
        }

        const head = ((await this.storage.get<number>(HEAD_KEY)) ?? 0) + 1;
        const stored: StoredMessage = {
            seq: head,
            id: message.id,
            kind: message.kind,
            from: role,
            fromDevice: deviceId,
            at: this.deps.now(),
            payload: message.payload,
        };
        await this.storage.put(msgKey(head), stored);
        await this.storage.put(idKey(message.id), head);
        await this.storage.put(HEAD_KEY, head);

        // Bound the log so a runaway client can't grow storage without limit.
        const evictSeq = head - MAX_LOG_MESSAGES;
        if (evictSeq > 0) {
            const old = await this.storage.get<StoredMessage>(msgKey(evictSeq));
            if (old) {
                await this.storage.delete(msgKey(evictSeq));
                await this.storage.delete(idKey(old.id));
            }
        }

        return {
            session,
            reply: [{ t: "sent", id: message.id, seq: head, duplicate: false }],
            broadcast: [
                { message: toFrame(stored), excludeDeviceId: deviceId },
            ],
            notify: {
                kind: message.kind,
                seq: head,
                excludeDeviceId: deviceId,
            },
        };
    }

    private isRateLimited(deviceId: string): boolean {
        const now = this.deps.now();
        const recent = (this.recentSends.get(deviceId) ?? []).filter(
            (at) => now - at < RATE_LIMIT.windowMs,
        );
        if (recent.length >= RATE_LIMIT.max) {
            this.recentSends.set(deviceId, recent);
            return true;
        }
        recent.push(now);
        this.recentSends.set(deviceId, recent);
        return false;
    }
}

const toFrame = (stored: StoredMessage): ServerMessage => ({
    t: "msg",
    seq: stored.seq,
    id: stored.id,
    kind: stored.kind,
    from: stored.from,
    at: stored.at,
    payload: stored.payload,
});

const fail = (
    session: Session,
    code: ErrorCode,
    message: string,
    closeCode?: number,
    id?: string,
): Outcome => ({
    session,
    reply: [{ t: "error", code, message, ...(id ? { id } : {}) }],
    broadcast: [],
    ...(closeCode !== undefined
        ? { close: { code: closeCode, reason: code } }
        : {}),
});
