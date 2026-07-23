import { describe, expect, test } from "vitest";

// The curated-station metadata (modes + lines) is derived by this build-time
// script from OpenStreetMap. These cover its pure classification helpers.
import {
    classifyModes,
    cleanName,
    deriveLine,
    normaliseName,
} from "../scripts/generate-curated-stations.mjs";

describe("classifyModes", () => {
    test("tube via subway tag", () => {
        expect(classifyModes({ railway: "station", subway: "yes" })).toEqual([
            "tube",
        ]);
    });

    test("dlr / elizabeth / overground / tram via network text", () => {
        expect(
            classifyModes({
                station: "light_rail",
                network: "Docklands Light Railway",
            }),
        ).toEqual(["dlr"]);
        expect(
            classifyModes({ railway: "station", network: "Elizabeth line" }),
        ).toEqual(["elizabeth"]);
        expect(
            classifyModes({
                railway: "station",
                operator: "London Overground",
            }),
        ).toEqual(["overground"]);
        expect(classifyModes({ railway: "tram_stop" })).toEqual(["tram"]);
    });

    test("plain railway station falls back to national rail", () => {
        expect(classifyModes({ railway: "station" })).toEqual(["rail"]);
    });
});

describe("deriveLine", () => {
    test("names Underground / DLR / Elizabeth lines", () => {
        expect(
            deriveLine({
                route: "subway",
                network: "London Underground",
                name: "Central line: West Ruislip → Epping",
            }),
        ).toEqual({ line: "Central line", mode: "tube" });
        expect(
            deriveLine({ route: "train", network: "Elizabeth line" }),
        ).toEqual({ line: "Elizabeth line", mode: "elizabeth" });
        expect(
            deriveLine({ route: "light_rail", name: "DLR: Bank → Lewisham" }),
        ).toEqual({ line: "DLR", mode: "dlr" });
    });

    test("ignores National Rail service-pattern routes", () => {
        expect(
            deriveLine({
                route: "train",
                network: "National Rail",
                name: "London King's Cross => Aberdeen",
            }),
        ).toBeNull();
    });
});

describe("name helpers", () => {
    test("cleanName strips mode suffixes, London prefix and parentheticals", () => {
        expect(cleanName("Oxford Circus tube station")).toBe("Oxford Circus");
        expect(cleanName("London Paddington station")).toBe("Paddington");
        expect(
            cleanName(
                "Paddington tube station (Bakerloo, Circle and District lines)",
            ),
        ).toBe("Paddington");
    });

    test("normaliseName makes co-located NR + Tube entries comparable", () => {
        expect(normaliseName("London Paddington station")).toBe("paddington");
        expect(normaliseName("Paddington tube station (Bakerloo line)")).toBe(
            "paddington",
        );
    });
});
