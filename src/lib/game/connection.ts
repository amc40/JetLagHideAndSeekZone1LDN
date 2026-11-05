import {
    type ClientMessage,
    type ErrorCode,
    type GameRole,
    HEARTBEAT_INTERVAL_MS,
    PROTOCOL_VERSION,
    type ServerMessage,
} from "@/lib/game/protocol";

export type ConnectionStatus =
    /** Not connected and not trying to be. */
    | "idle"
    /** Opening a socket / authenticating. */
    | "connecting"
    | "online"
    /** Between attempts, backing off. */
    | "waiting"
    /** Will not reconnect: wrong code, wrong key, outdated app. */
    | "failed"
    /** The game ended or expired. */
    | "ended";

/** The slice of WebSocket that the connection needs (and that tests fake). */
export interface SocketLike {
    readyState: number;
    send(data: string): void;
    close(code?: number, reason?: string): void;
    addEventListener(
        type: "open" | "message" | "close" | "error",
        listener: (event: { data?: unknown }) => void,
    ): void;
}

const SOCKET_OPEN = 1;
const MAX_BACKOFF_MS = 30_000;
/** Errors that retrying cannot fix. */
const FATAL_ERRORS: ReadonlySet<ErrorCode> = new Set([
    "no-such-game",
    "unauthorized",
    "version",
    "game-ended",
]);

export interface GameConnectionOptions {
    url: string;
    deviceId: string;
    role: GameRole;
    hiderKey?: string;
    /** Highest seq already processed; asked for at every (re)connect. */
    getSince: () => number;
    onStatus: (status: ConnectionStatus, detail?: string) => void;
    /** Every server frame, in order (replay frames arrive before `ready`). */
    onFrame: (frame: ServerMessage) => void;
    socketFactory?: (url: string) => SocketLike;
}

/**
 * One authenticated WebSocket to a game room that survives the realities of a
 * phone in someone's pocket: sockets that die silently when the OS suspends
 * the page, flaky mobile networks, and servers that restart.
 *
 * It owns reconnection and liveness only. What the frames mean, and what to
 * resend after a reconnect, is the caller's business (see `sync.ts`).
 */
export class GameConnection {
    private socket: SocketLike | null = null;
    private status: ConnectionStatus = "idle";
    /** Bumped on every (re)open so events from a superseded socket are ignored. */
    private generation = 0;
    private attempt = 0;
    private stopped = true;
    private retryTimer: ReturnType<typeof setTimeout> | undefined;
    private heartbeatTimer: ReturnType<typeof setInterval> | undefined;
    private lastFrameAt = 0;

    constructor(private options: GameConnectionOptions) {}

    start() {
        this.stopped = false;
        this.attempt = 0;
        this.open();
    }

    stop() {
        this.stopped = true;
        this.teardown();
        this.setStatus("idle");
    }

    /** Sends a frame if the socket is up. Returns whether it was sent. */
    send(frame: ClientMessage): boolean {
        if (
            this.status !== "online" ||
            !this.socket ||
            this.socket.readyState !== SOCKET_OPEN
        ) {
            return false;
        }
        this.socket.send(JSON.stringify(frame));
        return true;
    }

    /**
     * Call when the page becomes visible again or the network returns. A phone
     * that was locked has almost certainly lost its socket without being told,
     * so verify it, and skip any backoff wait.
     */
    resume() {
        if (
            this.stopped ||
            this.status === "failed" ||
            this.status === "ended"
        ) {
            return;
        }
        if (this.status === "online") {
            if (this.isStale(1.5)) {
                this.reconnectNow();
            } else {
                this.send({ t: "ping" });
            }
            return;
        }
        this.reconnectNow();
    }

    private open() {
        const generation = ++this.generation;
        this.setStatus("connecting");

        let socket: SocketLike;
        try {
            socket = (this.options.socketFactory ?? defaultSocketFactory)(
                this.options.url,
            );
        } catch {
            this.scheduleRetry();
            return;
        }
        this.socket = socket;

        socket.addEventListener("open", () => {
            if (generation !== this.generation) return;
            this.lastFrameAt = Date.now();
            socket.send(
                JSON.stringify({
                    t: "auth",
                    v: PROTOCOL_VERSION,
                    role: this.options.role,
                    deviceId: this.options.deviceId,
                    hiderKey: this.options.hiderKey,
                    since: this.options.getSince(),
                } satisfies ClientMessage),
            );
        });

        socket.addEventListener("message", (event) => {
            if (generation !== this.generation) return;
            this.lastFrameAt = Date.now();
            let frame: ServerMessage;
            try {
                frame = JSON.parse(String(event.data)) as ServerMessage;
            } catch {
                return;
            }
            this.handleFrame(frame);
        });

        socket.addEventListener("close", () => {
            if (generation !== this.generation) return;
            this.socket = null;
            this.stopHeartbeat();
            if (this.stopped || this.isTerminal()) return;
            this.scheduleRetry();
        });

        // A failed connection also fires `close`, which handles the retry.
        socket.addEventListener("error", () => {});
    }

    private handleFrame(frame: ServerMessage) {
        switch (frame.t) {
            case "ready":
                this.attempt = 0;
                this.setStatus("online");
                this.startHeartbeat();
                break;
            case "error":
                if (FATAL_ERRORS.has(frame.code)) {
                    this.setStatus(
                        frame.code === "game-ended" ? "ended" : "failed",
                        frame.message,
                    );
                    this.stopHeartbeat();
                }
                break;
            case "ended":
                this.setStatus("ended", "The game has ended");
                this.stopHeartbeat();
                break;
        }
        this.options.onFrame(frame);
    }

    private isTerminal() {
        return this.status === "failed" || this.status === "ended";
    }

    private isStale(heartbeats: number) {
        return (
            Date.now() - this.lastFrameAt > HEARTBEAT_INTERVAL_MS * heartbeats
        );
    }

    private startHeartbeat() {
        this.stopHeartbeat();
        this.heartbeatTimer = setInterval(() => {
            // Any frame counts as proof of life, a pong included. A socket
            // that has gone quiet for this long is a zombie.
            if (this.isStale(2.5)) {
                this.reconnectNow();
            } else {
                this.send({ t: "ping" });
            }
        }, HEARTBEAT_INTERVAL_MS);
    }

    private stopHeartbeat() {
        if (this.heartbeatTimer !== undefined) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = undefined;
        }
    }

    private scheduleRetry() {
        const base = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** this.attempt);
        const delay = Math.round(base * (0.5 + Math.random() * 0.5));
        this.attempt++;
        this.setStatus(
            "waiting",
            `Reconnecting in ${Math.ceil(delay / 1000)}s`,
        );
        this.retryTimer = setTimeout(() => {
            this.retryTimer = undefined;
            if (!this.stopped) this.open();
        }, delay);
    }

    private reconnectNow() {
        this.teardown();
        this.attempt = 0;
        this.open();
    }

    /** Drops the socket and timers without touching `stopped` or the status. */
    private teardown() {
        this.generation++;
        this.stopHeartbeat();
        if (this.retryTimer !== undefined) {
            clearTimeout(this.retryTimer);
            this.retryTimer = undefined;
        }
        const socket = this.socket;
        this.socket = null;
        try {
            socket?.close(1000, "client closing");
        } catch {
            // Already closed.
        }
    }

    private setStatus(status: ConnectionStatus, detail?: string) {
        this.status = status;
        this.options.onStatus(status, detail);
    }
}

const defaultSocketFactory = (url: string): SocketLike =>
    new WebSocket(url) as unknown as SocketLike;
