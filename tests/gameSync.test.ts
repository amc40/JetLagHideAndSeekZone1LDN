import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    toast: {
        info: vi.fn(),
        success: vi.fn(),
        warning: vi.fn(),
        error: vi.fn(),
    },
    location: undefined as { latitude: number; longitude: number } | undefined,
}));

vi.mock("react-toastify", () => ({ toast: mocks.toast }));
vi.mock("@/lib/hiderAnswer", () => ({
    getHiderAnswerLocation: async () => mocks.location,
    // Stands in for hiderify: the real one needs the map pipeline.
    answerQuestionAsHider: async (question: any) => {
        question.data.within = false;
        question.data.drag = false;
        return question;
    },
}));

import { hiderMode, questions } from "@/lib/context";
import type { GameConnectionOptions } from "@/lib/game/connection";
import type { ClientMessage, ServerMessage } from "@/lib/game/protocol";
import {
    connectionStatus,
    gameServerUrl,
    gameSession,
    onlineEnabled,
    outbox,
    pushTestResult,
    questionSync,
    unreadableMessages,
    zoneNoticeAt,
} from "@/lib/game/store";
import {
    answerQuestion,
    askQuestion,
    createGame,
    joinGame,
    leaveGame,
    setConnectionFactoryForTests,
    startGameConnection,
} from "@/lib/game/sync";
import { questionSchema } from "@/maps/schema";

class FakeConnection {
    static instances: FakeConnection[] = [];
    online = false;
    sent: ClientMessage[] = [];
    started = false;
    stopped = false;

    constructor(public options: GameConnectionOptions) {
        FakeConnection.instances.push(this);
    }
    start() {
        this.started = true;
        this.options.onStatus("connecting");
    }
    stop() {
        this.stopped = true;
    }
    resume() {}
    send(frame: ClientMessage) {
        if (!this.online) return false;
        this.sent.push(frame);
        return true;
    }
    // --- server side ---
    deliver(frame: ServerMessage) {
        this.options.onFrame(frame);
    }
    goOnline(head = 0) {
        this.online = true;
        this.deliver({ t: "ready", role: "seeker", head, expiresAt: 123 });
    }
    drop() {
        this.online = false;
    }
    get sends() {
        return this.sent.filter(
            (f): f is Extract<ClientMessage, { t: "send" }> => f.t === "send",
        );
    }
}

const live = () =>
    FakeConnection.instances[FakeConnection.instances.length - 1];

const radius = (key: number, drag = true, within = true) =>
    questionSchema.parse({
        id: "radius",
        key,
        data: {
            lat: 51.5,
            lng: -0.1,
            radius: 2,
            unit: "kilometers",
            drag,
            within,
        },
    });

const msg = (
    seq: number,
    kind: "ask" | "answer" | "zone-notice",
    payload: unknown,
    from: "seeker" | "hider" = kind === "ask" ? "seeker" : "hider",
): ServerMessage => ({
    t: "msg",
    seq,
    id: `message-id-${seq}`,
    kind,
    from,
    at: 1_700_000_000_000 + seq,
    payload: typeof payload === "string" ? payload : JSON.stringify(payload),
});

const startAs = (role: "seeker" | "hider") => {
    gameSession.set({
        serverUrl: "https://relay.test",
        code: "K7QXM2PD9T",
        role,
        hiderKey: role === "hider" ? "hider-key" : undefined,
        lastSeq: 0,
    });
    startGameConnection();
    return live();
};

beforeEach(() => {
    vi.clearAllMocks();
    FakeConnection.instances = [];
    setConnectionFactoryForTests(
        (options) => new FakeConnection(options) as any,
    );
    questions.set([]);
    gameSession.set(null);
    onlineEnabled.set(true);
    outbox.set([]);
    questionSync.set({});
    unreadableMessages.set([]);
    zoneNoticeAt.set(null);
    pushTestResult.set(null);
    hiderMode.set(false);
    gameServerUrl.set("https://relay.test");
    mocks.location = undefined;
    connectionStatus.set({ status: "idle" });
});

