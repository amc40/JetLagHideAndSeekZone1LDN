import { beforeEach, describe, expect, test } from "vitest";

import {
    DEFAULT_GAME_TTL_MS,
    formatGameCode,
    GAME_CODE_ALPHABET,
    GAME_CODE_LENGTH,
    MAX_LOG_MESSAGES,
    MAX_PAYLOAD_BYTES,
    normalizeGameCode,
    PROTOCOL_VERSION,
} from "../src/lib/game/protocol";
import { generateGameCode, generateHiderKey } from "../worker/src/ids";
import {
    type ClientMessage,
    GameRoomCore,
    isAllowedPushEndpoint,
    type Outcome,
    parseClientMessage,
    type RoomStorage,
    type Session,
} from "../worker/src/room";

class MemoryStorage implements RoomStorage {
    data = new Map<string, unknown>();
    async get<T>(key: string) {
        return this.data.get(key) as T | undefined;
    }
    async put(key: string, value: unknown) {
        this.data.set(key, structuredClone(value));
    }
    async delete(key: string) {
        this.data.delete(key);
    }
    async list<T>(options: {
        prefix: string;
        startAfter?: string;
        limit?: number;
    }) {
        const keys = [...this.data.keys()]
            .filter((key) => key.startsWith(options.prefix))
            .filter((key) => !options.startAfter || key > options.startAfter)
            .sort();
        const out = new Map<string, T>();
        for (const key of keys.slice(0, options.limit ?? keys.length)) {
            out.set(key, this.data.get(key) as T);
        }
        return out;
    }
    async deleteAll() {
        this.data.clear();
    }
}

const HIDER_KEY = "hider-secret-key";
const NOT_AUTHED: Session = { authed: false };

let storage: MemoryStorage;
let clock: number;
let room: GameRoomCore;

beforeEach(async () => {
    storage = new MemoryStorage();
    clock = 1_000_000;
    room = new GameRoomCore(storage, { now: () => clock });
    await room.create(HIDER_KEY);
});

const auth = (
    overrides: Partial<Extract<ClientMessage, { t: "auth" }>> = {},
): ClientMessage => ({
    t: "auth",
    v: PROTOCOL_VERSION,
    role: "seeker",
    deviceId: "seeker-device-1",
    since: 0,
    ...overrides,
});

const send = (
    id: string,
    kind: "ask" | "answer" | "zone-notice" = "ask",
    payload = "{}",
): ClientMessage => ({ t: "send", id, kind, payload });

/** Authenticates a device and returns its live session. */
const connect = async (
    role: "seeker" | "hider",
    deviceId: string,
    since = 0,
): Promise<{ session: Session; outcome: Outcome }> => {
    const outcome = await room.handle(
        NOT_AUTHED,
        auth({
            role,
            deviceId,
            since,
            hiderKey: role === "hider" ? HIDER_KEY : undefined,
        }),
    );
    return { session: outcome.session, outcome };
};

describe("auth", () => {
    test("a seeker joins with just the game code", async () => {
        const { session, outcome } = await connect("seeker", "seeker-aaaa-1");

        expect(session).toEqual({
            authed: true,
            role: "seeker",
            deviceId: "seeker-aaaa-1",
        });
        expect(outcome.reply.at(-1)).toMatchObject({
            t: "ready",
            role: "seeker",
            head: 0,
        });
    });

    test("the hider needs the right key", async () => {
        const wrong = await room.handle(
            NOT_AUTHED,
            auth({ role: "hider", hiderKey: "nope" }),
        );
        expect(wrong.session.authed).toBe(false);
        expect(wrong.reply[0]).toMatchObject({
            t: "error",
            code: "unauthorized",
        });
        expect(wrong.close).toBeDefined();

        const missing = await room.handle(NOT_AUTHED, auth({ role: "hider" }));
        expect(missing.session.authed).toBe(false);

        const { session } = await connect("hider", "hider-aaaa-01");
        expect(session.role).toBe("hider");
    });

    test("an unknown game is rejected", async () => {
        const empty = new GameRoomCore(new MemoryStorage(), {
            now: () => clock,
        });
        const outcome = await empty.handle(NOT_AUTHED, auth());

        expect(outcome.reply[0]).toMatchObject({
            t: "error",
            code: "no-such-game",
        });
        expect(outcome.close).toBeDefined();
    });

    test("a protocol version mismatch asks for an update", async () => {
        const outcome = await room.handle(NOT_AUTHED, auth({ v: 999 }));

        expect(outcome.reply[0]).toMatchObject({
            t: "error",
            code: "version",
        });
        expect(outcome.close).toBeDefined();
    });

    test("anything before auth is refused", async () => {
        const outcome = await room.handle(NOT_AUTHED, send("message-id-1"));

        expect(outcome.reply[0]).toMatchObject({
            t: "error",
            code: "unauthorized",
        });
        expect(outcome.close).toBeDefined();
    });

    test("a malformed device id is rejected", async () => {
        const outcome = await room.handle(
            NOT_AUTHED,
            auth({ deviceId: "has spaces!" }),
        );
        expect(outcome.session.authed).toBe(false);
    });
});

