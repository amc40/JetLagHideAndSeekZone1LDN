import { toast } from "react-toastify";

import {
    hiderMode,
    hiderStaticByDefault,
    questionModified,
    questions,
} from "@/lib/context";
import { describeQuestion } from "@/lib/describeQuestion";
import {
    GameConnection,
    type GameConnectionOptions,
} from "@/lib/game/connection";
import {
    type MessageKind,
    normalizeGameCode,
    type ServerMessage,
} from "@/lib/game/protocol";
import {
    connectionStatus,
    createPassphrase,
    ensureDeviceId,
    gameServerUrl,
    type GameSession,
    gameSession,
    onlineEnabled,
    outbox,
    pushTestResult,
    questionSync,
    syncKey,
    unreadableMessages,
    zoneNoticeAt,
} from "@/lib/game/store";
import {
    answerQuestionAsHider,
    getHiderAnswerLocation,
} from "@/lib/hiderAnswer";
import { mergeIncomingQuestion } from "@/lib/mergeQuestion";
import { type Question, questionSchema } from "@/maps/schema";

/**
 * Orchestration for the online game.
 *
 * The invariant that makes the copy/paste fallback lossless: every action
 * commits to the local `questions` list first and only then queues a message,
 * and every received message goes through the same `mergeIncomingQuestion`
 * the paste button uses. The server never holds anything this device lacks.
 */

let connection: GameConnection | null = null;
let connectionFactory = (options: GameConnectionOptions) =>
    new GameConnection(options);
/** Outbox entries sent on this socket and awaiting their ack. */
const inFlight = new Set<string>();
let rateLimitRetry: ReturnType<typeof setTimeout> | undefined;

/** Test seam: swap in a fake connection. */
export const setConnectionFactoryForTests = (
    factory: typeof connectionFactory,
) => {
    connectionFactory = factory;
};

const newMessageId = () =>
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export const normalizeServerUrl = (url: string) =>
    url.trim().replace(/\/+$/, "");

const socketUrl = (session: GameSession) =>
    `${normalizeServerUrl(session.serverUrl).replace(/^http/, "ws")}/games/${session.code}/ws`;

// --- Connection lifecycle ---------------------------------------------------

/** (Re)starts the connection for the stored session, if online play is on. */
export const startGameConnection = () => {
    stopGameConnection();
    const session = gameSession.get();
    if (!session || !onlineEnabled.get()) return;

    connection = connectionFactory({
        url: socketUrl(session),
        deviceId: ensureDeviceId(),
        role: session.role,
        hiderKey: session.hiderKey,
        getSince: () => gameSession.get()?.lastSeq ?? 0,
        onStatus: (status, detail) => connectionStatus.set({ status, detail }),
        onFrame: handleFrame,
    });
    connection.start();
};

export const stopGameConnection = () => {
    connection?.stop();
    connection = null;
    inFlight.clear();
    if (rateLimitRetry !== undefined) {
        clearTimeout(rateLimitRetry);
        rateLimitRetry = undefined;
    }
    connectionStatus.set({ status: "idle" });
};

/** For visibilitychange / online events. */
export const resumeGameConnection = () => connection?.resume();

/** Sends a raw client frame (push subscription etc.). False if offline. */
export const sendRaw = (
    frame: Parameters<GameConnection["send"]>[0],
): boolean => connection?.send(frame) ?? false;

// --- Outbox -----------------------------------------------------------------

const enqueue = (kind: MessageKind, payload: string) => {
    outbox.set([
        ...outbox.get(),
        { id: newMessageId(), kind, payload, queuedAt: Date.now() },
    ]);
    flushOutbox();
};

export const flushOutbox = () => {
    if (!connection) return;
    for (const entry of outbox.get()) {
        if (inFlight.has(entry.id)) continue;
        const sent = connection.send({
            t: "send",
            id: entry.id,
            kind: entry.kind,
            payload: entry.payload,
        });
        if (!sent) return;
        inFlight.add(entry.id);
    }
};

const removeFromOutbox = (id: string) => {
    inFlight.delete(id);
    outbox.set(outbox.get().filter((entry) => entry.id !== id));
};

