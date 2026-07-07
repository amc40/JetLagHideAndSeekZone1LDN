// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import esriConfig from "@arcgis/core/config.js";
import { registerSW } from "virtual:pwa-register";

// By default @arcgis/core fetches its geodesic engine assets (WASM, workers,
// locales) from Esri's CDN at runtime, which doesn't work offline. Serve them
// from this origin instead - see scripts/copy-arcgis-assets.mjs.
esriConfig.assetsPath = `${import.meta.env.BASE_URL}/arcgis-assets`;

registerSW({
    immediate: true,
    onRegisteredSW(swScriptUrl) {
        console.log("SW registered: ", swScriptUrl);
    },
    onOfflineReady() {
        console.log("PWA application ready to work offline");
    },
});
