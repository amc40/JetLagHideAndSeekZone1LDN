import { describe, expect, test } from "vitest";

// The curated-station metadata (modes + lines) is derived by this build-time
// script from OpenStreetMap. These cover its pure classification helpers.
import {
    classifyModes,
    cleanName,
    deriveLines,
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

describe("deriveLines", () => {
    test("names Underground / DLR / Elizabeth / Overground lines", () => {
        expect(
            deriveLines({
                route: "subway",
                network: "London Underground",
                name: "Central line: West Ruislip → Epping",
            }),
        ).toEqual([{ line: "Central line", mode: "tube" }]);
        expect(
            deriveLines({ route: "train", network: "Elizabeth line" }),
        ).toEqual([{ line: "Elizabeth line", mode: "elizabeth" }]);
        expect(
            deriveLines({ route: "light_rail", name: "DLR: Bank → Lewisham" }),
        ).toEqual([{ line: "DLR", mode: "dlr" }]);
        // Overground recognised by line name even when tagged operator=TfL/route=train.
        expect(
            deriveLines({
                route: "train",
                operator: "Transport for London",
                name: "Windrush Line: Highbury & Islington → New Cross",
            }),
        ).toEqual([{ line: "Windrush Line", mode: "overground" }]);
    });

    test("National Rail routes become their (canonicalised) TOC", () => {
        expect(
            deriveLines({
                route: "train",
                operator: "Southeastern",
                name: "Cannon Street => Dartford",
            }),
        ).toEqual([{ line: "Southeastern", mode: "rail" }]);
        // Aliases collapse to one canonical name.
        expect(
            deriveLines({ route: "train", operator: "Abellio Greater Anglia" }),
        ).toEqual([{ line: "Greater Anglia", mode: "rail" }]);
        // Joint services split into one line per operator.
        expect(
            deriveLines({
                route: "train",
                operator: "Southern;Gatwick Express",
            }),
        ).toEqual([
            { line: "Southern", mode: "rail" },
            { line: "Gatwick Express", mode: "rail" },
        ]);
    });

    test("ignores umbrella operators that aren't a real line", () => {
        expect(
            deriveLines({ route: "train", operator: "Network Rail" }),
        ).toEqual([]);
        expect(deriveLines({ route: "train", operator: "" })).toEqual([]);
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