describe("asking (seeker)", () => {
    test("commits locally, queues, and sends once online", () => {
        questions.set([radius(1)]);
        const conn = startAs("seeker");

        expect(askQuestion("radius", 1)).toBe("queued");

        // Nothing is lost while offline: it sits in the persisted outbox.
        expect(outbox.get()).toHaveLength(1);
        expect(conn.sends).toHaveLength(0);
        expect(questionSync.get()["radius:1"]).toBe("asked");
        expect(questions.get()).toHaveLength(1);

        conn.goOnline();
        expect(conn.sends).toHaveLength(1);
        expect(conn.sends[0].kind).toBe("ask");
        expect(JSON.parse(conn.sends[0].payload)).toMatchObject({
            id: "radius",
            key: 1,
        });
    });

    test("the ack removes it from the outbox", () => {
        questions.set([radius(1)]);
        const conn = startAs("seeker");
        conn.goOnline();
        askQuestion("radius", 1);

        const { id } = conn.sends[0];
        conn.deliver({ t: "sent", id, seq: 1, duplicate: false });

        expect(outbox.get()).toHaveLength(0);
    });

    test("an unacked message is resent after a reconnect, with the same id", () => {
        questions.set([radius(1)]);
        const conn = startAs("seeker");
        conn.goOnline();
        askQuestion("radius", 1);
        const firstId = conn.sends[0].id;

        conn.drop(); // socket died before the ack arrived
        conn.goOnline();

        expect(conn.sends).toHaveLength(2);
        expect(conn.sends[1].id).toBe(firstId);
    });

    test("an acked message is not resent after a reconnect", () => {
        questions.set([radius(1)]);
        const conn = startAs("seeker");
        conn.goOnline();
        askQuestion("radius", 1);
        conn.deliver({
            t: "sent",
            id: conn.sends[0].id,
            seq: 1,
            duplicate: false,
        });

        conn.drop();
        conn.goOnline();

        expect(conn.sends).toHaveLength(1);
    });

    test("asking twice sends once", () => {
        questions.set([radius(1)]);
        const conn = startAs("seeker");
        conn.goOnline();

        expect(askQuestion("radius", 1)).toBe("queued");
        expect(askQuestion("radius", 1)).toBe("already-asked");
        expect(conn.sends).toHaveLength(1);
    });

    test("a locked question is sent unlocked, without touching the local copy", () => {
        questions.set([radius(1, false)]);
        const conn = startAs("seeker");
        conn.goOnline();

        askQuestion("radius", 1);

        expect(JSON.parse(conn.sends[0].payload).data.drag).toBe(true);
        expect(questions.get()[0].data.drag).toBe(false);
    });

    test("an unknown question is reported", () => {
        startAs("seeker");
        expect(askQuestion("radius", 99)).toBe("not-found");
    });
});

