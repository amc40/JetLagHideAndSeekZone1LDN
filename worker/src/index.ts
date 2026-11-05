/**
 * Game relay Worker: a per-game mailbox on a SQLite-backed Durable Object.
 *
 * The Worker routes HTTP/WebSocket requests to the Durable Object named by the
 * game code. The Durable Object is a thin shell around `GameRoomCore`
 * (room.ts), which owns the rules; this file only owns sockets, the alarm and
 * Web Push delivery.
 *
 * It uses the WebSocket Hibernation API, so an idle game costs nothing and the
 * object can be evicted between messages. Anything that must survive that
 * lives in the socket attachment or in storage, never in instance fields.
 */
import { DurableObject } from "cloudflare:workers";

import {
    FOREGROUND_WINDOW_MS,
    normalizeGameCode,
    PROTOCOL_VERSION,
    type ServerMessage,
} from "../../src/lib/game/protocol";
import { generateGameCode, generateHiderKey } from "./ids";
import {
    CLOSE,
    GameRoomCore,
    type NotifyRequest,
    type Outcome,
    parseClientMessage,
    type RoomStorage,
    type Session,
} from "./room";
import { sendWebPush } from "./webpush";

export interface Env {
    GAME: DurableObjectNamespace<GameRoom>;
    ALLOWED_ORIGINS: string;
    VAPID_SUBJECT: string;
    VAPID_PUBLIC_KEY?: string;
    VAPID_PRIVATE_KEY?: string;
    /** When set, creating a game needs this passphrase (joining never does). */
    CREATE_PASSPHRASE?: string;
}

type Attachment = Session & { lastSeen: number };

const MAX_SOCKETS_PER_GAME = 100;
const MAX_FRAME_CHARS = 16 * 1024;

const storageAdapter = (storage: DurableObjectStorage): RoomStorage => ({
    get: (key) => storage.get(key),
    put: (key, value) => storage.put(key, value),
    delete: async (key) => {
        await storage.delete(key);
    },
    list: (options) => storage.list(options),
    deleteAll: () => storage.deleteAll(),
});

const safeSend = (ws: WebSocket, message: ServerMessage) => {
    try {
        ws.send(JSON.stringify(message));
    } catch {
        // The socket closed underneath us; nothing to deliver to.
    }
};

const safeClose = (ws: WebSocket, code: number, reason: string) => {
    try {
        ws.close(code, reason);
    } catch {
        // Already closed.
    }
};

export class GameRoom extends DurableObject<Env> {
    private core: GameRoomCore;

    constructor(ctx: DurableObjectState, env: Env) {
        super(ctx, env);
        this.core = new GameRoomCore(storageAdapter(ctx.storage), {
            now: () => Date.now(),
        });
    }

    async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url);

        if (request.method === "POST" && url.pathname === "/create") {
            const { hiderKey } = (await request.json()) as {
                hiderKey: string;
            };
            try {
                const { expiresAt } = await this.core.create(hiderKey);
                await this.ctx.storage.setAlarm(expiresAt);
                return Response.json({ expiresAt });
            } catch {
                return new Response("exists", { status: 409 });
            }
        }

        if (request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
            if (this.ctx.getWebSockets().length >= MAX_SOCKETS_PER_GAME) {
                return new Response("busy", { status: 503 });
            }
            const pair = new WebSocketPair();
            const [client, server] = Object.values(pair);
            this.ctx.acceptWebSocket(server);
            server.serializeAttachment({
                authed: false,
                lastSeen: Date.now(),
            } satisfies Attachment);
            return new Response(null, { status: 101, webSocket: client });
        }

        return new Response("Not found", { status: 404 });
    }

    async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer) {
        const attachment =
            (ws.deserializeAttachment() as Attachment | null) ?? {
                authed: false,
                lastSeen: 0,
            };

        let parsed = null;
        if (typeof data === "string" && data.length <= MAX_FRAME_CHARS) {
            try {
                parsed = parseClientMessage(JSON.parse(data));
            } catch {
                parsed = null;
            }
        }
        if (!parsed) {
            safeSend(ws, {
                t: "error",
                code: "bad-request",
                message: "Malformed message",
            });
            return;
        }

        const session: Session = {
            authed: attachment.authed,
            role: attachment.role,
            deviceId: attachment.deviceId,
        };
        await this.apply(ws, await this.core.handle(session, parsed));
    }

    async webSocketClose(ws: WebSocket) {
        safeClose(ws, 1000, "bye");
    }

    async webSocketError(ws: WebSocket) {
        safeClose(ws, 1011, "error");
    }

    async alarm() {
        const result = await this.core.expire();
        if (result.wiped) {
            this.endEveryone(undefined);
        } else if (result.nextAlarm) {
            await this.ctx.storage.setAlarm(result.nextAlarm);
        }
    }

    /** Carries out what the core decided, in a fixed order. */
    private async apply(ws: WebSocket, outcome: Outcome) {
        ws.serializeAttachment({
            ...outcome.session,
            lastSeen: Date.now(),
        } satisfies Attachment);

        for (const frame of outcome.reply) safeSend(ws, frame);

        for (const { message, excludeDeviceId } of outcome.broadcast) {
            // On a wipe, everyone is told below instead, so nobody hears it twice.
            if (outcome.wipe && message.t === "ended") continue;
            this.broadcast(message, excludeDeviceId);
        }

        if (outcome.notify) {
            this.ctx.waitUntil(this.notify(outcome.notify));
        }
        if (outcome.pushTest && outcome.session.deviceId) {
            this.ctx.waitUntil(this.pushTest(ws, outcome.session.deviceId));
        }

        if (outcome.wipe) {
            this.endEveryone(ws);
            await this.ctx.storage.deleteAlarm();
            await this.ctx.storage.deleteAll();
            return;
        }

        if (outcome.close) {
            safeClose(ws, outcome.close.code, outcome.close.reason);
        }
    }

    private broadcast(message: ServerMessage, excludeDeviceId?: string) {
        for (const socket of this.ctx.getWebSockets()) {
            const attachment =
                socket.deserializeAttachment() as Attachment | null;
            if (!attachment?.authed) continue;
            if (excludeDeviceId && attachment.deviceId === excludeDeviceId) {
                continue;
            }
            safeSend(socket, message);
        }
    }

    /** Tells every socket the game is over (except `already`, which was told) and closes them. */
    private endEveryone(already: WebSocket | undefined) {
        for (const socket of this.ctx.getWebSockets()) {
            if (socket !== already) safeSend(socket, { t: "ended" });
            safeClose(socket, CLOSE.ended, "game ended");
        }
    }

    /** Devices heard from recently; they have the app open, so don't also push them. */
    private foregroundDevices(): Set<string> {
        const now = Date.now();
        const devices = new Set<string>();
        for (const socket of this.ctx.getWebSockets()) {
            const attachment =
                socket.deserializeAttachment() as Attachment | null;
            if (
                attachment?.authed &&
                attachment.deviceId &&
                now - attachment.lastSeen < FOREGROUND_WINDOW_MS
            ) {
                devices.add(attachment.deviceId);
            }
        }
        return devices;
    }

    private async notify(request: NotifyRequest) {
        const targets = await this.core.pushTargets(
            request.excludeDeviceId,
            this.foregroundDevices(),
        );
        await Promise.all(
            targets.map(async (target) => {
                const result = await sendWebPush(
                    target.subscription,
                    { k: request.kind, s: request.seq },
                    this.env,
                );
                if (result.gone) await this.core.dropPush(target.deviceId);
            }),
        );
    }

    private async pushTest(ws: WebSocket, deviceId: string) {
        const target = await this.core.pushTargetFor(deviceId);
        if (!target) {
            safeSend(ws, {
                t: "push-test",
                sent: 0,
                error: "This device has no push subscription yet",
            });
            return;
        }
        const result = await sendWebPush(
            target.subscription,
            { k: "test" },
            this.env,
        );
        if (result.gone) await this.core.dropPush(deviceId);
        safeSend(ws, {
            t: "push-test",
            sent: result.ok ? 1 : 0,
            ...(result.ok
                ? {}
                : { error: `Push service said ${result.status}` }),
        });
    }
}

