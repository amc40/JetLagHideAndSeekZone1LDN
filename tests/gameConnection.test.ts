import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
    type ConnectionStatus,
    GameConnection,
    type SocketLike,
} from "@/lib/game/connection";
import {
    HEARTBEAT_INTERVAL_MS,
    PROTOCOL_VERSION,
    type ServerMessage,
} from "@/lib/game/protocol";

class FakeSocket implements SocketLike {
    static all: FakeSocket[] = [];
    readyState = 0;
    sent: Record<string, unknown>[] = [];
    closedWith: number | undefined;
    private listeners: Record<string, ((event: { data?: unknown }) => void)[]> =
        {};

    constructor(public url: string) {
        FakeSocket.all.push(this);
    }
    addEventListener(
        type: string,
        listener: (event: { data?: unknown }) => void,
    ) {
        (this.listeners[type] ??= []).push(listener);
    }
    send(data: string) {
        this.sent.push(JSON.parse(data));
    }
    close(code?: number) {
        this.closedWith = code;
        this.readyState = 3;
        // A real socket reports its own close, too.
        this.emit("close");
    }
    emit(type: string, data?: unknown) {
        for (const listener of this.listeners[type] ?? []) listener({ data });
    }
    // --- server side ---
    serverOpen() {
        this.readyState = 1;
        this.emit("open");
    }
    serverSend(frame: ServerMessage) {
        this.emit("message", JSON.stringify(frame));
    }
    serverDrop() {
        this.readyState = 3;
        this.emit("close");
    }
}

const READY: ServerMessage = {
    t: "ready",
    role: "seeker",
    head: 0,
    expiresAt: 0,
};

let statuses: { status: ConnectionStatus; detail?: string }[];
let frames: ServerMessage[];
let since: number;

const make = (
    overrides: { hiderKey?: string; role?: "hider" | "seeker" } = {},
) =>
    new GameConnection({
        url: "wss://relay.test/games/ABC/ws",
        deviceId: "device-0001",
        role: overrides.role ?? "seeker",
        hiderKey: overrides.hiderKey,
        getSince: () => since,
        onStatus: (status, detail) => statuses.push({ status, detail }),
        onFrame: (frame) => frames.push(frame),
        socketFactory: (url) => new FakeSocket(url),
    });

const last = () => FakeSocket.all[FakeSocket.all.length - 1];
const lastStatus = () => statuses[statuses.length - 1]?.status;

/** Starts a connection and walks it through open -> ready. */
const connectOnline = (conn: GameConnection) => {
    conn.start();
    last().serverOpen();
    last().serverSend(READY);
};

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    FakeSocket.all = [];
    statuses = [];
    frames = [];
    since = 0;
});

afterEach(() => {
    vi.useRealTimers();
});

describe("connecting", () => {
    test("authenticates on open with the since cursor and becomes online on ready", () => {
        since = 7;
        const conn = make({ role: "hider", hiderKey: "secret" });
        conn.start();

        expect(lastStatus()).toBe("connecting");
        last().serverOpen();
        expect(last().sent).toEqual([
            {
                t: "auth",
                v: PROTOCOL_VERSION,
                role: "hider",
                deviceId: "device-0001",
                hiderKey: "secret",
                since: 7,
            },
        ]);

        last().serverSend(READY);
        expect(lastStatus()).toBe("online");
    });

    test("forwards every frame, replay before ready, in order", () => {
        const conn = make();
        conn.start();
        last().serverOpen();
        const msg: ServerMessage = {
            t: "msg",
            seq: 1,
            id: "message-id-1",
            kind: "ask",
            from: "seeker",
            at: 1,
            payload: "{}",
        };
        last().serverSend(msg);
        last().serverSend(READY);

        expect(frames.map((f) => f.t)).toEqual(["msg", "ready"]);
    });

    test("send only works while online", () => {
        const conn = make();
        conn.start();
        expect(conn.send({ t: "ping" })).toBe(false);

        last().serverOpen();
        expect(conn.send({ t: "ping" })).toBe(false);

        last().serverSend(READY);
        expect(conn.send({ t: "ping" })).toBe(true);
        expect(last().sent.at(-1)).toEqual({ t: "ping" });
    });
});