describe("receiving", () => {
    test("the hider gets an ask: added, tracked as asked, notified, cursor advanced", () => {
        const conn = startAs("hider");
        conn.goOnline();

        conn.deliver(msg(1, "ask", radius(7)));

        expect(questions.get()).toHaveLength(1);
        expect(questions.get()[0].key).toBe(7);
        expect(questions.get()[0].data.drag).toBe(true);
        expect(questionSync.get()["radius:7"]).toBe("asked");
        expect(mocks.toast.info).toHaveBeenCalledTimes(1);
        expect(gameSession.get()?.lastSeq).toBe(1);
    });

    test("a replayed ask is not a second notification", () => {
        const conn = startAs("hider");
        conn.goOnline();

        conn.deliver(msg(1, "ask", radius(7)));
        conn.deliver(msg(1, "ask", radius(7)));

        expect(questions.get()).toHaveLength(1);
        expect(mocks.toast.info).toHaveBeenCalledTimes(1);
    });

    test("an answer settles the seeker's unanswered copy in place", () => {
        questions.set([radius(1, true, true)]);
        const conn = startAs("seeker");
        conn.goOnline();
        askQuestion("radius", 1);

        conn.deliver(msg(2, "answer", radius(1, false, false)));

        const [only] = questions.get();
        expect(questions.get()).toHaveLength(1);
        expect(only.data.drag).toBe(false);
        expect((only.data as { within: boolean }).within).toBe(false);
        expect(questionSync.get()["radius:1"]).toBe("answered");
        expect(mocks.toast.success).toHaveBeenCalledTimes(1);
    });

    test("a late replay of the ask never undoes an answer", () => {
        const conn = startAs("seeker");
        conn.goOnline();

        conn.deliver(msg(2, "answer", radius(1, false, false)));
        conn.deliver(msg(1, "ask", radius(1, true, true)));

        expect(questionSync.get()["radius:1"]).toBe("answered");
        expect(questions.get()[0].data.drag).toBe(false);
    });

    test("the server's kind wins over a mislabelled payload", () => {
        const conn = startAs("hider");
        conn.goOnline();

        // An "ask" whose payload claims to be locked is still treated as unanswered.
        conn.deliver(msg(1, "ask", radius(3, false, false)));

        expect(questions.get()[0].data.drag).toBe(true);
    });

    test("the zone notice raises a persistent alert", () => {
        const conn = startAs("seeker");
        conn.goOnline();

        conn.deliver(msg(1, "zone-notice", { at: 1 }));

        expect(zoneNoticeAt.get()).not.toBeNull();
        expect(mocks.toast.warning).toHaveBeenCalledTimes(1);
    });

    test("an unreadable question is kept, not dropped, and the cursor still advances", () => {
        const conn = startAs("seeker");
        conn.goOnline();

        conn.deliver(
            msg(4, "answer", {
                id: "teleport",
                key: 1,
                data: { somethingNew: true },
            }),
        );

        expect(questions.get()).toHaveLength(0);
        expect(unreadableMessages.get()).toHaveLength(1);
        expect(unreadableMessages.get()[0].seq).toBe(4);
        expect(mocks.toast.error).toHaveBeenCalledTimes(1);
        expect(gameSession.get()?.lastSeq).toBe(4);
    });

    test("ready resets the cursor to the server's head, even if lower", () => {
        const conn = startAs("seeker");
        gameSession.set({ ...gameSession.get()!, lastSeq: 50 });

        conn.goOnline(3);

        expect(gameSession.get()?.lastSeq).toBe(3);
        expect(gameSession.get()?.expiresAt).toBe(123);
    });

    test("catch-up asks from the stored cursor", () => {
        const conn = startAs("seeker");
        gameSession.set({ ...gameSession.get()!, lastSeq: 9 });

        expect(conn.options.getSince()).toBe(9);
    });
});

describe("send rejections", () => {
    test("a permanently rejected message leaves the outbox and tells the user", () => {
        questions.set([radius(1)]);
        const conn = startAs("seeker");
        conn.goOnline();
        askQuestion("radius", 1);
        const { id } = conn.sends[0];

        conn.deliver({ t: "error", code: "forbidden", message: "no", id });

        expect(outbox.get()).toHaveLength(0);
        expect(mocks.toast.error).toHaveBeenCalledTimes(1);
    });

    test("a rate limit keeps the message queued", () => {
        vi.useFakeTimers();
        questions.set([radius(1)]);
        const conn = startAs("seeker");
        conn.goOnline();
        askQuestion("radius", 1);
        const { id } = conn.sends[0];

        conn.deliver({ t: "error", code: "rate-limited", message: "slow", id });
        expect(outbox.get()).toHaveLength(1);

        vi.advanceTimersByTime(30_000);
        expect(conn.sends).toHaveLength(2);
        expect(conn.sends[1].id).toBe(id);
        vi.useRealTimers();
    });
});

