import { useStore } from "@nanostores/react";
import { useEffect } from "react";

import { refreshPushSubscription } from "@/lib/game/push";
import {
    connectionStatus,
    gameSession,
    keepScreenOn,
    onlineEnabled,
} from "@/lib/game/store";
import {
    resumeGameConnection,
    startGameConnection,
    stopGameConnection,
} from "@/lib/game/sync";

/**
 * Renders nothing; owns the online game's lifecycle. Mount it once.
 *
 * It (re)connects when the stored session or the kill switch changes, and
 * checks the socket whenever the page comes back to the foreground: a phone
 * that was locked has usually lost it without being told.
 */
export const OnlineGameController = () => {
    const session = useStore(gameSession);
    const enabled = useStore(onlineEnabled);
    const status = useStore(connectionStatus);
    const wantWakeLock = useStore(keepScreenOn);

    const serverUrl = session?.serverUrl;
    const code = session?.code;
    const role = session?.role;
    const hiderKey = session?.hiderKey;
    const hasSession = session !== null;

    useEffect(() => {
        startGameConnection();
        return () => stopGameConnection();
    }, [serverUrl, code, role, hiderKey, enabled]);

    useEffect(() => {
        const resume = () => {
            if (document.visibilityState === "visible") resumeGameConnection();
        };
        const onServiceWorkerMessage = (event: MessageEvent) => {
            if (event.data?.type === "game-resume") resumeGameConnection();
        };

        document.addEventListener("visibilitychange", resume);
        window.addEventListener("online", resume);
        window.addEventListener("pageshow", resume);
        navigator.serviceWorker?.addEventListener(
            "message",
            onServiceWorkerMessage,
        );
        return () => {
            document.removeEventListener("visibilitychange", resume);
            window.removeEventListener("online", resume);
            window.removeEventListener("pageshow", resume);
            navigator.serviceWorker?.removeEventListener(
                "message",
                onServiceWorkerMessage,
            );
        };
    }, []);

    // Push services rotate subscriptions, and a new game has never heard of
    // this device, so re-register whenever the connection comes up.
    useEffect(() => {
        if (status.status === "online") void refreshPushSubscription();
    }, [status.status]);

    useEffect(() => {
        if (!wantWakeLock || !hasSession || !enabled) return;
        if (!("wakeLock" in navigator)) return;

        let sentinel: WakeLockSentinel | null = null;
        const acquire = async () => {
            try {
                sentinel = await navigator.wakeLock.request("screen");
            } catch {
                // Denied, or the device is in low-power mode.
            }
        };
        // The browser drops the lock whenever the page is hidden.
        const onVisible = () => {
            if (document.visibilityState === "visible") void acquire();
        };

        void acquire();
        document.addEventListener("visibilitychange", onVisible);
        return () => {
            document.removeEventListener("visibilitychange", onVisible);
            void sentinel?.release();
        };
    }, [wantWakeLock, hasSession, enabled]);

    return null;
};
