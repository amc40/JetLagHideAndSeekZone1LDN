import * as turf from "@turf/turf";
import type { FeatureCollection, MultiPolygon } from "geojson";
import osmtogeojson from "osmtogeojson";
import { toast } from "react-toastify";

import {
    additionalMapGeoLocations,
    mapGeoLocation,
    polyGeoJSON,
} from "@/lib/context";
import { safeUnion } from "@/maps/geo-utils";

import { cacheFetch, determineCache } from "./cache";
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

export const determineGeoJSON = async (
    osmId: string,
    osmTypeLetter: "W" | "R" | "N",
): Promise<any> => {
    const osmTypeMap: { [key: string]: string } = {
        W: "way",
        R: "relation",
        N: "node",
    };
    const osmType = osmTypeMap[osmTypeLetter];
    const query = `[out:json];${osmType}(${osmId});out geom;`;
    const data = await getOverpassData(
        query,
        "Loading map data...",
        CacheType.PERMANENT_CACHE,
    );
    const geo = osmtogeojson(data);
    return {
        ...geo,
        features: geo.features.filter(
            (feature: any) => feature.geometry.type !== "Point",
        ),
    };
};

export const fetchCoastline = async () => {
    const response = await cacheFetch(
        import.meta.env.BASE_URL + "/coastline50.geojson",
        "Fetching coastline data...",
        CacheType.PERMANENT_CACHE,
    );
    const data = await response.json();
    return data;
};

export const fetchCuratedStations = async () => {
    const response = await cacheFetch(
        import.meta.env.BASE_URL + "/curated-stations.geojson",
        "Loading curated stations...",
        CacheType.PERMANENT_CACHE,
    );
    const data = await response.json();
    return data;
};

export const fetchCuratedHospitals = async () => {
    const response = await cacheFetch(
        import.meta.env.BASE_URL + "/curated-hospitals.geojson",
        "Loading curated hospitals...",
        CacheType.PERMANENT_CACHE,
    );
    const data = await response.json();
    return data;
};

export const fetchCuratedParks = async () => {
    const response = await cacheFetch(
        import.meta.env.BASE_URL + "/curated-parks.geojson",
        "Loading curated parks...",
        CacheType.PERMANENT_CACHE,
    );
    const data = await response.json();
    return data;
};

export const fetchCuratedCinemas = async () => {
    const response = await cacheFetch(
        import.meta.env.BASE_URL + "/curated-cinemas.geojson",
        "Loading curated cinemas...",
        CacheType.PERMANENT_CACHE,
    );
    const data = await response.json();
    return data;
};

export const fetchCuratedHighspeed = async () => {
    const response = await cacheFetch(
        import.meta.env.BASE_URL + "/curated-highspeed.geojson",
        "Loading curated high-speed rail stations...",
        CacheType.PERMANENT_CACHE,
    );
    const data = await response.json();
    return data;
};

export const fetchCuratedConsulates = async () => {
    const response = await cacheFetch(
        import.meta.env.BASE_URL + "/curated-consulates.geojson",
        "Loading curated consulates...",
        CacheType.PERMANENT_CACHE,
    );
    const data = await response.json();
    return data;
};

