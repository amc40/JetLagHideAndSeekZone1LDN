---
name: curate-pois
description: Interactively (re)build one of this repo's hand-curated POI lists (src/data/curated-stations.mjs, curated-hospitals.mjs, or a new category) by querying Overpass for the real candidate set in the play zone, applying judgment to recommend a sensible subset with rationale, and interviewing the user before writing the result.
---

This repo (see `CLAUDE.md` and `TODO.md`) replaces live Overpass queries for specific POI categories with hand-curated lists — e.g. `src/data/curated-stations.mjs` and `src/data/curated-hospitals.mjs`, resolved to coordinates by `pnpm generate:pois` into `public/curated-<category>.geojson`. (Stations are a special case: `src/data/curated-stations.mjs` holds the hand-picked set, and `pnpm generate:stations` enriches each with modes + line memberships from OSM and merges co-located interchanges into `public/curated-stations.geojson` — see `scripts/generate-curated-stations.mjs`.) This skill is the tool for building or refreshing one of those lists: ask OSM the same question the live app would ask, then curate the answer with the user instead of blindly accepting everything OSM returns.

**Never just dump the raw Overpass result into the curated file.** The whole point of curation is judgment — spotting duplicates, excluding things that are tagged right but don't really belong (a GP surgery tagged `amenity=hospital`, a disused station), and explaining why.

## 1. Determine category, tag filter, and area

- If not given an explicit category (via `args` or the conversation), ask the user: which category are we curating? (e.g. "hospitals", "stations", or a brand new one not yet in `src/data/curated-*.mjs`.)
- Map the category to the Overpass tag filter the live app itself uses for it:
    - Amenity-style categories (hospital, museum, cinema, library, aquarium, zoo, theme_park, golf_course, consulate, park, peak): see `LOCATION_FIRST_TAG` in `src/maps/api/constants.ts` — filter is `[${LOCATION_FIRST_TAG[category]}=${category}]`, e.g. hospital → `[amenity=hospital]`.
    - Stations: the set lives in `src/data/curated-stations.mjs` as `{name, lat, lon}` entries; `pnpm generate:stations` handles the OSM enrichment (modes, lines, merged interchanges), so curation here is about choosing which stations belong in the play zone.
    - A genuinely new category: ask the user for the raw OSM tag (`key=value`) directly.
- Determine the bounding box for the play zone, as `south,west,north,east` (Overpass order = minlat,minlon,maxlat,maxlon):
    - If the category's `src/data/curated-<category>.mjs` already has coordinate entries, derive a default bbox from the min/max lat/lon of them, padded by ~0.01° (~1km), and confirm it with the user.
    - Otherwise ask the user for the area (a place name to geocode, or an explicit bbox).

## 2. Fetch the raw candidate set

Run:

```bash
node scripts/fetch-poi-candidates.mjs '<tag filter>' '<south,west,north,east>'
```

This is a read-only helper (see the script for details) — it queries Overpass directly and prints a JSON array of `{osmType, osmId, name, lat, lon, tags}` to stdout. It does not touch any curated file. Network access is required; if it fails, tell the user rather than guessing at data.

**Known gotcha**: `overpass-api.de` returns `406 Not Acceptable` for requests with no `User-Agent` header — which is what Node's built-in `fetch` sends by default (curl works fine because it always sets one). The script already sets an explicit `User-Agent`, so this shouldn't resurface unless that header is ever removed. If you see a 406 from the primary host (not the fallback), check that header first before assuming the API is down. The fallback host (`overpass.private.coffee`) has also been seen returning `429`/timing out under normal use — treat a fallback failure as inconclusive, not proof the primary is broken.

## 3. Apply judgment — build Recommended vs Excluded

Go through every candidate yourself and reason about it, don't just forward the list. For each one, decide: keep, drop, or unsure — and write one clear sentence of rationale either way. Look for:

- **Duplicates**: the same real-world place appearing twice — an entrance node and a building way for the same hospital, slightly different name spellings at ~the same coordinates.
- **Category mismatch despite matching tags**: e.g. `amenity=hospital` on a small private clinic, GP surgery, or day-treatment/dental site rather than a full hospital that could plausibly be a hiding spot; `disused:railway`/closed stations; an administrative building rather than the actual public-facing site.
- **Ambiguous/uncertain cases**: things you're genuinely not sure about — surface these separately rather than silently guessing.

Use the `name` and `tags` (e.g. `amenity`, `healthcare`, `operator`, `beds`, or for stations `network`, `subway`, `light_rail`) to inform judgment, not just the name string.

## 4. Report and interview

Present a written report (not a single giant AskUserQuestion — there may be dozens of candidates):

- **Recommended** (name + osmType/osmId) — what you'd include by default
- **Excluded**, each with its one-line rationale
- **Uncertain**, if any, flagged separately

Then use `AskUserQuestion` to let the user steer the outcome — e.g. "Accept the recommended set as-is" vs "let me review the excluded/uncertain list and add specific ones back" (offer to walk through the excluded list a handful at a time if they want to override any). Don't ask about every single item individually.

## 5. Write the result

Write the final, user-approved list to `src/data/curated-<category>.mjs`, following the existing format exactly (see `src/data/curated-hospitals.mjs` for the OSM-ID shape and `src/data/curated-highspeed.mjs` for the direct-`{name, lat, lon}` shape used when coordinates are already known). Each entry gets a `//` comment above it naming the place for readability.

Finish by telling the user to run `pnpm generate:pois` to regenerate the corresponding `public/curated-<category>.geojson`, and to run `pnpm lint`/`pnpm typecheck` if they want to confirm nothing broke.
