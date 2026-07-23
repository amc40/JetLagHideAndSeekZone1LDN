# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is an Astro + React + TypeScript single-page application that generates interactive maps for Jet Lag The Game's Hide and Seek. Users select a geographic region (via OpenStreetMap) and add game "questions" (Radius, Thermometer, Tentacles, Matching, Measuring); the app progressively eliminates areas from the map that can't be the hider's location.

## Commands

```bash
pnpm install      # Install dependencies
pnpm dev          # Start dev server (http://localhost:4321)
pnpm build        # Production build
pnpm preview      # Preview production build
pnpm lint         # Auto-fix ESLint + Prettier (run before committing)
pnpm test         # Run Vitest tests
```

Node.js <25 is required. Deploy is automated to GitHub Pages via GitHub Actions on push to `master`.

## Architecture

### State Management (`src/lib/context.ts`)

All application state is managed via **nanostores**. Persistent atoms (using `@nanostores/persistent`) survive page reloads via `localStorage`. Key atoms:

- `questions` — array of all added questions, persisted and decoded via Zod schema
- `mapGeoLocation` — the selected OSM region (default: London)
- `mapGeoJSON` — the current computed map boundary (polygon clipped by questions)
- `polyGeoJSON` — optional custom drawn polygon overriding the OSM boundary
- `hiderMode` — when set to a lat/lng, auto-computes question answers for that location
- `hidingZone` — a computed atom aggregating all state for zone display
- `planningModeEnabled` — shows question boundary outlines without applying them

The `questionModified()` function must be called after any mutation to `questions` array elements (direct property changes aren't reactive).

### Question Schema (`src/maps/schema.ts`)

Questions are discriminated unions validated with **Zod**. The top-level `questionSchema` has five `id` variants: `"radius"`, `"thermometer"`, `"tentacles"`, `"matching"`, `"measuring"`. Each variant's `data` field has its own sub-schema with defaults.

When adding a new question type, update the Zod schema here first — the schema drives both validation/serialization and the type system.

### Map Pipeline (`src/maps/index.ts`, `src/components/Map.tsx`)

Each time questions or the map location changes, `Map.tsx` runs this pipeline:

1. **Determine boundaries** — calls `determineMapBoundaries()` which queries Overpass API for the OSM relation geometry
2. **Apply questions** — calls `applyQuestionsToMapGeoData()`, which iterates questions and calls the per-question `adjustPer*` function
3. **Render** — applies `holedMask()` to invert the surviving area into a grey overlay on the map

Each question module in `src/maps/questions/` exports three functions:

- `adjustPer*` — clips the map polygon based on the question answer
- `hiderify*` — given a hider location, auto-computes what the question answer should be
- `*PlanningPolygon` — returns the question's boundary line for planning mode display

### Geospatial Operations (`src/maps/geo-utils/`)

- **`operators.ts`** — core polygon operations: `arcBuffer` (geodesic buffer via `@arcgis/core`), `modifyMapData` (intersect/difference), `holedMask` (inverts polygon to world-minus-area), `safeUnion`
- **`voronoi.ts`** — Voronoi diagram for nearest-feature matching questions
- **`stationManipulations.ts`** — train station filtering/manipulation utilities

The project uses **`@arcgis/core`** for geodesically accurate buffers (as opposed to Turf.js's planar buffers). All distance/buffer operations should use `arcBuffer`/`arcBufferToPoint` rather than `turf.buffer`.

### External Data (`src/maps/api/`)

- **Overpass API** (`overpass.ts`) — fetches OSM features (airports, train stations, amenities, admin boundaries). Has a fallback server (`overpass.private.coffee`). Uses the **Cache API** (3 separate caches: per-question, per-zone, permanent) to avoid redundant network requests.
- **Geocoder** — Photon/Komoot API for place-name search in `PlacePicker`
- **`coastline50.geojson`** in `/public/` — bundled coastline data served locally
- **`elevation-london.bin`** in `/public/` — bundled OS Terrain 50 elevation grid (100m resolution, decimetre-precision Int16, covering a 40km×40km box around Greater London) backing the "Sea Level" Measuring question. See `src/maps/geo-utils/elevation.ts` for the runtime lookup/isoband logic and `src/maps/geo-utils/elevation-grid.json` for its metadata (bounds, licence, attribution). Regenerate both via `pnpm generate:elevation` (`scripts/generate-elevation-data.mjs`), which downloads the source data from the OS Data Hub — Contains OS data © Crown copyright and database right, Open Government Licence v3.0.

**Node-side Overpass scripts** (`scripts/fetch-poi-candidates.mjs`, `scripts/generate-curated-pois.mjs`, used by the `curate-pois` skill) talk to `overpass-api.de` directly from Node rather than a browser, which surfaces two gotchas that don't affect the in-browser app:

- `overpass-api.de`'s Apache config returns `406 Not Acceptable` for requests with no `User-Agent` header — Node's `fetch` sends none by default (browsers always do). Both scripts set an explicit `User-Agent` to work around this.
- When running inside Claude Code's remote sandboxed environment, Node's built-in `fetch` does not read the `HTTPS_PROXY` env var by default, so it bypasses the environment's proxy and connects directly — which was observed to cause intermittent multi-second hangs/timeouts to `overpass-api.de`. Run these scripts with `NODE_USE_ENV_PROXY=1` (Node ≥22.21) in that environment to route through the proxy reliably.

### Adding a New Question Type

1. Add the Zod schema variant in `src/maps/schema.ts` and export the type
2. Create `src/maps/questions/<name>.ts` with `adjustPer*`, `hiderify*`, and `*PlanningPolygon`
3. Wire it into the switch statements in `src/maps/index.ts`
4. Add the UI card in `src/components/cards/<name>.tsx` (see existing cards for the pattern)
5. Register the card in `src/components/QuestionCards.tsx`

### Path Aliases

`@/` maps to `./src/`. ESLint enforces this — no relative imports crossing directory boundaries are allowed. Imports must be sorted (enforced by `eslint-plugin-simple-import-sort`).

### UI Components

`src/components/ui/` contains shadcn/ui primitives (Radix UI + Tailwind). `src/components/cards/` holds the per-question-type card components shown in the sidebar. The `base.tsx` card provides shared collapse/hide/delete/color controls.

### Hider Mode

When `hiderMode` is set (lat/lng), the app calls `hiderifyQuestion()` for each question, which automatically determines the correct `same`/`within`/`warmer` answer based on the hider's actual location. This lets seekers use the tool live during a game.
