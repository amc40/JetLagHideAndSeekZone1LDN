import * as turf from "@turf/turf";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { expect, test, vi } from "vitest";

import {
    hidingRadius,
    movementAllowance,
    showMovementAllowance,
} from "@/lib/context";
import {
    applyQuestionsToMapGeoData,
    applyQuestionsToMapGeoDataWithAllowance,
    safeUnion,
} from "@/maps";
import type * as GeoUtils from "@/maps/geo-utils";
import { questionSchema } from "@/maps/schema";

// @arcgis/core's geodesic buffer is WASM behind a CommonJS loader, which throws
// "require is not defined" under vitest. What's under test here is the
// composition — that each answer's allowed region is dilated before the regions
// are intersected — which is the same whether the buffer is geodesic or planar,
// so a turf buffer stands in. Distances are kept small and mid-latitude so the
// planar approximation stays well inside the margins asserted below.
vi.mock("@/maps/geo-utils", async (importOriginal) => {
    const actual = await importOriginal<typeof GeoUtils>();
    return {
        ...actual,
        arcBuffer: async (geometry: any, distance: number, unit: any) =>
            turf.buffer(geometry, distance, { units: unit }),
    };
});

const CENTRE: [number, number] = [-0.1278, 51.5074];

// A generous play area so the allowance never bumps into its edge.
const playArea = () =>
    turf.featureCollection([
        turf.circle(CENTRE, 20, { steps: 64, units: "kilometers" }),
    ]) as FeatureCollection<Polygon | MultiPolygon>;

const radiusQuestion = (within: boolean) =>
    questionSchema.parse({
        id: "radius",
        data: {
            lat: CENTRE[1],
            lng: CENTRE[0],
            radius: 2,
            unit: "kilometers",
            within,
        },
    });

/** A point `km` east of the question's centre. */
const eastOf = (km: number) =>
    turf.destination(CENTRE, km, 90, { units: "kilometers" });

const contains = (area: any, point: any) =>
    turf.booleanPointInPolygon(point, safeUnion(area) as any);

test("allowance widens a 'within' answer by the movement budget", async () => {
    const questions = [radiusQuestion(true)];

    const strict = await applyQuestionsToMapGeoData(
        questions,
        playArea(),
        false,
    );
    const relaxed = await applyQuestionsToMapGeoDataWithAllowance(
        questions,
        playArea(),
        1,
        "kilometers",
        false,
    );

    // Inside the answered radius: viable either way.
    expect(contains(strict, eastOf(1))).toBe(true);
    expect(contains(relaxed, eastOf(1))).toBe(true);

    // Just outside it, but within the movement budget: strictly eliminated,
    // yet still reachable by a hider who moved.
    expect(contains(strict, eastOf(2.5))).toBe(false);
    expect(contains(relaxed, eastOf(2.5))).toBe(true);

    // Beyond radius + budget: eliminated under both readings.
    expect(contains(strict, eastOf(3.5))).toBe(false);
    expect(contains(relaxed, eastOf(3.5))).toBe(false);
});

test("allowance shrinks the hole cut by a 'not within' answer", async () => {
    const questions = [radiusQuestion(false)];

    const strict = await applyQuestionsToMapGeoData(
        questions,
        playArea(),
        false,
    );
    const relaxed = await applyQuestionsToMapGeoDataWithAllowance(
        questions,
        playArea(),
        1,
        "kilometers",
        false,
    );

    // Dilating the *allowed* region has to eat into the excluded circle, not
    // grow it — the direction a naive buffer of the final result would get
    // backwards.
    expect(contains(strict, eastOf(1.5))).toBe(false);
    expect(contains(relaxed, eastOf(1.5))).toBe(true);

    // Deep inside the excluded circle, past the budget: still eliminated.
    expect(contains(strict, eastOf(0.5))).toBe(false);
    expect(contains(relaxed, eastOf(0.5))).toBe(false);
});

test("the allowance is twice the hiding zone radius, and opt-outable", () => {
    showMovementAllowance.set(true);

    hidingRadius.set(0.5);
    expect(movementAllowance.get()).toBe(1);

    hidingRadius.set(0.25);
    expect(movementAllowance.get()).toBe(0.5);

    // A cleared radius input parses to NaN; that must not reach arcBuffer.
    hidingRadius.set(NaN);
    expect(movementAllowance.get()).toBe(0);

    hidingRadius.set(0.5);
    showMovementAllowance.set(false);
    expect(movementAllowance.get()).toBe(0);

    showMovementAllowance.set(true);
});

test("a zero allowance reproduces the strict area", async () => {
    const questions = [radiusQuestion(true)];

    const relaxed = await applyQuestionsToMapGeoDataWithAllowance(
        questions,
        playArea(),
        0,
        "kilometers",
        false,
    );

    expect(contains(relaxed, eastOf(1))).toBe(true);
    expect(contains(relaxed, eastOf(2.5))).toBe(false);
});
