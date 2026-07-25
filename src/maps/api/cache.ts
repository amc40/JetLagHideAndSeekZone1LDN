import _ from "lodash";
import { toast } from "react-toastify";

import { CacheType } from "./types";

const determineQuestionCache = _.memoize(() => caches.open(CacheType.CACHE));
const determineZoneCache = _.memoize(() => caches.open(CacheType.ZONE_CACHE));
const determinePermanentCache = _.memoize(() =>
    caches.open(CacheType.PERMANENT_CACHE),
);

const inFlightFetches = new Map<string, Promise<Response>>();

// `cacheFetch` below caches responses keyed only by URL, with no expiry -
// fine for one-off Overpass query results, but for bundled public/ data
// files (curated stations, coastline, elevation grid, ...) it means a
// browser that cached one before a content update keeps serving the stale
// copy forever. Appending the file's build-time content hash as a query
// param makes an updated file a new cache key, so it's fetched fresh
// automatically on the next deploy - without ever touching
// localStorage-backed game state, which the Cache API never sees.
export const versionedPublicUrl = (filename: string) => {
    const version = import.meta.env.DATA_FILE_VERSIONS?.[filename];
    return `${import.meta.env.BASE_URL}/${filename}${
        version ? `?v=${version}` : ""
    }`;
};

export const determineCache = async (cacheType: CacheType) => {
    switch (cacheType) {
        case CacheType.CACHE:
            return await determineQuestionCache();
        case CacheType.ZONE_CACHE:
            return await determineZoneCache();
        case CacheType.PERMANENT_CACHE:
            return await determinePermanentCache();
    }
};

export const cacheFetch = async (
    url: string,
    loadingText?: string,
    cacheType: CacheType = CacheType.CACHE,
) => {
    try {
        const cache = await determineCache(cacheType);

        const cachedResponse = await cache.match(url);
        if (cachedResponse) {
            if (!cachedResponse.ok) {
                await cache.delete(url);
            } else {
                return cachedResponse.clone();
            }
        }

        const inflightKey = `${cacheType}:${url}`;
        const existingFetch = inFlightFetches.get(inflightKey);
        if (existingFetch) {
            const response = await existingFetch;
            return response.clone();
        }

        const fetchAndMaybeCache = async () => {
            const response = await fetch(url);
            if (response.ok) {
                await cache.put(url, response.clone());
            } else {
                await cache.delete(url);
            }
            return response;
        };

        const fetchPromise = fetchAndMaybeCache();
        inFlightFetches.set(inflightKey, fetchPromise);

        try {
            const response = await (loadingText
                ? toast.promise(fetchPromise, {
                      pending: loadingText,
                  })
                : fetchPromise);

            return response.clone();
        } finally {
            inFlightFetches.delete(inflightKey);
        }
    } catch (e) {
        console.log(e); // Probably a caches not supported error

        return fetch(url);
    }
};

export const clearCache = async (cacheType: CacheType = CacheType.CACHE) => {
    try {
        const cache = await determineCache(cacheType);
        await cache.keys().then((keys) => {
            keys.forEach((key) => {
                cache.delete(key);
            });
        });
    } catch (e) {
        console.log(e); // Probably a caches not supported error
    }
};