describe("reconnecting", () => {
    test("retries with backoff after a drop and re-asks from the latest cursor", () => {
        const conn = make();
        connectOnline(conn);
        since = 5;

        last().serverDrop();
        expect(lastStatus()).toBe("waiting");
        expect(FakeSocket.all).toHaveLength(1);

        vi.advanceTimersByTime(1_000);
        expect(FakeSocket.all).toHaveLength(2);
        last().serverOpen();
        expect(last().sent[0]).toMatchObject({ t: "auth", since: 5 });
    });

    test("backoff grows and is capped, then resets after a successful ready", () => {
        const conn = make();
        conn.start();

        // Fail repeatedly without ever getting ready.
        for (let i = 0; i < 8; i++) {
            last().serverDrop();
            vi.advanceTimersByTime(30_000);
        }
        // Capped: a further failure retries within 30s, never longer.
        const before = FakeSocket.all.length;
        last().serverDrop();
        vi.advanceTimersByTime(30_000);
        expect(FakeSocket.all.length).toBe(before + 1);

        last().serverOpen();
        last().serverSend(READY);
        last().serverDrop();
        // After a good connection the next wait is short again (<= 1s).
        vi.advanceTimersByTime(1_000);
        expect(FakeSocket.all.length).toBe(before + 2);
    });

    test("a socket factory that throws is retried, not fatal", () => {
        let calls = 0;
        const conn = new GameConnection({
            url: "wss://relay.test/x",
            deviceId: "device-0001",
            role: "seeker",
            getSince: () => 0,
            onStatus: (status) => statuses.push({ status }),
            onFrame: () => {},
            socketFactory: (url) => {
                calls++;
                if (calls === 1) throw new Error("offline");
                return new FakeSocket(url);
            },
        });
        conn.start();
        expect(lastStatus()).toBe("waiting");
        vi.advanceTimersByTime(1_000);
        expect(FakeSocket.all).toHaveLength(1);
    });

    test("events from a superseded socket are ignored", () => {
        const conn = make();
        connectOnline(conn);
        const old = last();

        old.serverDrop(); // -> waiting
        conn.resume(); // -> a fresh socket straight away
        expect(FakeSocket.all).toHaveLength(2);

        // The superseded socket's late events neither flip the status nor
        // schedule another retry.
        old.serverSend(READY);
        old.serverDrop();
        expect(lastStatus()).toBe("connecting");
        vi.advanceTimersByTime(60_000);
        expect(FakeSocket.all).toHaveLength(2);
    });
});

describe("terminal states", () => {
    test.each(["no-such-game", "unauthorized", "version"] as const)(
        "%s is fatal and is not retried",
        (code) => {
            const conn = make();
            conn.start();
            last().serverOpen();
            last().serverSend({ t: "error", code, message: "nope" });
            last().serverDrop();

            expect(lastStatus()).toBe("failed");
            vi.advanceTimersByTime(120_000);
            expect(FakeSocket.all).toHaveLength(1);
            expect(frames.at(-1)).toMatchObject({ t: "error", code });
        },
    );

    test("game-ended and ended stop everything", () => {
        const conn = make();
        connectOnline(conn);
        last().serverSend({ t: "ended" });
        last().serverDrop();

        expect(lastStatus()).toBe("ended");
        vi.advanceTimersByTime(120_000);
        expect(FakeSocket.all).toHaveLength(1);

        // And no heartbeat keeps running.
        const sentBefore = last().sent.length;
        vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS * 5);
        expect(last().sent.length).toBe(sentBefore);
    });

    test("a non-fatal error does not disturb the connection", () => {
        const conn = make();
        connectOnline(conn);
        last().serverSend({
            t: "error",
            code: "forbidden",
            message: "no",
            id: "message-id-1",
        });

        expect(lastStatus()).toBe("online");
        expect(frames.at(-1)).toMatchObject({ id: "message-id-1" });
    });

    test("stop() closes the socket and cancels any retry", () => {
        const conn = make();
        connectOnline(conn);
        last().serverDrop();
        conn.stop();

        expect(lastStatus()).toBe("idle");
        vi.advanceTimersByTime(120_000);
        expect(FakeSocket.all).toHaveLength(1);
    });
});

describe("liveness", () => {
    test("pings on the heartbeat while the server keeps answering", () => {
        const conn = make();
        connectOnline(conn);

        for (let i = 0; i < 4; i++) {
            vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS);
            last().serverSend({ t: "pong", now: Date.now() });
        }

        const pings = last().sent.filter((frame) => frame.t === "ping");
        expect(pings).toHaveLength(4);
        expect(FakeSocket.all).toHaveLength(1);
    });

    test("a silent (zombie) socket is replaced", () => {
        const conn = make();
        connectOnline(conn);

        // The server never answers: iOS killed the socket without telling us.
        vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS * 3);

        expect(FakeSocket.all.length).toBeGreaterThan(1);
        expect(FakeSocket.all[0].closedWith).toBe(1000);
    });

    test("resume() skips the backoff wait", () => {
        const conn = make();
        connectOnline(conn);
        last().serverDrop();
        expect(lastStatus()).toBe("waiting");

        conn.resume();
        expect(FakeSocket.all).toHaveLength(2);
        expect(lastStatus()).toBe("connecting");
    });

    test("resume() on a long-suspended page reconnects instead of trusting the socket", () => {
        const conn = make();
        connectOnline(conn);

        // The page was frozen for ten minutes with no timers firing.
        vi.setSystemTime(Date.now() + 10 * 60_000);
        conn.resume();

        expect(FakeSocket.all).toHaveLength(2);
    });

    test("resume() on a healthy socket just pings", () => {
        const conn = make();
        connectOnline(conn);
        conn.resume();

        expect(FakeSocket.all).toHaveLength(1);
        expect(last().sent.at(-1)).toEqual({ t: "ping" });
    });

    test("resume() does nothing once the connection has failed", () => {
        const conn = make();
        conn.start();
        last().serverOpen();
        last().serverSend({ t: "error", code: "unauthorized", message: "x" });
        conn.resume();

        expect(FakeSocket.all).toHaveLength(1);
    });
});
