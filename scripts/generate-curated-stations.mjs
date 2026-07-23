// Builds public/curated-stations.geojson from the hand-curated station set in
// src/data/curated-stations.mjs, enriching each station with the metadata the
// app needs so it NEVER has to hit Overpass at runtime:
//
//   - modes:  which transport modes serve the station (drives the icons shown)
//   - lines:  which lines call at the station (drives "same train line")
//
// Both are ascertained from OpenStreetMap here, at build time, and baked into
// the committed GeoJSON. Co-located interchanges (e.g. a National Rail station
// and the Tube station on top of it) are merged into a single station carrying
// the union of their modes and lines.
//
// Run with `pnpm generate:stations` (also invoked by `pnpm generate:pois`).
// Requires network access to Overpass; see CLAUDE.md for the proxy/User-Agent
// notes (run with NODE_USE_ENV_PROXY=1 inside the sandbox).

import { writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

import curatedStations from "../src/data/curated-stations.mjs";

const OVERPASS_API = "https://overpass-api.de/api/interpreter";
const OVERPASS_API_FALLBACK = "https://overpass.private.coffee/api/interpreter";
const OUTPUT = fileURLToPath(
    new URL("../public/curated-stations.geojson", import.meta.url),
);

const REQUEST_HEADERS = {
    "User-Agent": "JetLagHideAndSeekZone1LDN-station-generator/1.0",
    Connection: "close",
};

// How close an OSM station node must be to a curated entry to be considered the
// same station (metres), and how close a route's member node must be to count
// the station as being on that line.
// Union the classified modes of every OSM station node within this radius, so a
// curated entry picks up a co-located National Rail platform's "rail" mode even
// when the nearest single node is the Tube one.
const MODE_UNION_METERS = 200;
const LINE_MATCH_METERS = 250;
// Co-located curated entries within this distance merge regardless of name;
// same-named entries merge within the larger radius.
const CO_LOCATION_METERS = 200;
const NAME_MATCH_METERS = 500;

const STATION_MODES = [
    "tube",
    "rail",
    "dlr",
    "overground",
    "elizabeth",
    "tram",
];

// Hand-corrections for the few stations where OSM's geometry/tagging leaves the
// auto-derived modes wrong (major NR termini mapped as areas that fall just
// outside the match radius; an adjacent station bleeding a mode in). Keyed by
// the merged station's normalised name; replaces the derived modes.
const MODE_OVERRIDES = {
    "liverpool street": ["tube", "rail", "overground", "elizabeth"],
    marylebone: ["tube", "rail"],
    "tower gateway": ["tube", "dlr"],
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const slugify = (name) =>
    name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");

async function queryOverpass(query) {
    const encoded = encodeURIComponent(query);
    for (const host of [OVERPASS_API, OVERPASS_API_FALLBACK]) {
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const res = await fetch(`${host}?data=${encoded}`, {
                    headers: REQUEST_HEADERS,
                    signal: AbortSignal.timeout(180_000),
                });
                if (res.ok) return res.json();
                if (res.status !== 429) break;
            } catch {
                // transient error; retry with backoff
            }
            await sleep(5000 * (attempt + 1));
        }
    }
    throw new Error("Overpass request failed on both hosts");
}