export const fetchCuratedAquariums = async () => {
    const response = await cacheFetch(
        import.meta.env.BASE_URL + "/curated-aquariums.geojson",
        "Loading curated aquariums...",
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
export const fetchLondonBoroughs = async () => {
    const response = await cacheFetch(
        import.meta.env.BASE_URL + "/london-boroughs.geojson",
        "Loading London boroughs...",
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
export const fetchThamesLine = async () => {
    const response = await cacheFetch(
        import.meta.env.BASE_URL + "/thames.geojson",
        "Loading the Thames...",
        CacheType.PERMANENT_CACHE,
    );
    const data = await response.json();
    return data;
};

export const fetchCuratedMuseums = async () => {
    const response = await cacheFetch(
        import.meta.env.BASE_URL + "/curated-museums.geojson",
        "Loading curated museums...",
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
    alternatives: string[] = [],
    timeoutDuration: number = 0,
) => {
    let query = "";
    const $polyGeoJSON = polyGeoJSON.get();
    if ($polyGeoJSON) {
        query = `
[out:json]${timeoutDuration != 0 ? `[timeout:${timeoutDuration}]` : ""};
(
${searchType}${filter}(poly:"${turf
            .getCoords($polyGeoJSON.features)
            .flatMap((polygon) => polygon.geometry.coordinates)
            .flat()
            .map((coord) => [coord[1], coord[0]].join(" "))
            .join(" ")}");
${
    alternatives.length > 0
        ? alternatives
              .map(
                  (alternative) =>
                      `${searchType}${alternative}(poly:"${turf
                          .getCoords($polyGeoJSON.features)
                          .flatMap((polygon) => polygon.geometry.coordinates)
                          .flat()
                          .map((coord) => [coord[1], coord[0]].join(" "))
                          .join(" ")}");`,
              )
              .join("\n")
        : ""
}
);
out ${outType};
`;
    } else {
        const primaryLocation = mapGeoLocation.get();
        const additionalLocations = additionalMapGeoLocations
            .get()
            .filter((entry) => entry.added)
            .map((entry) => entry.location);
        const allLocations = [primaryLocation, ...additionalLocations];
        const relationToAreaBlocks = allLocations
            .map((loc, idx) => {
                const regionVar = `.region${idx}`;
                return `relation(${loc.properties.osm_id});map_to_area->${regionVar};`;
            })
            .join("\n");
        const searchBlocks = allLocations
            .map((_, idx) => {
                const regionVar = `area.region${idx}`;
                const altQueries =
                    alternatives.length > 0
                        ? alternatives
                              .map(
                                  (alt) => `${searchType}${alt}(${regionVar});`,
                              )
                              .join("\n")
                        : "";
                return `
            ${searchType}${filter}(${regionVar});
            ${altQueries}
          `;
            })
            .join("\n");
        query = `
        [out:json]${timeoutDuration !== 0 ? `[timeout:${timeoutDuration}]` : ""};
        ${relationToAreaBlocks}
        (
        ${searchBlocks}
        );
        out ${outType};
        `;
    }
    const data = await getOverpassData(
        query,
        loadingText,
        CacheType.ZONE_CACHE,
    );
    const subtractedEntries = additionalMapGeoLocations
        .get()
        .filter((e) => !e.added);
    const subtractedPolygons = subtractedEntries.map((entry) => entry.location);
    if (subtractedPolygons.length > 0 && data && data.elements) {
        const turfPolys = await Promise.all(
            subtractedPolygons.map(
                async (location) =>
                    turf.combine(
                        await determineGeoJSON(
                            location.properties.osm_id.toString(),
                            location.properties.osm_type,
                        ),
                    ).features[0],
            ),
        );
        data.elements = data.elements.filter((el: any) => {
            const lon = el.center ? el.center.lon : el.lon;
            const lat = el.center ? el.center.lat : el.lat;
            if (typeof lon !== "number" || typeof lat !== "number")
                return false;
            const pt = turf.point([lon, lat]);
            return !turfPolys.some((poly) =>
                turf.booleanPointInPolygon(pt, poly as any),
            );
        });
    }
    return data;
};

export const determineMapBoundaries = async () => {
    const mapGeoDatum = await Promise.all(
        [
            {
                location: mapGeoLocation.get(),
                added: true,
                base: true,
            },
            ...additionalMapGeoLocations.get(),
        ].map(async (location) => ({
            added: location.added,
            data: await determineGeoJSON(
                location.location.properties.osm_id.toString(),
                location.location.properties.osm_type,
            ),
        })),
    );

    let mapGeoData = turf.featureCollection([
        safeUnion(
            turf.featureCollection(
                mapGeoDatum
                    .filter((x) => x.added)
                    .flatMap((x) => x.data.features),
            ) as any,
        ),
    ]);

    const differences = mapGeoDatum.filter((x) => !x.added).map((x) => x.data);

    if (differences.length > 0) {
        mapGeoData = turf.featureCollection([
            turf.difference(
                turf.featureCollection([
                    mapGeoData.features[0],
                    ...differences.flatMap((x) => x.features),
                ]),
            )!,
        ]);
    }

    if (turf.coordAll(mapGeoData).length > 10000) {
        turf.simplify(mapGeoData, {
            tolerance: 0.0005,
            highQuality: true,
            mutate: true,
        });
    }

    return turf.combine(mapGeoData) as FeatureCollection<MultiPolygon>;
};
