import fs from "fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/maps/api", async (orig) => ({
    ...(await orig<Record<string, unknown>>()),
    fetchThamesLine: async () =>
        JSON.parse(fs.readFileSync("public/thames.geojson", "utf8")),
}));

import { hiderifyMatching } from "@/maps/questions/matching";

const NORTH = 51.52;
const SOUTH = 51.498;
// Well outside Zone 1, but still clearly either side of the Thames.
const FAR_NORTH = 51.56;
const FAR_SOUTH = 51.46;

const answer = async (markerLat: number, hiderLat: number) => {
    const question: any = {
        type: "thames",
        lat: markerLat,
        lng: -0.1,
        same: true,
        drag: true,
        color: "red",
    };
    const result: any = await hiderifyMatching(question, {
        latitude: hiderLat,
        longitude: -0.1,
    });
    return result.same;
};

describe("hiderifyMatching (thames)", () => {
    it.each([
        ["north", NORTH, NORTH, true],
        ["north/south", NORTH, SOUTH, false],
        ["south/north", SOUTH, NORTH, false],
        ["south", SOUTH, SOUTH, true],
        [
            "south marker, hider far north (outside zone)",
            SOUTH,
            FAR_NORTH,
            false,
        ],
        [
            "south marker, hider far south (outside zone)",
            SOUTH,
            FAR_SOUTH,
            true,
        ],
        [
            "north marker, hider far north (outside zone)",
            NORTH,
            FAR_NORTH,
            true,
        ],
        [
            "north marker, hider far south (outside zone)",
            NORTH,
            FAR_SOUTH,
            false,
        ],
    ])("%s", async (_, marker, hider, expected) => {
        expect(await answer(marker, hider)).toBe(expected);
    });
});
