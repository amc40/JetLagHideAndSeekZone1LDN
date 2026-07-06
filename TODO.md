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

- Airports, major cities (`matching.ts`/`measuring.ts` "airport"/"major-city")
- McDonald's/7-Eleven (`measuring.ts` "mcdonalds"/"seven11")
- Parks, museums, zoos, aquariums, golf courses, consulates, cinemas, libraries
  (the "-full" amenity variants in `matching.ts`/`measuring.ts`, and the
  home-game single-instance types)
- Tentacles home-game locations (`tentacles.ts`) — currently out of scope since
  this deployment doesn't use Tentacles questions

Each category would get its own `src/data/curated-<category>.mjs` list and a
`fetchCurated<Category>()` loader in `src/maps/api/overpass.ts`, following the
pattern established for stations and hospitals.
