import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({ sendRaw: vi.fn(() => true) }));

vi.mock("@/lib/game/sync", () => ({
    sendRaw: mocks.sendRaw,
    normalizeServerUrl: (url: string) => url.trim().replace(/\/+$/, ""),
}));

import {
    disablePush,
    enablePush,
    getPushState,
    isIOS,
    isStandalone,
    pushSupport,
    refreshPushSubscription,
    requestTestPush,
} from "@/lib/game/push";
import { gameServerUrl, gameSession, pushTestResult } from "@/lib/game/store";

// A recognisable VAPID public key (65 bytes: 0x04 then 64 bytes).
const bytes = (fill: number) =>
    Uint8Array.from({ length: 65 }, (_, i) => (i === 0 ? 4 : fill));
const toB64Url = (data: Uint8Array) => Buffer.from(data).toString("base64url");
const KEY = toB64Url(bytes(7));

interface Env {
    ios?: boolean;
    standalone?: boolean;
    hasPush?: boolean;
    permission?: NotificationPermission;
    requestResult?: NotificationPermission;
    existing?: ReturnType<typeof makeSub> | null;
    vapid?: string | null;
    swReady?: boolean;
}

const makeSub = (keyBytes: Uint8Array = bytes(7)) => ({
    toJSON: () => ({
        endpoint: "https://fcm.googleapis.com/fcm/send/abc",
        keys: { p256dh: "p256dh-value", auth: "auth-value" },
    }),
    options: { applicationServerKey: keyBytes.buffer.slice(0) as ArrayBuffer },
    unsubscribe: vi.fn(async () => true),
});

const setup = (env: Env = {}) => {
    const {
        ios = false,
        standalone = false,
        hasPush = true,
        permission = "default",
        requestResult = "granted",
        existing = null,
        vapid = KEY,
        swReady = true,
    } = env;

    const fresh = makeSub();
    const pushManager = {
        getSubscription: vi.fn(async () => existing),
        subscribe: vi.fn(async () => fresh),
    };
    const requestPermission = vi.fn(async () => requestResult);
    const NotificationStub = { permission, requestPermission };

    vi.stubGlobal("navigator", {
        userAgent: ios
            ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"
            : "Mozilla/5.0 (X11; Linux x86_64)",
        platform: ios ? "iPhone" : "Linux x86_64",
        maxTouchPoints: ios ? 5 : 0,
        standalone,
        ...(hasPush
            ? {
                  serviceWorker: {
                      ready: swReady
                          ? Promise.resolve({ pushManager })
                          : new Promise(() => {}),
                  },
              }
            : {}),
    });
    vi.stubGlobal("window", {
        ...(hasPush
            ? { PushManager: class {}, Notification: NotificationStub }
            : {}),
        matchMedia: () => ({ matches: standalone }),
    });
    if (hasPush) vi.stubGlobal("Notification", NotificationStub);
    vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({ json: async () => ({ vapidPublicKey: vapid }) })),
    );

    return { pushManager, requestPermission, fresh };
};

