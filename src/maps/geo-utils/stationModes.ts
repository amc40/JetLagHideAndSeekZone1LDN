// Classifies an OSM station feature into the London transport mode(s) it serves,
// so co-located interchange stations can be rendered with each mode's icon.
//
// OSM tags stations inconsistently, so we look across several tags
// (station/subway/light_rail plus network/operator/line free text). A single
// node usually represents a single mode; the full mode set for an interchange
// is built by unioning the modes of co-located nodes (see mergeCoLocatedStations).

export type StationMode =
    | "tube"
    | "rail"
    | "dlr"
    | "overground"
    | "elizabeth"
    | "tram";

export const STATION_MODES: StationMode[] = [
    "tube",
    "rail",
    "dlr",
    "overground",
    "elizabeth",
    "tram",
];

type Tags = Record<string, unknown> | undefined;

const lc = (value: unknown) =>
    typeof value === "string" ? value.toLowerCase() : "";

/**
 * Determine which London transport mode(s) an OSM station feature serves.
 * Returns at least one mode; anything that isn't clearly a special mode falls
 * back to "rail" (National Rail).
 */
export function classifyStationModes(tags: Tags): StationMode[] {
    if (!tags) return ["rail"];

    // Free-text tags that name the operator/network/line, searched case-insensitively.
    const text = [
        tags.network,
        tags["network:en"],
        tags.operator,
        tags.line,
        tags.name,
        tags["name:en"],
    ]
        .map(lc)
        .join(" | ");

    const station = lc(tags.station);
    const railway = lc(tags.railway);

    const modes = new Set<StationMode>();

    // Tube — subway tagging is reliable.
    if (station === "subway" || lc(tags.subway) === "yes") {
        modes.add("tube");
    }

    // DLR — light rail operated by the Docklands Light Railway.
    if (
        text.includes("docklands") ||
        /\bdlr\b/.test(text) ||
        (station === "light_rail" && text.includes("dlr"))
    ) {
        modes.add("dlr");
    }

    // Elizabeth line (formerly Crossrail / TfL Rail).
    if (text.includes("elizabeth") || text.includes("crossrail")) {
        modes.add("elizabeth");
    }

    // London Overground.
    if (text.includes("overground")) {
        modes.add("overground");
    }

    // Tram (London Trams / Tramlink).
    if (
        railway === "tram_stop" ||
        station === "tram" ||
        lc(tags.tram) === "yes" ||
        text.includes("tramlink") ||
        text.includes("london trams")
    ) {
        modes.add("tram");
    }

    // National Rail fallback — a generic railway station with no special mode.
    if (modes.size === 0) {
        modes.add("rail");
    }

    return STATION_MODES.filter((mode) => modes.has(mode));
}
