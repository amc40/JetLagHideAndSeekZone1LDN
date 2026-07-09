// Resolves the hand-curated POI lists in src/data/curated-*.mjs to real
// coordinates via the Overpass API, and writes the result as static GeoJSON
// files into public/. Run manually with `pnpm generate:pois` whenever a
// curated list changes; the generated files are committed so `pnpm build`
// never depends on network access to Overpass.

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const OVERPASS_API = "https://overpass-api.de/api/interpreter";
const OVERPASS_API_FALLBACK = "https://overpass.private.coffee/api/interpreter";

const OSM_TYPE_QUERY_NAME = {
    node: "node",
    way: "way",
    relation: "relation",
};

const CATEGORIES = [
    {
        name: "stations",
        source: new URL("../src/data/curated-stations.mjs", import.meta.url),
        output: fileURLToPath(
            new URL("../public/curated-stations.geojson", import.meta.url),
        ),
    },
    {
        name: "hospitals",
        source: new URL("../src/data/curated-hospitals.mjs", import.meta.url),
        output: fileURLToPath(
            new URL("../public/curated-hospitals.geojson", import.meta.url),
        ),
    },
    {
        name: "parks",
        source: new URL("../src/data/curated-parks.mjs", import.meta.url),
        output: fileURLToPath(
            new URL("../public/curated-parks.geojson", import.meta.url),
        ),
    },
    {
        name: "consulates",
        source: new URL("../src/data/curated-consulates.mjs", import.meta.url),
        output: fileURLToPath(
            new URL("../public/curated-consulates.geojson", import.meta.url),
        ),
    },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function slugify(name) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
}

// overpass-api.de's Apache config returns 406 for requests with no
// User-Agent header, which Node's fetch doesn't send by default.
// "Connection: close" avoids Node's fetch keep-alive pool, which was
// observed to silently hang on reused connections in this environment.
const REQUEST_HEADERS = {
    "User-Agent": "JetLagHideAndSeekZone1LDN-poi-generator/1.0",
    Connection: "close",
};

async function queryOverpass(query) {
    const encodedQuery = encodeURIComponent(query);
    // overpass-api.de enforces a small per-client concurrent-slot budget and
    // answers over-budget requests with 429; back off and retry the primary
    // host a couple of times before giving up on it, since the fallback host
    // has been observed to be unreliable in this environment.
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const response = await fetch(
                `${OVERPASS_API}?data=${encodedQuery}`,
                {
                    headers: REQUEST_HEADERS,
                    signal: AbortSignal.timeout(20_000),
                },
            );
            if (response.ok) return response.json();
            if (response.status !== 429) break;
        } catch {
            break;
        }
        await sleep(5000 * (attempt + 1));
    }

    const fallbackResponse = await fetch(
        `${OVERPASS_API_FALLBACK}?data=${encodedQuery}`,
        { headers: REQUEST_HEADERS, signal: AbortSignal.timeout(20_000) },
    );
    if (!fallbackResponse.ok) {
        throw new Error(
            `Overpass request failed: ${fallbackResponse.status} ${fallbackResponse.statusText}`,
        );
    }
    return fallbackResponse.json();
}

// Entries with known {lat, lon} (e.g. sourced from a GPX/Wikipedia export)
// skip Overpass entirely. Entries with {osmType, osmId} are resolved via
// Overpass to find their coordinates.
async function resolveEntry(entry) {
    if (typeof entry.lat === "number" && typeof entry.lon === "number") {
        return {
            type: "Feature",
            geometry: { type: "Point", coordinates: [entry.lon, entry.lat] },
            properties: {
                id: `curated/${slugify(entry.name)}`,
                name: entry.name,
            },
        };
    }

    const osmType = OSM_TYPE_QUERY_NAME[entry.osmType];
    if (!osmType) {
        throw new Error(
            `Entry "${entry.name ?? "unknown"}" needs either {lat, lon} or a valid {osmType, osmId}`,
        );
    }

    const query = `[out:json];${osmType}(${entry.osmId});out center tags;`;
    const data = await queryOverpass(query);
    const element = data.elements?.[0];
    if (!element) return null;

    const lat = element.center ? element.center.lat : element.lat;
    const lon = element.center ? element.center.lon : element.lon;
    if (typeof lat !== "number" || typeof lon !== "number") return null;

    const tags = element.tags ?? {};
    const name = entry.name ?? tags["name:en"] ?? tags.name;

    return {
        type: "Feature",
        geometry: { type: "Point", coordinates: [lon, lat] },
        properties: {
            id: `${entry.osmType}/${entry.osmId}`,
            name,
        },
    };
}

async function generateCategory({ name, source, output }) {
    const { default: entries } = await import(source.href);

    if (entries.length === 0) {
        console.log(`[${name}] No curated entries yet, skipping.`);
        return;
    }

    const features = [];
    for (const entry of entries) {
        const isDirectCoordinate =
            typeof entry.lat === "number" && typeof entry.lon === "number";
        const label = entry.name ?? `${entry.osmType}/${entry.osmId}`;
        try {
            const feature = await resolveEntry(entry);
            if (!feature) {
                console.warn(
                    `[${name}] No data found for ${label} — check the OSM ID.`,
                );
                continue;
            }
            features.push(feature);
        } catch (e) {
            console.warn(`[${name}] Failed to resolve ${label}: ${e.message}`);
        }
        // Be polite to the public Overpass instance between requests.
        if (!isDirectCoordinate) await sleep(500);
    }

    const featureCollection = { type: "FeatureCollection", features };
    await writeFile(output, JSON.stringify(featureCollection, null, 2) + "\n");
    console.log(
        `[${name}] Wrote ${features.length}/${entries.length} places to ${output}`,
    );
}

for (const category of CATEGORIES) {
    await generateCategory(category);
}
