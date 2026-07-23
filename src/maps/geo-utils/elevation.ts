import * as turf from "@turf/turf";
import type {
    Feature,
    FeatureCollection,
    MultiPolygon,
    Point,
    Polygon,
} from "geojson";
import proj4 from "proj4";

import { cacheFetch, CacheType } from "@/maps/api";

import elevationGridMetaJson from "./elevation-grid.json";

// Offline elevation lookups for the "Sea Level" Measuring question, backed
// by a bundled OS Terrain 50 grid covering Greater London (see
// scripts/generate-elevation-data.mjs). Data source:
// OS Terrain 50, Contains OS data (c) Crown copyright and database right,
// licensed under the Open Government Licence v3.0
// (https://www.ordnancesurvey.co.uk/opendata/licence).

interface ElevationGridMeta {
    originEasting: number;
    originNorthing: number;
    cellSize: number;
    width: number;
    height: number;
    minElevationMetres: number;
    maxElevationMetres: number;
}

export const elevationGridMeta = elevationGridMetaJson as ElevationGridMeta;
const meta = elevationGridMeta;

// EPSG:27700 (OSGB36 / British National Grid), approximated via the
// standard 7-parameter Helmert transform rather than the full OSTN15 shift
// grid. This is accurate to roughly 5-15m across Great Britain, well within
// this dataset's 100m grid resolution.
const OSGB36_PROJ4 =
    "+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 +units=m +no_defs";

export const wgs84ToOSGB36 = (lat: number, lng: number): [number, number] =>
    proj4("WGS84", OSGB36_PROJ4, [lng, lat]);

export const osgb36ToWgs84 = (
    easting: number,
    northing: number,
): [number, number] => proj4(OSGB36_PROJ4, "WGS84", [easting, northing]);

export const worldToGridCoords = (easting: number, northing: number) => {
    const col = (easting - meta.originEasting) / meta.cellSize;
    const rowFromBottom = (northing - meta.originNorthing) / meta.cellSize;
    // Row 0 in the stored grid is the northmost row.
    const row = meta.height - 1 - rowFromBottom;
    return { col, row };
};

let gridPromise: Promise<Int16Array> | null = null;

const loadGrid = (): Promise<Int16Array> => {
    if (!gridPromise) {
        gridPromise = (async () => {
            const response = await cacheFetch(
                import.meta.env.BASE_URL + "/elevation-london.bin",
                "Loading elevation data...",
                CacheType.PERMANENT_CACHE,
            );
            const buffer = await response.arrayBuffer();
            return new Int16Array(buffer);
        })();
    }
    return gridPromise;
};

export const bilinearElevation = (
    grid: Int16Array,
    col: number,
    row: number,
): number => {
    const c0 = Math.floor(col);
    const r0 = Math.floor(row);
    const c1 = Math.min(c0 + 1, meta.width - 1);
    const r1 = Math.min(r0 + 1, meta.height - 1);
    const fc = col - c0;
    const fr = row - r0;

    const v00 = grid[r0 * meta.width + c0];
    const v01 = grid[r0 * meta.width + c1];
    const v10 = grid[r1 * meta.width + c0];
    const v11 = grid[r1 * meta.width + c1];

    const top = v00 + (v01 - v00) * fc;
    const bottom = v10 + (v11 - v10) * fc;
    // Stored in decimetres.
    return (top + (bottom - top) * fr) / 10;
};

/** Elevation above sea level (metres) at a WGS84 coordinate, or null if it
 * falls outside the bundled Greater London coverage area. */
export const getElevationAt = async (
    lat: number,
    lng: number,
): Promise<number | null> => {
    const [easting, northing] = wgs84ToOSGB36(lat, lng);
    const { col, row } = worldToGridCoords(easting, northing);

    if (col < 0 || row < 0 || col > meta.width - 1 || row > meta.height - 1) {
        return null;
    }

    const grid = await loadGrid();
    return bilinearElevation(grid, col, row);
};

let pointGridPromise: Promise<FeatureCollection<Point>> | null = null;

const buildElevationPointGrid = (): Promise<FeatureCollection<Point>> => {
    if (!pointGridPromise) {
        pointGridPromise = (async () => {
            const grid = await loadGrid();
            const points: Feature<Point>[] = [];

            for (let row = 0; row < meta.height; row++) {
                const northing =
                    meta.originNorthing +
                    (meta.height - 1 - row) * meta.cellSize;
                for (let col = 0; col < meta.width; col++) {
                    const easting = meta.originEasting + col * meta.cellSize;
                    const elevation = grid[row * meta.width + col] / 10;
                    points.push(turf.point([easting, northing], { elevation }));
                }
            }

            return turf.featureCollection(points);
        })();
    }
    return pointGridPromise;
};

/** The region covered by `pointGrid` whose `elevation` property is lower
 * than `referenceElevationMetres` ("closer to sea level"), in the same
 * coordinate space as the input points. Returns false if no such region
 * exists (e.g. the reference elevation is at or below the lowest point in
 * the grid). `minMetres`/`maxMetres` must bound every elevation value in
 * `pointGrid`. */
export const computeBelowElevationBand = (
    pointGrid: FeatureCollection<Point>,
    referenceElevationMetres: number,
    minMetres: number,
    maxMetres: number,
): Feature<Polygon | MultiPolygon> | false => {
    const epsilon = 0.1;
    const clampedReference = Math.min(
        Math.max(referenceElevationMetres, minMetres - 1 + epsilon),
        maxMetres + 1 - epsilon,
    );

    const bands = turf.isobands(
        pointGrid,
        [minMetres - 1, clampedReference, maxMetres + 1],
        { zProperty: "elevation" },
    );

    const belowBand = bands.features[0];
    if (!belowBand || belowBand.geometry.coordinates.length === 0) {
        return false;
    }

    return belowBand as Feature<Polygon | MultiPolygon>;
};

/** The region within the bundled elevation coverage area whose elevation is
 * lower than `referenceElevationMetres` ("closer to sea level"), as a WGS84
 * polygon. Returns false if no such region exists (e.g. the reference
 * elevation is at or below the lowest point in the covered area). */
export const computeSeaLevelBand = async (
    referenceElevationMetres: number,
): Promise<Feature<Polygon | MultiPolygon> | false> => {
    const pointGrid = await buildElevationPointGrid();
    const belowBand = computeBelowElevationBand(
        pointGrid,
        referenceElevationMetres,
        meta.minElevationMetres,
        meta.maxElevationMetres,
    );

    if (belowBand === false) return false;

    turf.coordEach(belowBand, (coord) => {
        const [lng, lat] = osgb36ToWgs84(coord[0], coord[1]);
        coord[0] = lng;
        coord[1] = lat;
    });

    return belowBand;
};

export const ELEVATION_DATA_ATTRIBUTION =
    "Contains OS data © Crown copyright and database right (OS Terrain 50, Open Government Licence v3.0)";
