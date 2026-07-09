---
name: vendor-offline-libraries
description: Audit this repo for third-party library assets (fonts, WASM, worker scripts, icons) fetched live from a CDN at runtime, and self-host the essential ones so the PWA keeps working offline — generalizing the pattern already used for @arcgis/core's geodesic engine.
---

This app is a PWA (`@vite-pwa/astro`, see `src/pwa.ts`) that's meant to keep working with no network. A library that quietly fetches its own assets from a CDN at runtime breaks that promise even if the rest of the app is offline-ready — the failure only shows up when someone actually goes offline, which is easy to miss in normal dev/testing. This skill is the tool for finding and closing those gaps, one library at a time.

**The existing template to copy**: `@arcgis/core` fetches its geodesic engine (WASM, workers, locales) from Esri's CDN by default. This repo vendors it instead:

- `scripts/copy-arcgis-assets.mjs` copies the WASM file from `node_modules/@arcgis/core/assets/...` into `public/arcgis-assets/...` at `pnpm dev`/`pnpm build` time (wired into `package.json`'s `dev`/`build` scripts as a pre-step)
- `src/pwa.ts` points `esriConfig.assetsPath` at `${BASE_URL}/arcgis-assets` instead of the Esri CDN default
- `astro.config.mjs` adds the asset to the PWA precache manually via `additionalManifestEntries` (with an MD5 revision hash), because Workbox's default `globPatterns` for `generateSW` don't cover `.wasm` — read `arcgisWasmPath`/`additionalManifestEntries` there for the exact shape to copy

Every step below is that same four-part pattern (copy → repoint → precache → verify) applied to a different library.

## 1. Find candidates

Grep for things that indicate a live network fetch of a library's own assets, not user data:

- Hardcoded external hosts in markup/config: `grep -rniE "https?://[a-z0-9.-]*\.(googleapis|gstatic|jsdelivr|unpkg|cloudflare|jsdelivr)\.[a-z]+" src/ astro.config.mjs` — check `src/layouts/Layout.astro`'s `<head>` particularly, it's the usual home for `<link>`/`<script>` tags pulling in fonts or third-party widgets
- Library config options that default to a CDN, analogous to `esriConfig.assetsPath` — check the docs/types of any mapping or geometry library (`@arcgis/core`, `leaflet` plugins) for an `assetsPath`/`iconUrl`/`workerUrl`-shaped option
- Dynamic `import()` or `new Worker(...)` calls with an absolute URL instead of a bundled path

For each hit, don't assume it needs vendoring — sort into:

- **Essential**: blocks or visibly degrades core functionality when offline (fonts, a geometry engine, marker icons the map can't render without). Vendor these.
- **Non-essential / analytics**: `googletagmanager.com`, `clarity.ms`, and similar — these already fail silently offline (they're loaded via `partytown` or plain `<script>` with no app logic depending on the result) and aren't part of the offline-critical path. Leave them alone; vendoring third-party analytics scripts is a maintenance burden with no user-facing benefit here.

## 2. Get the real asset files

Prefer files the npm package already ships in `node_modules` (like the ArcGIS WASM file) over re-downloading from the CDN — they're guaranteed to match the installed version and need no network access to obtain. Write a small `scripts/copy-<lib>-assets.mjs` (`node:fs`'s `cpSync`/`mkdirSync`, see `copy-arcgis-assets.mjs`) that copies from `node_modules/<pkg>/...` into `public/<lib>-assets/...`, and add it as a pre-step in `package.json`'s `dev`/`build` scripts alongside `copy:arcgis-assets`.

If the asset isn't shipped in the npm package (e.g. Google Fonts — the font files live on Google's server, not in any installed package), download it once with a real browser-like `Accept`/`User-Agent` header (Google Fonts serves `.woff2` only to modern-looking clients) and commit the downloaded files directly to `public/` rather than re-fetching on every build.

## 3. Repoint the app at the local copy

- If the library exposes a base-path config option (`esriConfig.assetsPath`), set it to `${import.meta.env.BASE_URL}/<lib>-assets` — see `src/pwa.ts`. Remember this repo deploys under a non-root base path (`base` in `astro.config.mjs`), so hardcoding `/`-rooted paths without `BASE_URL` breaks on GitHub Pages even though it works in local dev.
- If it's a CDN `<link>`/`<script>` tag with no config knob (e.g. a Google Fonts stylesheet), generate the equivalent local asset yourself — for fonts, write a `@font-face` CSS file pointing at the vendored `.woff2` files and swap the Google Fonts `<link rel="stylesheet">` for a local one, dropping the now-unnecessary `preconnect` hints to that host.

## 4. Add it to the PWA precache

Workbox's `generateSW` default `globPatterns` only cover common web asset extensions — anything unusual (`.wasm`, often `.woff2` depending on config) needs an explicit entry. Follow the `arcgisWasmPath`/`additionalManifestEntries` block in `astro.config.mjs` exactly: compute an MD5 hash of the file's contents with `node:crypto`, and push `{ url, revision }` into `additionalManifestEntries`. Gate it with `existsSync` the same way, so a fresh checkout that hasn't run the copy script yet doesn't crash the Astro config.

## 5. Verify it's actually offline-safe

- `pnpm build && pnpm preview`
- Open the built app in a browser, let the service worker install, then go offline (DevTools → Application → Service Workers → "Offline", or Network tab → Offline) and hard-reload
- Confirm the previously-CDN-hosted asset still loads (fonts render correctly, the map/geometry feature that depended on it still works) and that DevTools' Network tab shows no attempted request to the original external host
- Run `pnpm lint` / `pnpm typecheck` if you touched TypeScript/config files

## Known gap not yet fixed

`src/layouts/Layout.astro` loads Oxygen/Poppins live from `fonts.googleapis.com`/`fonts.gstatic.com` — tracked in `TODO.md` ("Self-host Google Fonts for offline use") rather than a GitHub issue, since Issues are disabled on this repo. This is the natural first thing to run this skill on.
