// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import esriConfig from "@arcgis/core/config.js";
import { registerSW } from "virtual:pwa-register";

// By default @arcgis/core fetches its geodesic engine assets (WASM, workers,
// locales) from Esri's CDN at runtime, which doesn't work offline. Serve them
// from this origin instead - see scripts/copy-arcgis-assets.mjs.
esriConfig.assetsPath = `${import.meta.env.BASE_URL}/arcgis-assets`;

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

registerSW({
    immediate: true,
    onRegisteredSW(swScriptUrl, registration) {
        console.log("SW registered: ", swScriptUrl);

        // registerType: "autoUpdate" only checks for a new service worker
        // when this one registers (i.e. on page load), so a tab left open
        // across a deploy won't otherwise notice it. Poll periodically so
        // long-lived tabs still pick up new deploys.
        if (registration) {
            setInterval(() => {
                registration.update();
            }, UPDATE_CHECK_INTERVAL_MS);
        }
    },
    onOfflineReady() {
        console.log("PWA application ready to work offline");
    },
});