// Haversine distance in metres.
function distanceMeters(aLon, aLat, bLon, bLat) {
    const R = 6371000;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(bLat - aLat);
    const dLon = toRad(bLon - aLon);
    const lat1 = toRad(aLat);
    const lat2 = toRad(bLat);
    const h =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

const lc = (v) => (typeof v === "string" ? v.toLowerCase() : "");

// Which London transport mode(s) an OSM station's tags indicate.
export function classifyModes(tags = {}) {
    const text = [
        tags.network,
        tags["network:en"],
        tags.operator,
        tags.line,
        tags.name,
        tags["name:en"],
    ]
        .map(lc)
        .join(" | ");
    const station = lc(tags.station);
    const railway = lc(tags.railway);
    const modes = new Set();

    if (station === "subway" || lc(tags.subway) === "yes") modes.add("tube");
    if (text.includes("docklands") || /\bdlr\b/.test(text)) modes.add("dlr");
    if (text.includes("elizabeth") || text.includes("crossrail"))
        modes.add("elizabeth");
    if (text.includes("overground")) modes.add("overground");
    if (
        railway === "tram_stop" ||
        station === "tram" ||
        lc(tags.tram) === "yes" ||
        text.includes("tramlink") ||
        text.includes("london trams")
    )
        modes.add("tram");
    if (modes.size === 0) modes.add("rail");

    return STATION_MODES.filter((m) => modes.has(m));
}

// Best-effort mode guess from a curated entry's name, used when no OSM station
// node is close enough to match.
function classifyModesFromName(name) {
    const n = lc(name);
    if (n.includes("dlr")) return ["dlr"];
    if (n.includes("tube") || n.includes("underground")) return ["tube"];
    if (n.includes("overground")) return ["overground"];
    if (n.includes("elizabeth")) return ["elizabeth"];
    if (n.includes("tram")) return ["tram"];
    return ["rail"];
}

// A named line for a route relation, as { line, mode }, or null for routes that
// aren't a meaningful "line" for this game — chiefly National Rail service
// patterns (route=train), whose relation names are origin→destination journeys
// ("London King's Cross => Aberdeen") rather than lines. We only keep the
// London modes that have real named lines: Tube, DLR, Overground, Elizabeth,
// tram.
export function deriveLine(tags = {}) {
    const name = tags.name || tags["name:en"] || "";
    const nameL = lc(name);
    const network = lc(tags.network);
    const route = lc(tags.route);
    const base = name.split(/[:(]/)[0].trim();

    if (nameL.includes("elizabeth") || network.includes("elizabeth"))
        return { line: "Elizabeth line", mode: "elizabeth" };
    if (network.includes("docklands") || /\bdlr\b/.test(nameL))
        return { line: "DLR", mode: "dlr" };
    if (route === "subway" || network.includes("underground"))
        return { line: base || "London Underground", mode: "tube" };
    if (network.includes("overground"))
        return { line: base || "London Overground", mode: "overground" };
    if (route === "tram" || network.includes("tram"))
        return { line: base || "Tramlink", mode: "tram" };
    return null;
}

export function cleanName(name) {
    return (
        name
            // Drop line-listing parentheticals like "(Bakerloo, Circle ... lines)"
            // but keep name-defining ones like "Kensington (Olympia)".
            .replace(/\s*\([^)]*\blines?\b[^)]*\)\s*/gi, " ")
            // "London X" termini shorten to "X" — except "London Bridge", where
            // "London" is part of the name.
            .replace(/^London\s+(?!Bridge\b)/i, "")
            .replace(
                /\s+(tube|underground|railway|rail|dlr|light rail)?\s*stations?\s*$/i,
                "",
            )
            .trim()
    );
}

// The mode a curated entry's own name explicitly declares, if any. "railway
// station" means National Rail; "X station" alone is ambiguous, so returns null
// rather than guessing.
function explicitModeFromName(name) {
    const n = lc(name);
    if (n.includes("dlr")) return "dlr";
    if (n.includes("tube") || n.includes("underground")) return "tube";
    if (n.includes("overground")) return "overground";
    if (n.includes("elizabeth")) return "elizabeth";
    if (n.includes("tram")) return "tram";
    if (n.includes("railway station")) return "rail";
    return null;
}