beforeEach(() => {
    mocks.sendRaw.mockClear();
    mocks.sendRaw.mockReturnValue(true);
    gameServerUrl.set("https://relay.test/");
    gameSession.set(null);
    pushTestResult.set(null);
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

describe("capability detection", () => {
    test("a desktop browser with push support is supported", () => {
        setup();
        expect(pushSupport()).toBe("supported");
        expect(isIOS()).toBe(false);
    });

    test("iPhone in a Safari tab has no PushManager: install first", () => {
        setup({ ios: true, hasPush: false });
        expect(isIOS()).toBe(true);
        expect(isStandalone()).toBe(false);
        expect(pushSupport()).toBe("needs-install");
    });

    test("the installed iPhone app is supported", () => {
        setup({ ios: true, standalone: true });
        expect(isStandalone()).toBe(true);
        expect(pushSupport()).toBe("supported");
    });

    test("an iPad that claims to be a Mac is still recognised as iOS", () => {
        setup({ hasPush: false });
        vi.stubGlobal("navigator", {
            userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
            platform: "MacIntel",
            maxTouchPoints: 5,
        });
        expect(isIOS()).toBe(true);
        expect(pushSupport()).toBe("needs-install");
    });

    test("a browser without push (not iOS) is simply unsupported", () => {
        setup({ hasPush: false });
        expect(pushSupport()).toBe("unsupported");
    });

    test("state reports permission and whether a subscription exists", async () => {
        setup({ permission: "granted", existing: makeSub() });
        expect(await getPushState()).toEqual({
            support: "supported",
            permission: "granted",
            subscribed: true,
        });
    });
});

describe("enablePush", () => {
    test("asks permission, subscribes with the server's key, and registers it", async () => {
        const { pushManager, requestPermission } = setup();

        expect(await enablePush()).toEqual({ ok: true });

        expect(fetch).toHaveBeenCalledWith("https://relay.test/config");
        expect(requestPermission).toHaveBeenCalledTimes(1);
        const options = (
            pushManager.subscribe.mock.calls[0] as unknown[]
        )[0] as {
            userVisibleOnly: boolean;
            applicationServerKey: Uint8Array;
        };
        expect(options.userVisibleOnly).toBe(true);
        expect(
            Buffer.from(options.applicationServerKey).equals(
                Buffer.from(bytes(7)),
            ),
        ).toBe(true);
        expect(mocks.sendRaw).toHaveBeenCalledWith({
            t: "push-subscribe",
            subscription: {
                endpoint: "https://fcm.googleapis.com/fcm/send/abc",
                keys: { p256dh: "p256dh-value", auth: "auth-value" },
            },
        });
    });

    test("uses the session's server over the typed-in one", async () => {
        setup();
        gameSession.set({
            serverUrl: "https://game.example",
            code: "K7QXM2PD9T",
            role: "seeker",
            lastSeq: 0,
        });
        await enablePush();
        expect(fetch).toHaveBeenCalledWith("https://game.example/config");
    });

    test("iPhone in a browser tab is told how to install, and nothing is requested", async () => {
        const { requestPermission } = setup({ ios: true, hasPush: false });

        const result = await enablePush();

        expect(result).toMatchObject({ ok: false });
        expect((result as { reason: string }).reason).toMatch(/Home Screen/);
        expect(requestPermission).not.toHaveBeenCalled();
        expect(fetch).not.toHaveBeenCalled();
    });

    test("an unsupported browser falls back to in-app alerts", async () => {
        setup({ hasPush: false });
        const result = await enablePush();
        expect((result as { reason: string }).reason).toMatch(
            /while the app is open/,
        );
    });

    test("a server without push keys is explained, before any prompt", async () => {
        const { requestPermission } = setup({ vapid: null });
        const result = await enablePush();
        expect((result as { reason: string }).reason).toMatch(/isn't set up/);
        expect(requestPermission).not.toHaveBeenCalled();
    });

    test("an unreachable server is explained", async () => {
        setup();
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => {
                throw new Error("offline");
            }),
        );
        const result = await enablePush();
        expect((result as { reason: string }).reason).toMatch(
            /reach the game server/,
        );
    });

    test("a denied permission explains how to fix it and does not subscribe", async () => {
        const { pushManager } = setup({ requestResult: "denied" });
        const result = await enablePush();
        expect((result as { reason: string }).reason).toMatch(/blocked/);
        expect(pushManager.subscribe).not.toHaveBeenCalled();
        expect(mocks.sendRaw).not.toHaveBeenCalled();
    });

    test("dismissing the prompt is reported", async () => {
        setup({ requestResult: "default" });
        const result = await enablePush();
        expect(result.ok).toBe(false);
    });

    test("an existing subscription with the same key is reused", async () => {
        const existing = makeSub(bytes(7));
        const { pushManager } = setup({ existing });
        expect(await enablePush()).toEqual({ ok: true });
        expect(pushManager.subscribe).not.toHaveBeenCalled();
        expect(existing.unsubscribe).not.toHaveBeenCalled();
    });

    test("a subscription made for a rotated server key is replaced", async () => {
        const stale = makeSub(bytes(9));
        const { pushManager } = setup({ existing: stale });
        expect(await enablePush()).toEqual({ ok: true });
        expect(stale.unsubscribe).toHaveBeenCalledTimes(1);
        expect(pushManager.subscribe).toHaveBeenCalledTimes(1);
    });

    test("not being connected to a game yet is reported rather than silently lost", async () => {
        setup();
        mocks.sendRaw.mockReturnValue(false);
        const result = await enablePush();
        expect(result.ok).toBe(false);
        expect((result as { reason: string }).reason).toMatch(/Not connected/);
    });

    test("a service worker that never starts is reported", async () => {
        vi.useFakeTimers();
        setup({ swReady: false });
        const pending = enablePush();
        await vi.advanceTimersByTimeAsync(5000);
        const result = await pending;
        expect((result as { reason: string }).reason).toMatch(
            /background worker/,
        );
    });
});

describe("keeping the server's copy fresh", () => {
    test("refresh re-registers an existing subscription", async () => {
        setup({ permission: "granted", existing: makeSub() });
        await refreshPushSubscription();
        expect(mocks.sendRaw).toHaveBeenCalledTimes(1);
    });

    test("refresh does nothing without permission or a subscription", async () => {
        setup({ permission: "default", existing: makeSub() });
        await refreshPushSubscription();
        setup({ permission: "granted", existing: null });
        await refreshPushSubscription();
        expect(mocks.sendRaw).not.toHaveBeenCalled();
    });

    test("disabling unsubscribes locally and tells the server", async () => {
        const existing = makeSub();
        setup({ permission: "granted", existing });
        await disablePush();
        expect(mocks.sendRaw).toHaveBeenCalledWith({ t: "push-unsubscribe" });
        expect(existing.unsubscribe).toHaveBeenCalledTimes(1);
    });

    test("a test push clears the previous result and asks the server", () => {
        pushTestResult.set({ sent: 1, at: 1 });
        expect(requestTestPush()).toBe(true);
        expect(pushTestResult.get()).toBeNull();
        expect(mocks.sendRaw).toHaveBeenCalledWith({ t: "push-test" });
    });
});
