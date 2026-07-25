import * as turf from "@turf/turf";
import fs from "fs";
import type { Feature, Point } from "geojson";
import path from "path";
import { describe, expect, test } from "vitest";

import { TFL_ZONE_1_POLYGON } from "../src/lib/map-presets";

// Every curated POI list is meant to be scoped to the TfL Zone 1 play area
// (see CLAUDE.md / the curate-pois skill), so any entry whose resolved
// coordinates fall outside TFL_ZONE_1_POLYGON indicates either a curation
// mistake or a stale generated file that needs `pnpm generate:pois` re-run.
const zonePolygon = TFL_ZONE_1_POLYGON.features[0];

const publicDir = path.join(import.meta.dirname, "../public");
const curatedFiles = fs
    .readdirSync(publicDir)
    .filter((f) => f.startsWith("curated-") && f.endsWith(".geojson"));

describe("curated POIs are within TFL_ZONE_1_POLYGON", () => {
    test.each(curatedFiles)("%s", (file) => {
        const fc = JSON.parse(
            fs.readFileSync(path.join(publicDir, file), "utf8"),
        );

        const outside = fc.features.filter(
            (f: Feature<Point>) => !turf.booleanPointInPolygon(f, zonePolygon),
        );

        const names = outside.map(
            (f: Feature<Point>) => f.properties?.name ?? f.properties?.id,
        );
        expect(names).toEqual([]);
    });
});
