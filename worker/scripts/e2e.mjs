// End-to-end check against a running Worker (`pnpm dev`, default
// http://127.0.0.1:8787): real HTTP, real WebSockets, real Durable Object.
//
//   pnpm e2e                          # against the local dev server
//   RELAY_URL=https://... pnpm e2e    # against a deployed Worker
//
// Set CREATE_PASSPHRASE if the target requires one to create games.
import assert from "node:assert/strict";

const BASE = (process.env.RELAY_URL ?? "http://127.0.0.1:8787").replace(
    /\/$/,
    "",
);
const WS_BASE = BASE.replace(/^http/, "ws");
const PROTOCOL = 1;

let passed = 0;
const step = async (name, fn) => {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
};

class Client {
    frames = [];
    waiters = [];
    closed = null;

    constructor(url) {
        this.ws = new WebSocket(url);
        this.opened = new Promise((resolve, reject) => {
            this.ws.addEventListener("open", resolve, { once: true });
            this.ws.addEventListener(
                "error",
                () => reject(new Error("ws error")),
                {
                    once: true,
                },
            );
        });
        this.ws.addEventListener("message", (event) => {
            const frame = JSON.parse(event.data);
            this.frames.push(frame);
            this.waiters = this.waiters.filter((waiter) => !waiter(frame));
        });
        this.closePromise = new Promise((resolve) => {
            this.ws.addEventListener("close", (event) => {
                this.closed = event.code;
                resolve(event.code);
            });
        });
    }

    send(frame) {
        this.ws.send(JSON.stringify(frame));
    }

    /** Resolves with the first frame (already seen or future) matching `match`. */
    waitFor(match, label, timeoutMs = 5000) {
        const seen = this.frames.find(match);
        if (seen) return Promise.resolve(seen);
        return new Promise((resolve, reject) => {
            const timer = setTimeout(
                () =>
                    reject(
                        new Error(
                            `timed out waiting for ${label}; saw ${JSON.stringify(this.frames)}`,
                        ),
                    ),
                timeoutMs,
            );
            this.waiters.push((frame) => {
                if (!match(frame)) return false;
                clearTimeout(timer);
                resolve(frame);
                return true;
            });
        });
    }

    /** Asserts that nothing matching arrives within a short window. */
    async expectNone(match, label, windowMs = 400) {
        await new Promise((resolve) => setTimeout(resolve, windowMs));
        assert.equal(
            this.frames.find(match),
            undefined,
            `unexpected ${label}: ${JSON.stringify(this.frames)}`,
        );
    }
}

const open = async (code, auth) => {
    const client = new Client(`${WS_BASE}/games/${code}/ws`);
    await client.opened;
    client.send({
        t: "auth",
        v: PROTOCOL,
        since: 0,
        ...auth,
    });
    return client;
};

const isType = (t) => (frame) => frame.t === t;

console.log(`Relay e2e against ${BASE}`);

let code;
let hiderKey;

