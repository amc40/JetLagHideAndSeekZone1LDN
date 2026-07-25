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
        name: "cinemas",
        source: new URL("../src/data/curated-cinemas.mjs", import.meta.url),
        output: fileURLToPath(
            new URL("../public/curated-cinemas.geojson", import.meta.url),
        ),
    },
    {
        name: "highspeed",
        source: new URL("../src/data/curated-highspeed.mjs", import.meta.url),
        output: fileURLToPath(
            new URL("../public/curated-highspeed.geojson", import.meta.url),
        ),
    },
    {
        name: "consulates",
        source: new URL("../src/data/curated-consulates.mjs", import.meta.url),
        output: fileURLToPath(
            new URL("../public/curated-consulates.geojson", import.meta.url),
        ),
    },
    {
        name: "libraries",
        source: new URL("../src/data/curated-libraries.mjs", import.meta.url),
        output: fileURLToPath(
            new URL("../public/curated-libraries.geojson", import.meta.url),
        ),
    },
    {
        name: "museums",
        source: new URL("../src/data/curated-museums.mjs", import.meta.url),
        output: fileURLToPath(
            new URL("../public/curated-museums.geojson", import.meta.url),
        ),
    },
    {
        name: "aquariums",
        source: new URL("../src/data/curated-aquariums.mjs", import.meta.url),
        output: fileURLToPath(
            new URL("../public/curated-aquariums.geojson", import.meta.url),
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
    let lastError = "no attempts made";

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
                    signal: AbortSignal.timeout(60_000),
                },
            );
            if (response.ok) return response.json();
            lastError = `primary ${response.status} ${response.statusText}: ${(await response.text()).slice(0, 500)}`;
            console.warn(`  attempt ${attempt + 1}/3 (primary): ${lastError}`);
            if (response.status !== 429) break;
        } catch (e) {
            // Transient timeout/network error under the proxy — retry the
            // primary host with backoff instead of giving up after one try.
            lastError = `primary ${e.name}: ${e.message}`;
            console.warn(`  attempt ${attempt + 1}/3 (primary): ${lastError}`);
        }
        await sleep(5000 * (attempt + 1));
    }

    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const fallbackResponse = await fetch(
                `${OVERPASS_API_FALLBACK}?data=${encodedQuery}`,
                {
                    headers: REQUEST_HEADERS,
                    signal: AbortSignal.timeout(60_000),
                },
            );
            if (fallbackResponse.ok) return fallbackResponse.json();
            lastError = `fallback ${fallbackResponse.status} ${fallbackResponse.statusText}: ${(await fallbackResponse.text()).slice(0, 500)}`;
            console.warn(`  attempt ${attempt + 1}/2 (fallback): ${lastError}`);
        } catch (e) {
            lastError = `fallback ${e.name}: ${e.message}`;
            console.warn(`  attempt ${attempt + 1}/2 (fallback): ${lastError}`);
        }
        await sleep(5000 * (attempt + 1));
    }

    throw new Error(
        `Overpass request failed on both primary and fallback hosts (last error: ${lastError})`,
    );
}

// Entries with known {lat, lon} (e.g. sourced from a GPX/Wikipedia export)
// skip Overpass entirely.

// Overpass ids for a whole category are resolved in a handful of batched
// queries (a union of `way(id);`/`node(id);`/`relation(id);` clauses per
// request) rather than one query per entry — this cuts a ~300-entry run
// from hundreds of round-trips down to single digits. `out center tags`
// returns each matched element's own {type, id}, so results are matched
// back to entries by `${type}/${id}` rather than by response order (some
// ids in a batch may come back missing entirely).
const OVERPASS_BATCH_SIZE = 50;

async function resolveOsmBatch(osmEntries) {
    const resultMap = new Map();
    for (let i = 0; i < osmEntries.length; i += OVERPASS_BATCH_SIZE) {
        const batch = osmEntries.slice(i, i + OVERPASS_BATCH_SIZE);
        const clauses = batch
            .map((e) => `${OSM_TYPE_QUERY_NAME[e.osmType]}(${e.osmId});`)
            .join("");
        const query = `[out:json];(${clauses});out center tags;`;
        const data = await queryOverpass(query);
        for (const element of data.elements ?? []) {
            resultMap.set(`${element.type}/${element.id}`, element);
        }
        // Be polite to the public Overpass instance between batches.
        if (i + OVERPASS_BATCH_SIZE < osmEntries.length) await sleep(1000);
    }
    return resultMap;
}

function resolveDirectEntry(entry) {
    return {
        type: "Feature",
        geometry: { type: "Point", coordinates: [entry.lon, entry.lat] },
        properties: {
            id: `curated/${slugify(entry.name)}`,
            name: entry.name,
        },
    };
}

function resolveOsmEntry(entry, element) {
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

    const osmEntries = entries.filter(
        (e) => !(typeof e.lat === "number" && typeof e.lon === "number"),
    );
    for (const e of osmEntries) {
        if (!OSM_TYPE_QUERY_NAME[e.osmType]) {
            throw new Error(
                `Entry "${e.name ?? "unknown"}" needs either {lat, lon} or a valid {osmType, osmId}`,
            );
        }
    }

    let osmMap = new Map();
    if (osmEntries.length > 0) {
        try {
            osmMap = await resolveOsmBatch(osmEntries);
        } catch (e) {
            // Bail out rather than writing a near-empty file over the
            // committed output — a failed batch here previously clobbered
            // curated-museums.geojson down to 0 features.
            throw new Error(
                `[${name}] Batched Overpass resolution failed, leaving ${output} untouched: ${e.message}`,
            );
        }
    }

    const features = [];
    for (const entry of entries) {
        const label = entry.name ?? `${entry.osmType}/${entry.osmId}`;
        const isDirectCoordinate =
            typeof entry.lat === "number" && typeof entry.lon === "number";

        const feature = isDirectCoordinate
            ? resolveDirectEntry(entry)
            : resolveOsmEntry(
                  entry,
                  osmMap.get(`${entry.osmType}/${entry.osmId}`) ?? {},
              );

        if (!feature) {
            console.warn(
                `[${name}] No data found for ${label} — check the OSM ID.`,
            );
            continue;
        }
        features.push(feature);
    }

    const featureCollection = { type: "FeatureCollection", features };
    await writeFile(output, JSON.stringify(featureCollection, null, 2) + "\n");
    console.log(
        `[${name}] Wrote ${features.length}/${entries.length} places to ${output}`,
    );
}

// Optionally pass category names as CLI args to regenerate only those
// (e.g. `node scripts/generate-curated-pois.mjs aquariums`), instead of
// re-resolving every curated list against Overpass.
const requestedNames = process.argv.slice(2);
const categoriesToRun = requestedNames.length
    ? CATEGORIES.filter((c) => requestedNames.includes(c.name))
    : CATEGORIES;

for (const category of categoriesToRun) {
    await generateCategory(category);
}
