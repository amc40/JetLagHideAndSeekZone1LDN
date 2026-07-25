import * as turf from "@turf/turf";
import { toast } from "react-toastify";

import { polyGeoJSON } from "@/lib/context";
import { TFL_ZONE_1_POLYGON } from "@/lib/map-presets";

import { cacheFetch, determineCache, versionedPublicUrl } from "./cache";
import { OVERPASS_API, OVERPASS_API_FALLBACK } from "./constants";
import { CacheType } from "./types";

export const getOverpassData = async (
    query: string,
    loadingText?: string,
    cacheType: CacheType = CacheType.CACHE,
) => {
    const encodedQuery = encodeURIComponent(query);
    const primaryUrl = `${OVERPASS_API}?data=${encodedQuery}`;
    let response = await cacheFetch(primaryUrl, loadingText, cacheType);

    if (!response.ok) {
        // Try the fallback, but store the result under the primary URL key so future requests are served from cache without needing to fail-over again.
        try {
            const fallbackResponse = await cacheFetch(
                `${OVERPASS_API_FALLBACK}?data=${encodedQuery}`,
                loadingText,
                cacheType,
            );
            if (fallbackResponse.ok) {
                const cache = await determineCache(cacheType);
                await cache.put(primaryUrl, fallbackResponse.clone());
            }
            response = fallbackResponse;
        } catch {
            toast.error(
                `Could not load data from Overpass: ${response.status} ${response.statusText}`,
                { toastId: "overpass-error" },
            );
            return { elements: [] };
        }
    }

    if (!response.ok) {
        toast.error(
            `Could not load data from Overpass: ${response.status} ${response.statusText}`,
            { toastId: "overpass-error" },
        );
        return { elements: [] };
    }

    const data = await response.json();
    return data;
};

export const fetchCoastline = async (silent = false) => {
    const response = await cacheFetch(
        versionedPublicUrl("coastline50.geojson"),
        silent ? undefined : "Fetching coastline data...",
        CacheType.PERMANENT_CACHE,
    );
    const data = await response.json();
    return data;
};

export const fetchCuratedStations = async (silent = false) => {
    const response = await cacheFetch(
        versionedPublicUrl("curated-stations.geojson"),
        silent ? undefined : "Loading curated stations...",
        CacheType.PERMANENT_CACHE,
    );
    const data = await response.json();
    return data;
};

export const fetchCuratedHospitals = async (silent = false) => {
    const response = await cacheFetch(
        versionedPublicUrl("curated-hospitals.geojson"),
        silent ? undefined : "Loading curated hospitals...",
        CacheType.PERMANENT_CACHE,
    );
    const data = await response.json();
    return data;
};

export const fetchCuratedParks = async (silent = false) => {
    const response = await cacheFetch(
        versionedPublicUrl("curated-parks.geojson"),
        silent ? undefined : "Loading curated parks...",
        CacheType.PERMANENT_CACHE,
    );
    const data = await response.json();
    return data;
};

export const fetchCuratedCinemas = async (silent = false) => {
    const response = await cacheFetch(
        versionedPublicUrl("curated-cinemas.geojson"),
        silent ? undefined : "Loading curated cinemas...",
        CacheType.PERMANENT_CACHE,
    );
    const data = await response.json();
    return data;
};

export const fetchCuratedHighspeed = async (silent = false) => {
    const response = await cacheFetch(
        versionedPublicUrl("curated-highspeed.geojson"),
        silent ? undefined : "Loading curated high-speed rail stations...",
        CacheType.PERMANENT_CACHE,
    );
    const data = await response.json();
    return data;
};

export const fetchCuratedConsulates = async (silent = false) => {
    const response = await cacheFetch(
        versionedPublicUrl("curated-consulates.geojson"),
        silent ? undefined : "Loading curated consulates...",
        CacheType.PERMANENT_CACHE,
    );
    const data = await response.json();
    return data;
};

export const fetchCuratedAquariums = async (silent = false) => {
    const response = await cacheFetch(
        versionedPublicUrl("curated-aquariums.geojson"),
        silent ? undefined : "Loading curated aquariums...",
        CacheType.PERMANENT_CACHE,
    );
    const data = await response.json();
    return data;
};

export const fetchCuratedLibraries = async (silent = false) => {
    const response = await cacheFetch(
        versionedPublicUrl("curated-libraries.geojson"),
        silent ? undefined : "Loading curated libraries...",
        CacheType.PERMANENT_CACHE,
    );
    const data = await response.json();
    return data;
};

// Source: Greater London Authority "London Borough" boundary file
// (statistical-gis-boundaries-london), via the London Datastore. Derived from
// Ordnance Survey / ONS data and licensed under the Open Government Licence v3.
// Bundled locally so borough matching works offline and doesn't depend on a
// live admin-boundary lookup.
export const fetchLondonBoroughs = async (silent = false) => {
    const response = await cacheFetch(
        versionedPublicUrl("london-boroughs.geojson"),
        silent ? undefined : "Loading London boroughs...",
        CacheType.PERMANENT_CACHE,
    );
    const data = await response.json();
    return data;
};

// Source: Ordnance Survey OS Open Rivers ("River Thames" named reaches,
// Wandsworth to Wapping), via the OS Data Hub / Esri UK Living Atlas
// FeatureServer. Contains OS data (c) Crown copyright and database right,
// licensed under the Open Government Licence v3. Bundled locally (and
// trimmed down to a single connected line) so the question works offline
// and doesn't depend on a live lookup.
export const fetchThamesLine = async (silent = false) => {
    const response = await cacheFetch(
        versionedPublicUrl("thames.geojson"),
        silent ? undefined : "Loading the Thames...",
        CacheType.PERMANENT_CACHE,
    );
    const data = await response.json();
    return data;
};

export const fetchCuratedMuseums = async (silent = false) => {
    const response = await cacheFetch(
        versionedPublicUrl("curated-museums.geojson"),
        silent ? undefined : "Loading curated museums...",
        CacheType.PERMANENT_CACHE,
    );
    const data = await response.json();
    return data;
};

export const findPlacesInZone = async (
    filter: string,
    loadingText?: string,
    searchType:
        | "node"
        | "way"
        | "relation"
        | "nwr"
        | "nw"
        | "wr"
        | "nr"
        | "area" = "nwr",
    outType: "center" | "geom" = "center",
    timeoutDuration: number = 0,
) => {
    const $polyGeoJSON = polyGeoJSON.get() ?? TFL_ZONE_1_POLYGON;
    const coords = turf
        .getCoords($polyGeoJSON.features)
        .flatMap((polygon) => polygon.geometry.coordinates)
        .flat()
        .map((coord) => [coord[1], coord[0]].join(" "))
        .join(" ");
    const query = `
[out:json]${timeoutDuration != 0 ? `[timeout:${timeoutDuration}]` : ""};
(
${searchType}${filter}(poly:"${coords}");
);
out ${outType};
`;
    return getOverpassData(query, loadingText, CacheType.ZONE_CACHE);
};
