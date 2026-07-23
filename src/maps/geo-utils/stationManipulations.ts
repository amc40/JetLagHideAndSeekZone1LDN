import * as turf from "@turf/turf";

import type { StationPlace } from "@/maps/api";

import { classifyStationModes, STATION_MODES } from "./stationModes";

// Two stations at most this far apart are treated as the same physical
// interchange regardless of name (e.g. stacked National Rail + Tube platforms).
const CO_LOCATION_RADIUS_METERS = 150;
// Two stations this far apart are merged only when their names match, catching
// interchanges spread over a larger footprint but with a shared name.
const NAME_MATCH_RADIUS_METERS = 500;

const extractName = (place: StationPlace): string =>
    (place.properties["name:en"] as string) ||
    (place.properties.name as string) ||
    "";

/** Normalise a station name for loose equality (drop punctuation, mode suffixes). */
const normaliseName = (name: string): string =>
    name
        .toLowerCase()
        .replace(/['`’.]/g, "")
        .replace(
            /\b(london underground|underground|tube|dlr|overground|national rail|railway|rail|light rail|tram|station|stop|halt)\b/g,
            "",
        )
        .replace(/\s+/g, " ")
        .trim();

const distanceMeters = (a: StationPlace, b: StationPlace): number =>
    turf.distance(a.geometry.coordinates, b.geometry.coordinates, {
        units: "meters",
    });

/**
 * Merge co-located stations (e.g. a National Rail station and the Tube station
 * on top of it) into a single station. The merged station keeps every member's
 * OSM id (`memberIds`, used for "same train line" checks) and the union of the
 * transport modes served (`modes`, used to render one icon per mode).
 */
export function mergeCoLocatedStations(places: StationPlace[]): StationPlace[] {
    const n = places.length;
    if (n === 0) return [];

    const normNames = places.map((p) => normaliseName(extractName(p)));

    // Union-find over stations that belong to the same interchange.
    const parent = Array.from({ length: n }, (_, i) => i);
    const find = (i: number): number => {
        while (parent[i] !== i) {
            parent[i] = parent[parent[i]];
            i = parent[i];
        }
        return i;
    };
    const union = (i: number, j: number) => {
        const ri = find(i);
        const rj = find(j);
        if (ri !== rj) parent[ri] = rj;
    };

    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            // Cheap bounding-box prefilter (~0.01° ≈ 1.1km) before the geodesic distance.
            const [lngA, latA] = places[i].geometry.coordinates;
            const [lngB, latB] = places[j].geometry.coordinates;
            if (Math.abs(latA - latB) > 0.01 || Math.abs(lngA - lngB) > 0.01) {
                continue;
            }

            const d = distanceMeters(places[i], places[j]);
            const sameName =
                normNames[i] !== "" && normNames[i] === normNames[j];

            if (
                d <= CO_LOCATION_RADIUS_METERS ||
                (sameName && d <= NAME_MATCH_RADIUS_METERS)
            ) {
                union(i, j);
            }
        }
    }

    const groups = new Map<number, number[]>();
    for (let i = 0; i < n; i++) {
        const root = find(i);
        const group = groups.get(root);
        if (group) group.push(i);
        else groups.set(root, [i]);
    }

    const merged: StationPlace[] = [];
    groups.forEach((indices) => {
        const members = indices.map((i) => places[i]);

        const avgLng =
            members.reduce((sum, p) => sum + p.geometry.coordinates[0], 0) /
            members.length;
        const avgLat =
            members.reduce((sum, p) => sum + p.geometry.coordinates[1], 0) /
            members.length;

        // Union of modes, kept in canonical order for stable icon layout.
        const modeSet = new Set(
            members.flatMap((m) => classifyStationModes(m.properties)),
        );
        const modes = STATION_MODES.filter((mode) => modeSet.has(mode));

        const memberIds = members
            .map((m) => m.properties.id)
            .filter((id): id is string => typeof id === "string");

        // Prefer a National Rail member's name as the canonical interchange name,
        // then the longest available name.
        const railMembers = members.filter((m) =>
            classifyStationModes(m.properties).includes("rail"),
        );
        const namePool = (railMembers.length ? railMembers : members)
            .map(extractName)
            .filter(Boolean)
            .sort((a, b) => b.length - a.length);
        const name = namePool[0] ?? extractName(members[0]);

        merged.push({
            ...members[0],
            geometry: {
                type: "Point",
                coordinates: [avgLng, avgLat],
            },
            properties: {
                ...members[0].properties,
                id: memberIds[0] ?? members[0].properties.id,
                name,
                "name:en": name,
                modes,
                memberIds,
            },
        });
    });

    return merged;
}