// --- Stateless routing ------------------------------------------------------

const allowedOrigins = (env: Env) =>
    env.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim());

const corsHeaders = (
    origin: string | null,
    env: Env,
): Record<string, string> | null => {
    if (origin === null) return {};
    if (!allowedOrigins(env).includes(origin)) return null;
    return { "Access-Control-Allow-Origin": origin, Vary: "Origin" };
};

const json = (body: unknown, cors: Record<string, string>, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json", ...cors },
    });

const constantTimeEqual = (a: string, b: string): boolean => {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
        diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
};

const createGame = async (
    request: Request,
    env: Env,
    cors: Record<string, string>,
) => {
    if (env.CREATE_PASSPHRASE) {
        const supplied = request.headers.get("X-Create-Passphrase") ?? "";
        if (!constantTimeEqual(supplied, env.CREATE_PASSPHRASE)) {
            return json({ error: "bad-passphrase" }, cors, 401);
        }
    }

    for (let attempt = 0; attempt < 3; attempt++) {
        const code = generateGameCode();
        const hiderKey = generateHiderKey();
        const stub = env.GAME.get(env.GAME.idFromName(code));
        const response = await stub.fetch("https://game/create", {
            method: "POST",
            body: JSON.stringify({ hiderKey }),
        });
        if (response.status === 409) continue;
        if (!response.ok) break;
        const { expiresAt } = (await response.json()) as { expiresAt: number };
        return json({ code, hiderKey, expiresAt }, cors, 201);
    }
    return json({ error: "could-not-create" }, cors, 500);
};

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);
        const cors = corsHeaders(request.headers.get("Origin"), env);
        if (cors === null) return new Response("Forbidden", { status: 403 });

        if (request.method === "OPTIONS") {
            return new Response(null, {
                status: 204,
                headers: {
                    ...cors,
                    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                    "Access-Control-Allow-Headers":
                        "Content-Type, X-Create-Passphrase",
                    "Access-Control-Max-Age": "86400",
                },
            });
        }

        if (request.method === "GET" && url.pathname === "/health") {
            return json({ ok: true }, cors);
        }

        if (request.method === "GET" && url.pathname === "/config") {
            return json(
                {
                    protocol: PROTOCOL_VERSION,
                    vapidPublicKey: env.VAPID_PUBLIC_KEY ?? null,
                    passphraseRequired: !!env.CREATE_PASSPHRASE,
                },
                cors,
            );
        }

        if (request.method === "POST" && url.pathname === "/games") {
            return createGame(request, env, cors);
        }

        const match = /^\/games\/([^/]+)\/ws$/.exec(url.pathname);
        if (match) {
            const code = normalizeGameCode(decodeURIComponent(match[1]));
            if (!code) return new Response("Not found", { status: 404 });
            return env.GAME.get(env.GAME.idFromName(code)).fetch(request);
        }

        return new Response("Not found", { status: 404 });
    },
} satisfies ExportedHandler<Env>;