describe("sending", () => {
    test("a seeker's question is sequenced, broadcast to others and notified", async () => {
        const { session } = await connect("seeker", "seeker-aaaa-1");
        const outcome = await room.handle(
            session,
            send("message-id-1", "ask", '{"q":1}'),
        );

        expect(outcome.reply).toEqual([
            { t: "sent", id: "message-id-1", seq: 1, duplicate: false },
        ]);
        expect(outcome.broadcast).toEqual([
            {
                message: {
                    t: "msg",
                    seq: 1,
                    id: "message-id-1",
                    kind: "ask",
                    from: "seeker",
                    at: clock,
                    payload: '{"q":1}',
                },
                excludeDeviceId: "seeker-aaaa-1",
            },
        ]);
        expect(outcome.notify).toEqual({
            kind: "ask",
            seq: 1,
            excludeDeviceId: "seeker-aaaa-1",
        });
    });

    test("roles are enforced", async () => {
        const seeker = await connect("seeker", "seeker-aaaa-1");
        const hider = await connect("hider", "hider-aaaa-01");

        const seekerAnswers = await room.handle(
            seeker.session,
            send("message-id-1", "answer"),
        );
        expect(seekerAnswers.reply[0]).toMatchObject({
            t: "error",
            code: "forbidden",
        });
        expect(seekerAnswers.broadcast).toEqual([]);

        const hiderAsks = await room.handle(
            hider.session,
            send("message-id-2", "ask"),
        );
        expect(hiderAsks.reply[0]).toMatchObject({
            t: "error",
            code: "forbidden",
        });

        const hiderAnswers = await room.handle(
            hider.session,
            send("message-id-3", "answer"),
        );
        expect(hiderAnswers.reply[0]).toMatchObject({ t: "sent", seq: 1 });

        const hiderNotice = await room.handle(
            hider.session,
            send("message-id-4", "zone-notice"),
        );
        expect(hiderNotice.reply[0]).toMatchObject({ t: "sent", seq: 2 });
    });

    test("a retried message is acknowledged but not delivered twice", async () => {
        const { session } = await connect("seeker", "seeker-aaaa-1");
        await room.handle(session, send("message-id-1"));
        const retry = await room.handle(session, send("message-id-1"));

        expect(retry.reply).toEqual([
            { t: "sent", id: "message-id-1", seq: 1, duplicate: true },
        ]);
        expect(retry.broadcast).toEqual([]);
        expect(retry.notify).toBeUndefined();
        expect(await storage.get("head")).toBe(1);
    });

    test("concurrent sends get distinct, ordered sequence numbers", async () => {
        const { session } = await connect("seeker", "seeker-aaaa-1");
        clock += 0;
        const outcomes = await Promise.all(
            Array.from({ length: 10 }, (_, i) =>
                room.handle(session, send(`message-id-${i}`)),
            ),
        );

        expect(
            outcomes.map((o) => (o.reply[0] as { seq: number }).seq),
        ).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });

    test("oversized payloads and bad ids are rejected", async () => {
        const { session } = await connect("seeker", "seeker-aaaa-1");

        const big = await room.handle(
            session,
            send("message-id-1", "ask", "x".repeat(MAX_PAYLOAD_BYTES + 1)),
        );
        expect(big.reply[0]).toMatchObject({ code: "too-large" });

        const badId = await room.handle(session, send("x"));
        expect(badId.reply[0]).toMatchObject({ code: "bad-request" });
    });

    test("a device is rate limited", async () => {
        const { session } = await connect("seeker", "seeker-aaaa-1");
        let last: Outcome | undefined;
        for (let i = 0; i < 21; i++) {
            last = await room.handle(session, send(`message-id-${i}`));
        }
        expect(last?.reply[0]).toMatchObject({ code: "rate-limited" });

        clock += 61_000;
        const later = await room.handle(session, send("message-id-later"));
        expect(later.reply[0]).toMatchObject({ t: "sent" });
    });

    test("the log is bounded", async () => {
        const { session } = await connect("seeker", "seeker-aaaa-1");
        for (let i = 0; i < MAX_LOG_MESSAGES + 5; i++) {
            clock += 4_000;
            await room.handle(session, send(`message-id-${i}`));
        }

        const stored = [...storage.data.keys()].filter((key) =>
            key.startsWith("m:"),
        );
        const ids = [...storage.data.keys()].filter((key) =>
            key.startsWith("id:"),
        );
        expect(stored).toHaveLength(MAX_LOG_MESSAGES);
        expect(ids).toHaveLength(MAX_LOG_MESSAGES);
    });
});

