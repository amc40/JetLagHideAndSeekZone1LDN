/*
 * Web Push handlers for the online game. Imported into the generated Workbox
 * service worker (see `importScripts` in astro.config.mjs), which cannot be
 * hand-edited.
 *
 * Payloads are deliberately content-free ({ k: kind, s: seq }): the lock screen
 * says that something happened, and the app fetches what it was when opened.
 *
 * iOS requires every push to show a notification, so this handler always does,
 * even if the payload cannot be parsed.
 */
const COPY = {
    ask: {
        title: "New question",
        body: "The seekers have asked a question. Open the app to answer.",
    },
    answer: {
        title: "Question answered",
        body: "The hider has answered a question.",
    },
    "zone-notice": {
        title: "You're in the zone!",
        body: "The hider says you've entered their hiding zone.",
        requireInteraction: true,
    },
    test: {
        title: "Notifications are working",
        body: "You'll be alerted like this during the game.",
    },
    fallback: {
        title: "Hide and Seek",
        body: "Something happened in your game. Open the app.",
    },
};

self.addEventListener("push", (event) => {
    let payload = {};
    try {
        payload = event.data ? event.data.json() : {};
    } catch {
        payload = {};
    }

    const copy = COPY[payload.k] ?? COPY.fallback;
    event.waitUntil(
        self.registration.showNotification(copy.title, {
            body: copy.body,
            icon: `${self.registration.scope}android-chrome-192x192.png`,
            // Distinct tags so two questions are two notifications.
            tag: `jlhs-${payload.k ?? "event"}-${payload.s ?? Date.now()}`,
            requireInteraction: copy.requireInteraction === true,
            data: { kind: payload.k ?? null },
        }),
    );
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    event.waitUntil(
        (async () => {
            const windows = await self.clients.matchAll({
                type: "window",
                includeUncontrolled: true,
            });
            const existing = windows.find((client) =>
                client.url.startsWith(self.registration.scope),
            );
            if (existing) {
                await existing.focus();
                // The app resyncs on focus; this nudges it if it was frozen.
                existing.postMessage({ type: "game-resume" });
                return;
            }
            await self.clients.openWindow(self.registration.scope);
        })(),
    );
});