describe("answering (hider)", () => {
    test("answers from the device location, locks, and sends", async () => {
        mocks.location = { latitude: 51.5, longitude: -0.1 };
        questions.set([radius(1, true, true)]);
        const conn = startAs("hider");
        conn.goOnline();

        expect(await answerQuestion("radius", 1)).toBe(true);

        expect(questions.get()[0].data.drag).toBe(false);
        expect(questionSync.get()["radius:1"]).toBe("answered");
        expect(conn.sends).toHaveLength(1);
        expect(conn.sends[0].kind).toBe("answer");
        expect(JSON.parse(conn.sends[0].payload).data.drag).toBe(false);
    });

    test("refuses to send a default answer when there is no location at all", async () => {
        mocks.location = undefined;
        hiderMode.set(false);
        questions.set([radius(1, true, true)]);
        const conn = startAs("hider");
        conn.goOnline();

        expect(await answerQuestion("radius", 1)).toBe(false);

        expect(questions.get()[0].data.drag).toBe(true);
        expect(conn.sends).toHaveLength(0);
        expect(mocks.toast.error).toHaveBeenCalledTimes(1);
    });

    test("falls back to the saved hiding station", async () => {
        mocks.location = undefined;
        hiderMode.set({ latitude: 51.5, longitude: -0.1 });
        questions.set([radius(1, true, true)]);
        const conn = startAs("hider");
        conn.goOnline();

        expect(await answerQuestion("radius", 1)).toBe(true);
        expect(conn.sends).toHaveLength(1);
    });

    test("an already-answered question is not answered again", async () => {
        mocks.location = { latitude: 51.5, longitude: -0.1 };
        questions.set([radius(1, false, true)]);
        const conn = startAs("hider");
        conn.goOnline();

        expect(await answerQuestion("radius", 1)).toBe(false);
        expect(conn.sends).toHaveLength(0);
    });
});

describe("kill switch and lifecycle", () => {
    test("with online play off there is no connection at all", () => {
        onlineEnabled.set(false);
        startAs("seeker");

        expect(FakeConnection.instances).toHaveLength(0);
        expect(connectionStatus.get().status).toBe("idle");
    });

    test("joining normalises the code and defaults to seeker", () => {
        joinGame("k7qxm-2pd9t");

        expect(gameSession.get()).toMatchObject({
            code: "K7QXM2PD9T",
            role: "seeker",
            serverUrl: "https://relay.test",
        });
        expect(live().options.url).toBe("wss://relay.test/games/K7QXM2PD9T/ws");
        expect(live().options.role).toBe("seeker");
    });

    test("a hider key makes the device the hider", () => {
        joinGame("K7QXM2PD9T", " secret-key ");

        expect(gameSession.get()).toMatchObject({
            role: "hider",
            hiderKey: "secret-key",
        });
    });

    test("bad codes and a missing server are rejected up front", () => {
        expect(() => joinGame("nope")).toThrow(/game code/);
        gameServerUrl.set("");
        expect(() => joinGame("K7QXM2PD9T")).toThrow(/server/);
    });

    test("creating a game stores the hider session", async () => {
        const fetchMock = vi.fn(
            async () =>
                new Response(
                    JSON.stringify({
                        code: "K7QXM2PD9T",
                        hiderKey: "the-hider-key",
                        expiresAt: 5,
                    }),
                    { status: 201 },
                ),
        );
        vi.stubGlobal("fetch", fetchMock);

        await createGame();

        expect(fetchMock).toHaveBeenCalledWith("https://relay.test/games", {
            method: "POST",
            headers: {},
        });
        expect(gameSession.get()).toMatchObject({
            role: "hider",
            hiderKey: "the-hider-key",
            code: "K7QXM2PD9T",
        });
        vi.unstubAllGlobals();
    });

    test("a wrong create passphrase is explained", async () => {
        vi.stubGlobal("fetch", async () => new Response("{}", { status: 401 }));
        await expect(createGame()).rejects.toThrow(/passphrase/);
        expect(gameSession.get()).toBeNull();
        vi.unstubAllGlobals();
    });

    test("leaving clears the game but never the questions", () => {
        questions.set([radius(1)]);
        const conn = startAs("seeker");
        conn.goOnline();
        askQuestion("radius", 1);

        leaveGame();

        expect(conn.stopped).toBe(true);
        expect(gameSession.get()).toBeNull();
        expect(outbox.get()).toHaveLength(0);
        expect(questionSync.get()).toEqual({});
        expect(questions.get()).toHaveLength(1);
    });
});

describe("push test results", () => {
    test("are surfaced for the readiness check", () => {
        const conn = startAs("seeker");
        conn.goOnline();

        conn.deliver({ t: "push-test", sent: 1 });

        expect(pushTestResult.get()).toMatchObject({ sent: 1 });
    });
});
