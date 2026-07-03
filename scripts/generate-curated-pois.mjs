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
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function queryOverpass(query) {
    const encodedQuery = encodeURIComponent(query);
    try {
        const response = await fetch(`${OVERPASS_API}?data=${encodedQuery}`);
        if (response.ok) return response.json();
    } catch {
        // Fall through to the fallback host
    }

    const fallbackResponse = await fetch(
        `${OVERPASS_API_FALLBACK}?data=${encodedQuery}`,
    );
    if (!fallbackResponse.ok) {
        throw new Error(
            `Overpass request failed: ${fallbackResponse.status} ${fallbackResponse.statusText}`,
        );
    }
    return fallbackResponse.json();
}

async function resolveEntry(entry) {
    const osmType = OSM_TYPE_QUERY_NAME[entry.osmType];
    if (!osmType) {
        throw new Error(`Unknown osmType "${entry.osmType}"`);
    }

    const query = `[out:json];${osmType}(${entry.osmId});out center tags;`;
    const data = await queryOverpass(query);
    const element = data.elements?.[0];
    if (!element) return null;

    const lat = element.center ? element.center.lat : element.lat;
    const lon = element.center ? element.center.lon : element.lon;
    if (typeof lat !== "number" || typeof lon !== "number") return null;

    const tags = element.tags ?? {};
    const name = tags["name:en"] ?? tags.name;

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
        const label = `${entry.osmType}/${entry.osmId}`;
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
        await sleep(500);
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
