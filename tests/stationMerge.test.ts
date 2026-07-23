import { describe, expect, test } from "vitest";

import type { StationPlace } from "@/maps/api";
import { classifyStationModes } from "@/maps/geo-utils/stationModes";
import { mergeCoLocatedStations } from "@/maps/geo-utils/stationManipulations";

const station = (
    id: string,
    name: string,
    lng: number,
    lat: number,
    tags: Record<string, string> = {},
): StationPlace => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [lng, lat] },
    properties: { id, name, ...tags },
});

describe("classifyStationModes", () => {
    test("tube via subway tag", () => {
        expect(
            classifyStationModes({ railway: "station", subway: "yes" }),
        ).toEqual(["tube"]);
    });

    test("overground / dlr / elizabeth / tram via network text", () => {
        expect(
            classifyStationModes({
                railway: "station",
                network: "London Overground",
            }),
        ).toEqual(["overground"]);
        expect(
            classifyStationModes({
                station: "light_rail",
                network: "Docklands Light Railway",
            }),
        ).toEqual(["dlr"]);
        expect(
            classifyStationModes({
                railway: "station",
                line: "Elizabeth line",
            }),
        ).toEqual(["elizabeth"]);
        expect(classifyStationModes({ railway: "tram_stop" })).toEqual([
            "tram",
        ]);
    });

    test("plain railway station falls back to national rail", () => {
        expect(classifyStationModes({ railway: "station" })).toEqual(["rail"]);
    });
});

describe("mergeCoLocatedStations", () => {
    test("merges a co-located National Rail + Tube station into one", () => {
        const railway = station("node/1", "Paddington", -0.1774, 51.5173, {
            railway: "station",
            network: "National Rail",
        });
        const tube = station("node/2", "Paddington", -0.177, 51.517, {
            railway: "station",
            subway: "yes",
        });

        const merged = mergeCoLocatedStations([railway, tube]);

        expect(merged).toHaveLength(1);
        expect(merged[0].properties.modes).toEqual(["tube", "rail"]);
        expect(merged[0].properties.memberIds).toEqual(["node/1", "node/2"]);
        expect(merged[0].properties.name).toBe("Paddington");
    });

    test("keeps distinct, distant stations separate", () => {
        const paddington = station("node/1", "Paddington", -0.1774, 51.5173, {
            railway: "station",
        });
        const bank = station("node/9", "Bank", -0.0886, 51.5133, {
            railway: "station",
            subway: "yes",
        });

        const merged = mergeCoLocatedStations([paddington, bank]);

        expect(merged).toHaveLength(2);
    });

    test("merges same-named stations within the name-match radius", () => {
        // Two Euston nodes ~300m apart with the same name.
        const a = station("node/10", "Euston", -0.1331, 51.5284, {
            railway: "station",
        });
        const b = station("node/11", "Euston", -0.1339, 51.5306, {
            railway: "station",
            subway: "yes",
        });

        const merged = mergeCoLocatedStations([a, b]);

        expect(merged).toHaveLength(1);
        expect(merged[0].properties.memberIds).toEqual(["node/10", "node/11"]);
    });
});