await step("health and config", async () => {
    const health = await fetch(`${BASE}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { ok: true });

    const config = await (await fetch(`${BASE}/config`)).json();
    assert.equal(config.protocol, PROTOCOL);
});

await step(
    "CORS: unknown origins are refused, allowed ones are echoed",
    async () => {
        const refused = await fetch(`${BASE}/health`, {
            headers: { Origin: "https://evil.example.com" },
        });
        assert.equal(refused.status, 403);

        const allowed = await fetch(`${BASE}/health`, {
            headers: { Origin: "http://localhost:4321" },
        });
        assert.equal(allowed.status, 200);
        assert.equal(
            allowed.headers.get("access-control-allow-origin"),
            "http://localhost:4321",
        );
    },
);

await step("create a game", async () => {
    const response = await fetch(`${BASE}/games`, {
        method: "POST",
        headers: process.env.CREATE_PASSPHRASE
            ? { "X-Create-Passphrase": process.env.CREATE_PASSPHRASE }
            : {},
    });
    assert.equal(response.status, 201, await response.clone().text());
    ({ code, hiderKey } = await response.json());
    assert.match(code, /^[0-9A-HJKMNP-TV-Z]{10}$/);
    assert.match(hiderKey, /^[A-Za-z0-9_-]{22}$/);
});

const hider = await open(code, {
    role: "hider",
    deviceId: "e2e-hider-0001",
    hiderKey,
});
const seekerA = await open(code, {
    role: "seeker",
    deviceId: "e2e-seeker-a01",
});
const seekerB = await open(code, {
    role: "seeker",
    deviceId: "e2e-seeker-b01",
});

await step("everyone is admitted with the right role", async () => {
    assert.deepEqual(
        (await hider.waitFor(isType("ready"), "hider ready")).role,
        "hider",
    );
    assert.equal(
        (await seekerA.waitFor(isType("ready"), "seekerA ready")).role,
        "seeker",
    );
    await seekerB.waitFor(isType("ready"), "seekerB ready");
});

await step(
    "a question reaches the hider and the teammate, not the sender",
    async () => {
        seekerA.send({
            t: "send",
            id: "e2e-question-1",
            kind: "ask",
            payload: '{"id":"radius","key":1}',
        });

        const sent = await seekerA.waitFor(isType("sent"), "sent ack");
        assert.equal(sent.seq, 1);
        assert.equal(sent.duplicate, false);

        const atHider = await hider.waitFor(isType("msg"), "msg at hider");
        assert.equal(atHider.kind, "ask");
        assert.equal(atHider.from, "seeker");
        assert.equal(atHider.payload, '{"id":"radius","key":1}');
        await seekerB.waitFor(isType("msg"), "msg at teammate");
        await seekerA.expectNone(isType("msg"), "echo to sender");
    },
);

await step("a retry of the same message is not delivered twice", async () => {
    const before = hider.frames.filter(isType("msg")).length;
    seekerA.send({
        t: "send",
        id: "e2e-question-1",
        kind: "ask",
        payload: '{"id":"radius","key":1}',
    });
    await seekerA.waitFor(
        (frame) => frame.t === "sent" && frame.duplicate === true,
        "duplicate ack",
    );
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(hider.frames.filter(isType("msg")).length, before);
});

await step("the hider's answer reaches both seekers", async () => {
    hider.send({
        t: "send",
        id: "e2e-answer-1",
        kind: "answer",
        payload: '{"id":"radius","key":1,"locked":true}',
    });
    const a = await seekerA.waitFor(
        (frame) => frame.t === "msg" && frame.kind === "answer",
        "answer at seekerA",
    );
    assert.equal(a.seq, 2);
    assert.equal(a.from, "hider");
    await seekerB.waitFor(
        (frame) => frame.t === "msg" && frame.kind === "answer",
        "answer at seekerB",
    );
});

await step("roles are enforced by the server", async () => {
    seekerA.send({
        t: "send",
        id: "e2e-bad-0001",
        kind: "answer",
        payload: "{}",
    });
    const error = await seekerA.waitFor(isType("error"), "forbidden");
    assert.equal(error.code, "forbidden");
});

await step("a device that was offline catches up on reconnect", async () => {
    const late = await open(code, {
        role: "seeker",
        deviceId: "e2e-seeker-c01",
        since: 0,
    });
    const ready = await late.waitFor(isType("ready"), "late ready");
    assert.equal(ready.head, 2);
    assert.deepEqual(
        late.frames.filter(isType("msg")).map((frame) => frame.seq),
        [1, 2],
    );
    late.ws.close();

    const partial = await open(code, {
        role: "seeker",
        deviceId: "e2e-seeker-c01",
        since: 1,
    });
    await partial.waitFor(isType("ready"), "partial ready");
    assert.deepEqual(
        partial.frames.filter(isType("msg")).map((frame) => frame.seq),
        [2],
    );
    partial.ws.close();
});

await step("the hider's manual zone notice reaches the seekers", async () => {
    hider.send({
        t: "send",
        id: "e2e-zone-0001",
        kind: "zone-notice",
        payload: "{}",
    });
    await seekerA.waitFor(
        (frame) => frame.t === "msg" && frame.kind === "zone-notice",
        "zone notice",
    );
});

await step("a wrong hider key is rejected and the socket closed", async () => {
    const impostor = await open(code, {
        role: "hider",
        deviceId: "e2e-impostor-1",
        hiderKey: "not-the-key",
    });
    const error = await impostor.waitFor(isType("error"), "unauthorized");
    assert.equal(error.code, "unauthorized");
    assert.equal(await impostor.closePromise, 4001);
});

await step("an unknown game is rejected", async () => {
    const stranger = await open("0000000000", {
        role: "seeker",
        deviceId: "e2e-stranger-1",
    });
    const error = await stranger.waitFor(isType("error"), "no-such-game");
    assert.equal(error.code, "no-such-game");
    assert.equal(await stranger.closePromise, 4002);
});

await step("garbage frames are refused without killing the game", async () => {
    seekerB.ws.send("not json");
    const error = await seekerB.waitFor(isType("error"), "bad-request");
    assert.equal(error.code, "bad-request");
    seekerB.send({ t: "ping" });
    await seekerB.waitFor(isType("pong"), "pong after garbage");
});

await step("only the hider can end the game, and ending wipes it", async () => {
    seekerA.send({ t: "end" });
    assert.equal(
        (
            await seekerA.waitFor(
                (frame) => frame.t === "error" && frame.code === "forbidden",
                "seeker cannot end",
            )
        ).code,
        "forbidden",
    );

    hider.send({ t: "end" });
    await seekerA.waitFor(isType("ended"), "seekerA ended");
    await seekerB.waitFor(isType("ended"), "seekerB ended");
    await hider.closePromise;

    // The wipe is real: the game no longer exists, nor does anything in it.
    const after = await open(code, {
        role: "seeker",
        deviceId: "e2e-seeker-d01",
    });
    const error = await after.waitFor(isType("error"), "game gone");
    assert.equal(error.code, "no-such-game");
});

// Opt-in because it idles for ~15s: proves a socket's role survives the
// Durable Object being evicted from memory (the Hibernation API restores it
// from the socket attachment, not from instance fields).
if (process.env.E2E_HIBERNATE) {
    await step("sessions survive hibernation", async () => {
        const response = await fetch(`${BASE}/games`, {
            method: "POST",
            headers: process.env.CREATE_PASSPHRASE
                ? { "X-Create-Passphrase": process.env.CREATE_PASSPHRASE }
                : {},
        });
        const game = await response.json();
        const sleepyHider = await open(game.code, {
            role: "hider",
            deviceId: "e2e-sleepy-hid1",
            hiderKey: game.hiderKey,
        });
        const sleepySeeker = await open(game.code, {
            role: "seeker",
            deviceId: "e2e-sleepy-sek1",
        });
        await sleepyHider.waitFor(isType("ready"), "hider ready");
        await sleepySeeker.waitFor(isType("ready"), "seeker ready");

        await new Promise((resolve) => setTimeout(resolve, 15_000));

        sleepySeeker.send({
            t: "send",
            id: "e2e-after-nap1",
            kind: "ask",
            payload: "{}",
        });
        await sleepySeeker.waitFor(isType("sent"), "ack after nap");
        const received = await sleepyHider.waitFor(
            isType("msg"),
            "msg after nap",
        );
        assert.equal(received.from, "seeker");

        // Role enforcement still holds with the restored session.
        sleepySeeker.send({
            t: "send",
            id: "e2e-after-nap2",
            kind: "answer",
            payload: "{}",
        });
        const refused = await sleepySeeker.waitFor(
            (frame) => frame.t === "error" && frame.code === "forbidden",
            "forbidden after nap",
        );
        assert.equal(refused.code, "forbidden");

        sleepyHider.send({ t: "end" });
        await sleepyHider.closePromise;
        sleepySeeker.ws.close();
    });
}

for (const client of [hider, seekerA, seekerB]) client.ws.close();
console.log(`\n${passed} steps passed`);
process.exit(0);