// --- Incoming frames --------------------------------------------------------

const handleFrame = (frame: ServerMessage) => {
    switch (frame.t) {
        case "msg":
            handleIncoming(frame);
            break;

        case "ready": {
            const session = gameSession.get();
            if (session) {
                // `head` is authoritative: even if the server lost state and
                // it is lower than our cursor, from here we are in step.
                gameSession.set({
                    ...session,
                    lastSeq: frame.head,
                    expiresAt: frame.expiresAt,
                });
            }
            // A new socket has no in-flight sends; resend anything unacked.
            // The server de-duplicates by id, so this is always safe.
            inFlight.clear();
            flushOutbox();
            break;
        }

        case "sent":
            removeFromOutbox(frame.id);
            break;

        case "push-test":
            pushTestResult.set({
                sent: frame.sent,
                error: frame.error,
                at: Date.now(),
            });
            break;

        case "error":
            handleError(frame);
            break;

        case "ended":
            toast.info("This game has ended", { autoClose: 4000 });
            break;
    }
};

const handleError = (frame: Extract<ServerMessage, { t: "error" }>) => {
    if (!frame.id) return;

    if (frame.code === "rate-limited") {
        // Keep it queued and try again shortly.
        inFlight.delete(frame.id);
        rateLimitRetry ??= setTimeout(() => {
            rateLimitRetry = undefined;
            flushOutbox();
        }, 30_000);
        return;
    }

    // The server will never accept this one; retrying would loop forever.
    removeFromOutbox(frame.id);
    toast.error(
        `Couldn't send that over the server (${frame.message}). Use Share question instead.`,
    );
};

const setSync = (question: Question, state: "asked" | "answered") => {
    const key = syncKey(question);
    const current = questionSync.get()[key];
    // Never walk backwards: a replayed "ask" must not undo an answer.
    if (current === "answered" || current === state) return;
    questionSync.set({ ...questionSync.get(), [key]: state });
};

const handleIncoming = (frame: Extract<ServerMessage, { t: "msg" }>) => {
    advanceCursor(frame.seq);

    if (frame.kind === "zone-notice") {
        zoneNoticeAt.set(frame.at);
        vibrate();
        toast.warning("The hider says you're in their zone!", {
            autoClose: false,
        });
        return;
    }

    let question: Question;
    try {
        question = questionSchema.parse(JSON.parse(frame.payload));
    } catch {
        // Keep the raw payload: it is the same JSON the paste flow uses, so
        // it can still be copied out and pasted into a newer build.
        unreadableMessages.set(
            [
                ...unreadableMessages.get(),
                {
                    seq: frame.seq,
                    kind: frame.kind,
                    from: frame.from,
                    at: frame.at,
                    payload: frame.payload,
                },
            ].slice(-20),
        );
        toast.error(
            "Received a question this version of the app can't read. Update the app; the message was saved.",
        );
        return;
    }

    // Same defaults as a pasted question.
    question.data.hiderStatic ??= hiderStaticByDefault.get();
    // The server's `kind` is the truth about whether this is settled, so a
    // mislabelled payload can't masquerade as the other thing.
    question.data.drag = frame.kind === "ask";

    const outcome = mergeIncomingQuestion(question);
    setSync(question, frame.kind === "ask" ? "asked" : "answered");

    if (frame.kind === "ask" && outcome === "added") {
        vibrate();
        toast.info(`Seekers asked: ${describeQuestion(question).prompt}`, {
            autoClose: 8000,
        });
    } else if (frame.kind === "answer" && outcome !== "skipped") {
        vibrate();
        const { prompt, answer } = describeQuestion(question);
        toast.success(`Hider answered: ${prompt} ${answer}`, {
            autoClose: 8000,
        });
    }
};

const advanceCursor = (seq: number) => {
    const session = gameSession.get();
    if (session && seq > session.lastSeq) {
        gameSession.set({ ...session, lastSeq: seq });
    }
};

const vibrate = () => {
    try {
        navigator.vibrate?.(200);
    } catch {
        // Not supported (iOS) or not allowed.
    }
};

// --- Actions ----------------------------------------------------------------