export const normaliseName = (name) =>
    name
        .toLowerCase()
        .replace(/\(.*?\)/g, "") // drop parentheticals like "(Bakerloo line)"
        .replace(/['`’.]/g, "")
        .replace(/^london\s+/, "")
        .replace(
            /\b(underground|tube|railway|rail|dlr|light rail|tram|station|stations|halt)\b/g,
            "",
        )
        .replace(/\s+/g, " ")
        .trim();

const bboxOf = (stations, pad = 0.01) => {
    const lats = stations.map((s) => s.lat);
    const lons = stations.map((s) => s.lon);
    return [
        Math.min(...lats) - pad,
        Math.min(...lons) - pad,
        Math.max(...lats) + pad,
        Math.max(...lons) + pad,
    ];
};

async function main() {
    const bbox = bboxOf(curatedStations);
    const bboxStr = bbox.join(",");
    console.log(
        `[stations] bbox ${bboxStr}, ${curatedStations.length} entries`,
    );

    // 1. All station-ish nodes in the zone, with tags → modes.
    const stationData = await queryOverpass(`
[out:json][timeout:120];
(
  nwr["railway"~"^(station|halt|tram_stop)$"](${bboxStr});
  nwr["station"](${bboxStr});
);
out center tags qt;`);
    // Major National Rail termini are mapped as areas (ways/relations), not
    // nodes, so read the geometry centre when there's no direct lat/lon.
    const osmStations = (stationData.elements ?? [])
        .map((e) => ({
            lat: e.center ? e.center.lat : e.lat,
            lon: e.center ? e.center.lon : e.lon,
            tags: e.tags ?? {},
        }))
        .filter((e) => typeof e.lat === "number" && typeof e.lon === "number");
    console.log(`[stations] fetched ${osmStations.length} OSM stations`);

    // 2. Route relations in the zone, with their member node coordinates.
    const routeData = await queryOverpass(`
[out:json][timeout:240];
rel["route"~"^(subway|light_rail|tram|train|monorail)$"](${bboxStr});
out body;
node(r);
out skel qt;`);
    const nodeCoords = new Map();
    for (const el of routeData.elements ?? []) {
        if (el.type === "node") nodeCoords.set(el.id, [el.lon, el.lat]);
    }
    const routes = [];
    for (const el of routeData.elements ?? []) {
        if (el.type !== "relation") continue;
        const derived = deriveLine(el.tags);
        if (!derived) continue;
        const coords = (el.members ?? [])
            .filter((m) => m.type === "node" && nodeCoords.has(m.ref))
            .map((m) => nodeCoords.get(m.ref));
        if (coords.length > 0)
            routes.push({ line: derived.line, mode: derived.mode, coords });
    }
    console.log(`[stations] kept ${routes.length} named-line route relations`);

    // 3. Enrich each curated entry with modes + lines.
    const enriched = curatedStations.map((entry) => {
        const modeSet = new Set();
        for (const s of osmStations) {
            const d = distanceMeters(entry.lon, entry.lat, s.lon, s.lat);
            // Union modes of every co-located node (picks up NR + Tube together).
            if (d <= MODE_UNION_METERS)
                for (const m of classifyModes(s.tags)) modeSet.add(m);
        }

        // The entry's own name is authoritative for the mode it declares.
        const named = explicitModeFromName(entry.name);
        if (named) modeSet.add(named);

        // No OSM node close enough and no explicit name mode → fall back.
        if (modeSet.size === 0)
            for (const m of classifyModesFromName(entry.name)) modeSet.add(m);

        const lines = new Set();
        for (const route of routes) {
            if (
                route.coords.some(
                    ([lon, lat]) =>
                        distanceMeters(entry.lon, entry.lat, lon, lat) <=
                        LINE_MATCH_METERS,
                )
            ) {
                lines.add(route.line);
                // The lines calling here also tell us which modes serve it,
                // filling gaps the single matched station node can miss.
                modeSet.add(route.mode);
            }
        }

        return {
            id: `curated/${slugify(entry.name)}`,
            name: cleanName(entry.name),
            lon: entry.lon,
            lat: entry.lat,
            modes: STATION_MODES.filter((m) => modeSet.has(m)),
            lines: [...lines].sort(),
            norm: normaliseName(entry.name),
        };
    });

    // 4. Merge co-located interchanges (union modes + lines + member ids).
    const parent = enriched.map((_, i) => i);
    const find = (i) => {
        while (parent[i] !== i) {
            parent[i] = parent[parent[i]];
            i = parent[i];
        }
        return i;
    };
    const union = (i, j) => {
        parent[find(i)] = find(j);
    };
    for (let i = 0; i < enriched.length; i++) {
        for (let j = i + 1; j < enriched.length; j++) {
            const d = distanceMeters(
                enriched[i].lon,
                enriched[i].lat,
                enriched[j].lon,
                enriched[j].lat,
            );
            const sameName =
                enriched[i].norm !== "" &&
                enriched[i].norm === enriched[j].norm;
            if (d <= CO_LOCATION_METERS || (sameName && d <= NAME_MATCH_METERS))
                union(i, j);
        }
    }

    const groups = new Map();
    enriched.forEach((_, i) => {
        const root = find(i);
        if (!groups.has(root)) groups.set(root, []);
        groups.get(root).push(i);
    });

    const features = [];
    for (const indices of groups.values()) {
        const members = indices.map((i) => enriched[i]);
        const avgLon = members.reduce((s, m) => s + m.lon, 0) / members.length;
        const avgLat = members.reduce((s, m) => s + m.lat, 0) / members.length;

        const modeSet = new Set(members.flatMap((m) => m.modes));
        const lines = [...new Set(members.flatMap((m) => m.lines))].sort();
        const memberIds = members.map((m) => m.id);

        // Representative name: the cleaned name shared by the most members,
        // breaking ties by the longest (so "King's Cross St Pancras" wins over
        // "St Pancras", and a unanimous "Paddington" stays "Paddington").
        const freq = new Map();
        for (const m of members) freq.set(m.name, (freq.get(m.name) ?? 0) + 1);
        const name = [...freq.keys()].sort((a, b) => {
            const byFreq = freq.get(b) - freq.get(a);
            return byFreq !== 0 ? byFreq : b.length - a.length;
        })[0];

        const override = MODE_OVERRIDES[normaliseName(name)];
        const modes = override
            ? STATION_MODES.filter((m) => override.includes(m))
            : STATION_MODES.filter((m) => modeSet.has(m));

        features.push({
            type: "Feature",
            geometry: { type: "Point", coordinates: [avgLon, avgLat] },
            properties: { id: memberIds[0], name, modes, lines, memberIds },
        });
    }

    features.sort((a, b) => a.properties.name.localeCompare(b.properties.name));

    await writeFile(
        OUTPUT,
        JSON.stringify({ type: "FeatureCollection", features }, null, 2) + "\n",
    );
    console.log(
        `[stations] wrote ${features.length} stations (from ${curatedStations.length} curated entries) to ${OUTPUT}`,
    );
}

// Only hit the network when run directly (`pnpm generate:stations`); importing
// this module (e.g. from tests) just exposes the pure helpers above.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    await main();
}
