import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import * as turf from "@turf/turf";
import { expect, test } from "vitest";

import {
    bilinearElevation,
    computeBelowElevationBand,
    elevationGridMeta,
    osgb36ToWgs84,
    wgs84ToOSGB36,
    worldToGridCoords,
} from "@/maps/geo-utils/elevation";

const BIN_PATH = fileURLToPath(
    new URL("../public/elevation-london.bin", import.meta.url),
);

const loadRealGrid = () => {
    const buffer = readFileSync(BIN_PATH);
    return new Int16Array(
        buffer.buffer,
        buffer.byteOffset,
        buffer.byteLength / 2,
    );
};

test("WGS84 <-> OSGB36 round-trips within a fraction of a metre", () => {
    // Trafalgar Square, roughly.
    const lat = 51.508;
    const lng = -0.1281;

    const [easting, northing] = wgs84ToOSGB36(lat, lng);
    const [roundTrippedLng, roundTrippedLat] = osgb36ToWgs84(easting, northing);

    expect(roundTrippedLat).toBeCloseTo(lat, 6);
    expect(roundTrippedLng).toBeCloseTo(lng, 6);
});

test("Trafalgar Square converts to a plausible British National Grid reference", () => {
    // Known OS grid reference for Trafalgar Square is approximately
    // TQ 30020 80450 (easting ~530020, northing ~180450).
    const [easting, northing] = wgs84ToOSGB36(51.508, -0.1281);

    expect(easting).toBeGreaterThan(529000);
    expect(easting).toBeLessThan(531000);
    expect(northing).toBeGreaterThan(179000);
    expect(northing).toBeLessThan(181000);
});

test("worldToGridCoords places Trafalgar Square inside the bundled grid", () => {
    const [easting, northing] = wgs84ToOSGB36(51.508, -0.1281);
    const { col, row } = worldToGridCoords(easting, northing);

    expect(col).toBeGreaterThanOrEqual(0);
    expect(col).toBeLessThanOrEqual(elevationGridMeta.width - 1);
    expect(row).toBeGreaterThanOrEqual(0);
    expect(row).toBeLessThanOrEqual(elevationGridMeta.height - 1);
});

test("bilinearElevation interpolates between grid cells", () => {
    // A tiny 2x2 grid: 0, 100 on the top row; 0, 100 on the bottom row.
    const grid = new Int16Array([0, 1000, 0, 1000]);
    const originalMeta = { ...elevationGridMeta };
    (elevationGridMeta as any).width = 2;
    (elevationGridMeta as any).height = 2;

    try {
        expect(bilinearElevation(grid, 0, 0)).toBeCloseTo(0, 5);
        expect(bilinearElevation(grid, 1, 0)).toBeCloseTo(100, 5);
        expect(bilinearElevation(grid, 0.5, 0)).toBeCloseTo(50, 5);
    } finally {
        Object.assign(elevationGridMeta, originalMeta);
    }
});

test("real bundled elevation grid covers Greater London with a sane range", () => {
    const grid = loadRealGrid();
    expect(grid.length).toBe(
        elevationGridMeta.width * elevationGridMeta.height,
    );

    let min = Infinity;
    let max = -Infinity;
    for (const value of grid) {
        min = Math.min(min, value / 10);
        max = Math.max(max, value / 10);
    }

    expect(min).toBeCloseTo(elevationGridMeta.minElevationMetres, 0);
    expect(max).toBeCloseTo(elevationGridMeta.maxElevationMetres, 0);
    // Sanity: Greater London's elevation range is well within these bounds.
    expect(min).toBeGreaterThan(-50);
    expect(max).toBeLessThan(300);
});

test("computeBelowElevationBand splits a synthetic elevation gradient", () => {
    // A smooth gradient over a 2km square: elevation rises from 0 to 100m
    // west-to-east.
    const points = [];
    for (let x = 0; x <= 20; x++) {
        for (let y = 0; y <= 20; y++) {
            points.push(turf.point([x * 100, y * 100], { elevation: x * 5 }));
        }
    }
    const pointGrid = turf.featureCollection(points);

    const band = computeBelowElevationBand(pointGrid, 50, 0, 100);
    expect(band).not.toBe(false);
    if (band === false) return;

    // Points clearly west of the threshold should fall inside the band;
    // points clearly east of it should not.
    const west = turf.point([200, 1000]); // elevation ~10
    const east = turf.point([1800, 1000]); // elevation ~90

    expect(turf.booleanPointInPolygon(west, band)).toBe(true);
    expect(turf.booleanPointInPolygon(east, band)).toBe(false);
});

test("computeBelowElevationBand returns false when nothing is below the reference", () => {
    // Same gradient as above (elevation 0-100m), but asking for the band
    // below a reference that's beneath the grid's actual minimum.
    const points = [];
    for (let x = 0; x <= 20; x++) {
        for (let y = 0; y <= 20; y++) {
            points.push(turf.point([x * 100, y * 100], { elevation: x * 5 }));
        }
    }
    const pointGrid = turf.featureCollection(points);

    const band = computeBelowElevationBand(pointGrid, -10, 0, 100);
    expect(band).toBe(false);
});
