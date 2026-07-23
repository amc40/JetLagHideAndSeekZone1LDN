# TODO / Roadmap

## Expand build-time curated POI resolution to all POI categories

This fork currently resolves two hand-curated POI lists at build time via Overpass
(see `scripts/generate-curated-pois.mjs`, `src/data/curated-stations.mjs`,
`src/data/curated-hospitals.mjs`):

- Tube/train stations (consumed by the Hiding Zone sidebar's custom station list)
- Hospitals (consumed by the "Custom nearest points" / "Custom measuring" question types)

The same approach — a hand-picked list of OSM IDs resolved to coordinates once via
Overpass and shipped as static GeoJSON, instead of querying Overpass live every
session — should eventually be extended to the other POI categories the app
queries live today, e.g.:

- McDonald's/7-Eleven (`measuring.ts` "mcdonalds"/"seven11")
- Parks, museums, zoos, aquariums, golf courses, consulates, cinemas, libraries
  (the "-full" amenity variants in `matching.ts`/`measuring.ts`, and the
  home-game single-instance types)
- Tentacles home-game locations (`tentacles.ts`) — currently out of scope since
  this deployment doesn't use Tentacles questions

Each category would get its own `src/data/curated-<category>.mjs` list and a
`fetchCurated<Category>()` loader in `src/maps/api/overpass.ts`, following the
pattern established for stations and hospitals.

## Self-host Google Fonts for offline use

`src/layouts/Layout.astro` still loads the app's fonts (Oxygen, Poppins) live
from `fonts.googleapis.com`/`fonts.gstatic.com`. Unlike `@arcgis/core`'s
geodesic engine WASM asset (vendored locally via
`scripts/copy-arcgis-assets.mjs` specifically so it survives offline use — see
`src/pwa.ts`), the fonts aren't self-hosted and aren't in the PWA precache
manifest (`astro.config.mjs`'s `additionalManifestEntries`), so a cold offline
load falls back to system fonts instead of the intended typefaces. There's
also a duplicate `<link rel="preconnect" href="https://fonts.googleapis.com">`
on consecutive lines worth cleaning up while touching this.

Fix: download the `.woff2` files in use into `public/fonts/`, generate a local
`@font-face` stylesheet, swap Layout.astro's Google Fonts `<link>` tags for it,
and add the font files to `additionalManifestEntries` the same way the ArcGIS
WASM asset is. See the `vendor-offline-libraries` skill
(`.claude/skills/vendor-offline-libraries/SKILL.md`) for the general process —
this would be a good first thing to run it on. (Not filed as a GitHub issue:
Issues are disabled on this repo.)
