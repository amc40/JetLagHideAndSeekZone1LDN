import { gameServerUrl, gameSession, pushTestResult } from "@/lib/game/store";
import { normalizeServerUrl, sendRaw } from "@/lib/game/sync";

/**
 * Web Push for the online game: lets a locked, pocketed phone be told that a
 * question arrived. The platform rules shape everything here:
 *
 * - iOS only offers push to web apps installed to the Home Screen (16.4+).
 *   In a Safari tab `PushManager` doesn't exist at all, which is why that case
 *   is reported as "needs-install" rather than "unsupported".
 * - Permission must be requested from a user gesture, so `enablePush` is only
 *   ever called from a button.
 * - Every failure mode here is otherwise silent, so each gets a reason the
 *   readiness check can show.
 */

export type PushSupport =
    | "supported"
    /** iOS in a browser tab: Add to Home Screen first. */
    | "needs-install"
    | "unsupported";

export type PushPermission = "granted" | "denied" | "default" | "unavailable";

export interface PushState {
    support: PushSupport;
    permission: PushPermission;
    subscribed: boolean;
}

const base64UrlToBytes = (value: string): Uint8Array => {
    const padded = value
        .replace(/-/g, "+")
        .replace(/_/g, "/")
        .padEnd(Math.ceil(value.length / 4) * 4, "=");
    return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
};

export const isIOS = (): boolean => {
    if (typeof navigator === "undefined") return false;
    // iPadOS reports itself as a Mac but has a touch screen.
    return (
        /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
    );
};

/** Running as an installed app (Home Screen / "Install app"), not in a browser tab. */
export const isStandalone = (): boolean => {
    if (typeof window === "undefined") return false;
    return (
        window.matchMedia?.("(display-mode: standalone)").matches === true ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true
    );
};

export const pushSupport = (): PushSupport => {
    if (typeof window === "undefined") return "unsupported";
    const capable =
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window;
    if (capable) return "supported";
    return isIOS() && !isStandalone() ? "needs-install" : "unsupported";
};

const permission = (): PushPermission =>
    typeof Notification === "undefined"
        ? "unavailable"
        : Notification.permission;

/** The active service worker registration, or null if there isn't one in time (e.g. dev builds). */
const registration = async (
    timeoutMs = 5000,
): Promise<ServiceWorkerRegistration | null> => {
    if (!("serviceWorker" in navigator)) return null;
    return Promise.race([
        navigator.serviceWorker.ready,
        new Promise<null>((resolve) =>
            setTimeout(() => resolve(null), timeoutMs),
        ),
    ]);
};

export const getPushState = async (): Promise<PushState> => {
    const support = pushSupport();
    if (support !== "supported") {
        return { support, permission: permission(), subscribed: false };
    }
    const reg = await registration(1500);
    const subscription = (await reg?.pushManager.getSubscription()) ?? null;
    return {
        support,
        permission: permission(),
        subscribed: subscription !== null,
    };
};

const serverBase = () =>
    normalizeServerUrl(gameSession.get()?.serverUrl ?? gameServerUrl.get());

const sameKey = (a: ArrayBuffer | null, b: Uint8Array): boolean => {
    if (!a || a.byteLength !== b.length) return false;
    const view = new Uint8Array(a);
    return view.every((byte, index) => byte === b[index]);
};

export type EnablePushResult = { ok: true } | { ok: false; reason: string };

/** Asks permission, subscribes, and registers the subscription with the game. Call from a tap. */
export const enablePush = async (): Promise<EnablePushResult> => {
    const support = pushSupport();
    if (support === "needs-install") {
        return {
            ok: false,
            reason: "On iPhone and iPad, add this app to your Home Screen first (Share, then Add to Home Screen), then open it from there.",
        };
    }
    if (support === "unsupported") {
        return {
            ok: false,
            reason: "This browser doesn't support push notifications. You'll still be notified while the app is open.",
        };
    }

    let vapidPublicKey: string | null;
    try {
        const response = await fetch(`${serverBase()}/config`);
        vapidPublicKey = (
            (await response.json()) as { vapidPublicKey: string | null }
        ).vapidPublicKey;
    } catch {
        return { ok: false, reason: "Couldn't reach the game server." };
    }
    if (!vapidPublicKey) {
        return {
            ok: false,
            reason: "The game server isn't set up for push notifications.",
        };
    }

    // Must happen straight after the tap, before any other slow work.
    const granted = await Notification.requestPermission();
    if (granted === "denied") {
        return {
            ok: false,
            reason: "Notifications are blocked. Allow them for this app in your device settings, then try again.",
        };
    }
    if (granted !== "granted") {
        return { ok: false, reason: "Notifications weren't allowed." };
    }

    const reg = await registration();
    if (!reg) {
        return {
            ok: false,
            reason: "The app's background worker isn't running (this happens in development builds).",
        };
    }

    const key = base64UrlToBytes(vapidPublicKey);
    let subscription = await reg.pushManager.getSubscription();
    // A server that rotated its key invalidates old subscriptions.
    if (
        subscription &&
        !sameKey(subscription.options.applicationServerKey, key)
    ) {
        await subscription.unsubscribe();
        subscription = null;
    }
    try {
        subscription ??= await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: key as BufferSource,
        });
    } catch (error) {
        return {
            ok: false,
            reason: `Couldn't subscribe to notifications (${error instanceof Error ? error.message : "unknown error"}).`,
        };
    }

    return registerSubscription(subscription)
        ? { ok: true }
        : {
              ok: false,
              reason: "Not connected to the game yet. Try again in a moment.",
          };
};

const registerSubscription = (subscription: PushSubscription): boolean => {
    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) return false;
    return sendRaw({
        t: "push-subscribe",
        subscription: {
            endpoint: json.endpoint,
            keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
        },
    });
};

/**
 * Re-registers an existing subscription with the game. Called each time the
 * connection comes up: push services rotate subscriptions, and a fresh game
 * has never heard of this device.
 */
export const refreshPushSubscription = async (): Promise<void> => {
    if (pushSupport() !== "supported" || permission() !== "granted") return;
    const reg = await registration(1500);
    const subscription = await reg?.pushManager.getSubscription();
    if (subscription) registerSubscription(subscription);
};

export const disablePush = async (): Promise<void> => {
    sendRaw({ t: "push-unsubscribe" });
    const reg = await registration(1500);
    await (await reg?.pushManager.getSubscription())?.unsubscribe();
};

/** Asks the server to send this device a real push, so "it works" is proven, not assumed. */
export const requestTestPush = (): boolean => {
    pushTestResult.set(null);
    return sendRaw({ t: "push-test" });
};