describe("catch-up", () => {
    const seed = async () => {
        const seeker = await connect("seeker", "seeker-aaaa-1");
        for (let i = 1; i <= 3; i++) {
            await room.handle(seeker.session, send(`message-id-${i}`));
        }
        return seeker;
    };

    test("a device that was offline gets everything it missed, then ready", async () => {
        await seed();
        const { outcome } = await connect("hider", "hider-aaaa-01", 0);

        expect(outcome.reply.map((f) => f.t)).toEqual([
            "msg",
            "msg",
            "msg",
            "ready",
        ]);
        expect(outcome.reply.at(-1)).toMatchObject({ head: 3 });
    });

    test("only messages after `since` are replayed", async () => {
        await seed();
        const { outcome } = await connect("hider", "hider-aaaa-01", 2);

        expect(outcome.reply).toHaveLength(2);
        expect(outcome.reply[0]).toMatchObject({ t: "msg", seq: 3 });
    });

    test("a device is not sent its own messages back", async () => {
        await seed();
        const { outcome } = await connect("seeker", "seeker-aaaa-1", 0);

        expect(outcome.reply.map((f) => f.t)).toEqual(["ready"]);
    });

    test("a `since` ahead of the server is clamped to head", async () => {
        await seed();
        const { outcome } = await connect("hider", "hider-aaaa-01", 99);

        expect(outcome.reply).toEqual([
            expect.objectContaining({ t: "ready", head: 3 }),
        ]);
    });
});

describe("push subscriptions", () => {
    const sub = (endpoint: string) => ({
        t: "push-subscribe" as const,
        subscription: { endpoint, keys: { p256dh: "p", auth: "a" } },
    });

    test("endpoint allowlist", () => {
        expect(
            isAllowedPushEndpoint("https://fcm.googleapis.com/fcm/send/abc"),
        ).toBe(true);
        expect(
            isAllowedPushEndpoint(
                "https://updates.push.services.mozilla.com/wpush/v2/abc",
            ),
        ).toBe(true);
        expect(isAllowedPushEndpoint("https://web.push.apple.com/abc")).toBe(
            true,
        );
        expect(
            isAllowedPushEndpoint(
                "https://wns2-par02p.notify.windows.com/w/?x",
            ),
        ).toBe(true);

        expect(isAllowedPushEndpoint("http://fcm.googleapis.com/x")).toBe(
            false,
        );
        expect(isAllowedPushEndpoint("https://evil.example.com/x")).toBe(false);
        expect(
            isAllowedPushEndpoint("https://fcm.googleapis.com.evil.com/x"),
        ).toBe(false);
        expect(
            isAllowedPushEndpoint("https://user:pw@web.push.apple.com/"),
        ).toBe(false);
        expect(isAllowedPushEndpoint("https://web.push.apple.com:8443/")).toBe(
            false,
        );
        expect(isAllowedPushEndpoint("not a url")).toBe(false);
    });

    test("subscribing stores the target; the sender and foreground devices are skipped", async () => {
        const a = await connect("seeker", "seeker-aaaa-1");
        const b = await connect("hider", "hider-aaaa-01");
        const c = await connect("seeker", "seeker-bbbb-2");

        for (const { session } of [a, b, c]) {
            const out = await room.handle(
                session,
                sub(`https://fcm.googleapis.com/fcm/send/${session.deviceId}`),
            );
            expect(out.reply).toEqual([]);
        }

        const targets = await room.pushTargets(
            "seeker-aaaa-1",
            new Set(["seeker-bbbb-2"]),
        );
        expect(targets.map((t) => t.deviceId)).toEqual(["hider-aaaa-01"]);
    });

    test("a disallowed endpoint is refused and unsubscribe removes the target", async () => {
        const { session } = await connect("hider", "hider-aaaa-01");

        const refused = await room.handle(
            session,
            sub("https://evil.example.com/x"),
        );
        expect(refused.reply[0]).toMatchObject({ code: "bad-request" });

        await room.handle(session, sub("https://web.push.apple.com/abc"));
        expect(await room.pushTargetFor("hider-aaaa-01")).not.toBeNull();

        await room.handle(session, { t: "push-unsubscribe" });
        expect(await room.pushTargetFor("hider-aaaa-01")).toBeNull();
    });

    test("push-test asks the shell to send a test push", async () => {
        const { session } = await connect("seeker", "seeker-aaaa-1");
        const out = await room.handle(session, { t: "push-test" });
        expect(out.pushTest).toBe(true);
    });
});

