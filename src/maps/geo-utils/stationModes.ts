// The London transport modes a station can serve. Each mode maps to an icon
// (see src/lib/stationIcons.ts). A station's modes are ascertained from
// OpenStreetMap at build time and baked into the curated station data
// (see scripts/generate-curated-stations.mjs); the app only reads them.

export type StationMode =
    | "tube"
    | "rail"
    | "dlr"
    | "overground"
    | "elizabeth"
    | "tram";

// Canonical display order, so an interchange's icons always line up the same way.
export const STATION_MODES: StationMode[] = [
    "tube",
    "rail",
    "dlr",
    "overground",
    "elizabeth",
    "tram",
];
