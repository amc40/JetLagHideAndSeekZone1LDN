import * as turf from "@turf/turf";
import type { Feature, LineString, Polygon } from "geojson";

// Large enough to run well past any playable map area; the real boundary
// polygon clips this down via intersect/difference, so precision here
// doesn't matter, only that it's bigger than the zone.
const FUDGE_DISTANCE_KM = 300;

/**
 * Builds the polygon lying on the north side of a (roughly west-to-east
 * flowing) river line, padded far past both ends and capped far to the
 * north. Intended to be intersected/differenced against the real map
 * boundary, which is always much smaller than the padding.
 */
export const riverNorthPolygon = (
    river: Feature<LineString>,
): Feature<Polygon> => {
    const coords = turf.getCoords(river) as [number, number][];
    const first = coords[0];
    const last = coords[coords.length - 1];

    const startBearing = turf.bearing(coords[1], first);
    const endBearing = turf.bearing(coords[coords.length - 2], last);

    const farWest = turf.destination(first, FUDGE_DISTANCE_KM, startBearing, {
        units: "kilometers",
    });
    const farEast = turf.destination(last, FUDGE_DISTANCE_KM, endBearing, {
        units: "kilometers",
    });

    const capWest = turf.destination(farWest, FUDGE_DISTANCE_KM, 0, {
        units: "kilometers",
    });
    const capEast = turf.destination(farEast, FUDGE_DISTANCE_KM, 0, {
        units: "kilometers",
    });

    return turf.polygon([
        [
            turf.getCoord(capWest),
            turf.getCoord(farWest),
            first,
            ...coords.slice(1, -1),
            last,
            turf.getCoord(farEast),
            turf.getCoord(capEast),
            turf.getCoord(capWest),
        ],
    ]);
};