describe("ending and expiry", () => {
    test("only the hider can end the game, which wipes everything", async () => {
        const seeker = await connect("seeker", "seeker-aaaa-1");
        const hider = await connect("hider", "hider-aaaa-01");

        const refused = await room.handle(seeker.session, { t: "end" });
        expect(refused.wipe).toBeUndefined();
        expect(refused.reply[0]).toMatchObject({ code: "forbidden" });

        const ended = await room.handle(hider.session, { t: "end" });
        expect(ended.wipe).toBe(true);
        expect(ended.broadcast).toEqual([
            { message: { t: "ended" }, excludeDeviceId: "hider-aaaa-01" },
        ]);
    });

    test("the alarm wipes an expired game and leaves a live one", async () => {
        expect(await room.expire()).toEqual({
            wiped: false,
            nextAlarm: 1_000_000 + DEFAULT_GAME_TTL_MS,
        });
        expect(storage.data.size).toBeGreaterThan(0);

        clock += DEFAULT_GAME_TTL_MS;
        expect(await room.expire()).toEqual({ wiped: true });
        expect(storage.data.size).toBe(0);
    });

    test("an expired game refuses new connections and ends live ones", async () => {
        const { session } = await connect("seeker", "seeker-aaaa-1");
        clock += DEFAULT_GAME_TTL_MS;

        const late = await room.handle(session, send("message-id-1"));
        expect(late.wipe).toBe(true);
        expect(late.reply).toEqual([{ t: "ended" }]);

        const join = await room.handle(NOT_AUTHED, auth());
        expect(join.reply[0]).toMatchObject({ code: "game-ended" });
        expect(join.wipe).toBe(true);
    });

    test("creating the same game twice fails", async () => {
        await expect(room.create(HIDER_KEY)).rejects.toThrow();
    });

    test("nothing location-like is stored besides the question log", async () => {
        const { session } = await connect("seeker", "seeker-aaaa-1");
        await room.handle(session, send("message-id-1"));

        const prefixes = new Set(
            [...storage.data.keys()].map((key) => key.split(":")[0]),
        );
        expect([...prefixes].sort()).toEqual(["head", "id", "m", "meta"]);
    });
});

describe("parseClientMessage", () => {
    test("accepts well-formed frames", () => {
        expect(parseClientMessage({ t: "ping" })).toEqual({ t: "ping" });
        expect(
            parseClientMessage({
                t: "send",
                id: "message-id-1",
                kind: "ask",
                payload: "{}",
            }),
        ).toMatchObject({ t: "send" });
        expect(
            parseClientMessage({
                t: "auth",
                v: 1,
                role: "seeker",
                deviceId: "device-0001",
                since: -5,
            }),
        ).toMatchObject({ since: 0 });
    });

    test.each([
        null,
        "string",
        [],
        {},
        { t: 5 },
        { t: "nope" },
        { t: "auth", v: "1", role: "seeker", deviceId: "d", since: 0 },
        { t: "auth", v: 1, role: "admin", deviceId: "d", since: 0 },
        { t: "send", id: 1, kind: "ask", payload: "" },
        { t: "send", id: "message-id-1", kind: "weird", payload: "" },
        { t: "send", id: "message-id-1", kind: "ask", payload: {} },
        { t: "push-subscribe", subscription: { endpoint: "x" } },
    ])("rejects %j", (raw) => {
        expect(parseClientMessage(raw)).toBeNull();
    });
});

describe("game codes", () => {
    test("generated codes use only the unambiguous alphabet", () => {
        for (let i = 0; i < 200; i++) {
            const code = generateGameCode();
            expect(code).toHaveLength(GAME_CODE_LENGTH);
            for (const char of code) {
                expect(GAME_CODE_ALPHABET).toContain(char);
            }
        }
    });

    test("typed codes are normalised", () => {
        const code = "K7QXM2PD9T";
        expect(normalizeGameCode("k7qxm-2pd9t")).toBe(code);
        expect(normalizeGameCode(" K7QXM 2PD9T ")).toBe(code);
        expect(normalizeGameCode(formatGameCode(code))).toBe(code);
        // look-alikes: O -> 0, I and L -> 1
        expect(normalizeGameCode("OILXM2PD9T")).toBe("011XM2PD9T");
        expect(normalizeGameCode("short")).toBeNull();
        expect(normalizeGameCode("K7QXM2PD9U")).toBeNull();
    });

    test("hider keys are url-safe and unique", () => {
        const a = generateHiderKey();
        const b = generateHiderKey();
        expect(a).toMatch(/^[A-Za-z0-9_-]{22}$/);
        expect(a).not.toBe(b);
    });
});
