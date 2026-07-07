// Fetches the raw OSM candidate set for a POI category within a bounding box
// via Overpass, for use by the curate-pois skill (.claude/skills/curate-pois).
// This is a read-only research tool — it does NOT write to any curated-*.mjs
// file. Prints a JSON array of candidates to stdout.
//
// Usage:
//   node scripts/fetch-poi-candidates.mjs '[amenity=hospital]' '51.47,-0.22,51.54,-0.06'
//
// The bbox is "south,west,north,east" (Overpass bbox order = minlat,minlon,maxlat,maxlon).

const OVERPASS_API = "https://overpass-api.de/api/interpreter";
const OVERPASS_API_FALLBACK = "https://overpass.private.coffee/api/interpreter";

const [, , tagFilter, bbox] = process.argv;

if (!tagFilter || !bbox) {
    console.error(
        'Usage: node scripts/fetch-poi-candidates.mjs "<tag filter, e.g. [amenity=hospital]>" "<south,west,north,east>"',
    );
    process.exit(1);
}

const query = `[out:json][timeout:60];nwr${tagFilter}(${bbox});out center tags;`;

async function queryOverpass(url) {
    const response = await fetch(`${url}?data=${encodeURIComponent(query)}`, {
        // overpass-api.de's Apache config returns 406 for requests with no
        // User-Agent header, which Node's fetch doesn't send by default.
        headers: { "User-Agent": "JetLagHideAndSeekZone1LDN-poi-fetcher/1.0" },
    });
    if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
    }
    return response.json();
}

let data;
try {
    data = await queryOverpass(OVERPASS_API);
} catch (e) {
    console.error(
        `Primary Overpass host failed (${e.message}), trying fallback...`,
    );
    data = await queryOverpass(OVERPASS_API_FALLBACK);
}

const candidates = (data.elements ?? []).map((el) => {
    const lat = el.center ? el.center.lat : el.lat;
    const lon = el.center ? el.center.lon : el.lon;
    const tags = el.tags ?? {};
    return {
        osmType: el.type,
        osmId: el.id,
        name: tags["name:en"] ?? tags.name ?? null,
        lat,
        lon,
        tags,
    };
});

console.log(JSON.stringify(candidates, null, 2));
console.error(`Found ${candidates.length} candidates.`);