const findQuestion = (id: Question["id"], key: number) =>
    questions.get().find((q) => q.id === id && q.key === key);

/** Seeker: send a local draft to the hider. The question stays on the map. */
export const askQuestion = (
    id: Question["id"],
    key: number,
): "queued" | "already-asked" | "not-found" => {
    const question = findQuestion(id, key);
    if (!question) return "not-found";
    if (questionSync.get()[syncKey(question)]) return "already-asked";

    // The hider can only answer an unlocked question, so always send it unlocked.
    const outgoing: Question = structuredClone(question);
    outgoing.data.drag = true;

    setSync(question, "asked");
    enqueue("ask", JSON.stringify(outgoing));
    return "queued";
};

/** Hider: answer from where the device is now, then send the settled answer. */
export const answerQuestion = async (
    id: Question["id"],
    key: number,
): Promise<boolean> => {
    const question = findQuestion(id, key);
    if (!question || !question.data.drag) return false;

    try {
        const location = await getHiderAnswerLocation();
        // With neither a live position nor a saved hiding station, hiderify
        // leaves the default answer untouched, which we would then lock and
        // send as if it were real. Refuse instead.
        if (!location && hiderMode.get() === false) {
            toast.error(
                "No location to answer from. Turn on Hider mode in Options (or Follow Me) first.",
            );
            return false;
        }
        // Re-find: the list may have changed while we waited for GPS.
        const current = findQuestion(id, key);
        if (!current || !current.data.drag) return false;

        await answerQuestionAsHider(current, location);
        questionModified(current);
    } catch (error) {
        console.error("Failed to answer question", error);
        toast.error("Couldn't work out the answer. Try again, or use paste.");
        return false;
    }

    const answered = findQuestion(id, key);
    if (!answered) return false;
    setSync(answered, "answered");
    enqueue("answer", JSON.stringify(answered));
    return true;
};

/** Hider: tell the seekers they are in the zone (the hider-confirmed alert). */
export const sendZoneNotice = () => {
    enqueue("zone-notice", JSON.stringify({ at: Date.now() }));
};

/** Hider: wipe the game from the server for everyone. */
export const endGame = () => sendRaw({ t: "end" });

// --- Game setup -------------------------------------------------------------

export const createGame = async (): Promise<void> => {
    const serverUrl = normalizeServerUrl(gameServerUrl.get());
    if (!serverUrl) throw new Error("Enter the game server address first");

    const passphrase = createPassphrase.get();
    const response = await fetch(`${serverUrl}/games`, {
        method: "POST",
        headers: passphrase ? { "X-Create-Passphrase": passphrase } : {},
    });
    if (response.status === 401) {
        throw new Error("That server passphrase is wrong");
    }
    if (!response.ok) {
        throw new Error(
            `The server couldn't create a game (${response.status})`,
        );
    }

    const { code, hiderKey, expiresAt } = (await response.json()) as {
        code: string;
        hiderKey: string;
        expiresAt: number;
    };
    resetGameLocalState();
    gameSession.set({
        serverUrl,
        code,
        role: "hider",
        hiderKey,
        lastSeq: 0,
        expiresAt,
    });
    startGameConnection();
};

/** Join as a seeker with just the code, or as the hider with the hider key too. */
export const joinGame = (rawCode: string, hiderKey?: string): void => {
    const serverUrl = normalizeServerUrl(gameServerUrl.get());
    if (!serverUrl) throw new Error("Enter the game server address first");

    const code = normalizeGameCode(rawCode);
    if (!code) throw new Error("That doesn't look like a game code");

    resetGameLocalState();
    gameSession.set({
        serverUrl,
        code,
        role: hiderKey?.trim() ? "hider" : "seeker",
        hiderKey: hiderKey?.trim() || undefined,
        lastSeq: 0,
    });
    startGameConnection();
};

/** Leave locally. The questions stay; only the connection and sync state go. */
export const leaveGame = () => {
    stopGameConnection();
    gameSession.set(null);
    resetGameLocalState();
};

const resetGameLocalState = () => {
    outbox.set([]);
    questionSync.set({});
    unreadableMessages.set([]);
    zoneNoticeAt.set(null);
    pushTestResult.set(null);
};
