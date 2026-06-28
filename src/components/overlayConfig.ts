export type OverlayKey =
    | "hospital"
    | "museum"
    | "aquarium"
    | "theme_park"
    | "zoo"
    | "cinema"
    | "library"
    | "golf_course"
    | "consulate"
    | "peak"
    | "park"
    | "airport";

export type OverlayConfig = {
    label: string;
    filter: string;
    color: string;
    letter: string;
    searchType?:
        | "nwr"
        | "node"
        | "way"
        | "relation"
        | "nw"
        | "wr"
        | "nr"
        | "area";
};

export const OVERLAY_CONFIG: Record<OverlayKey, OverlayConfig> = {
    hospital: {
        label: "Hospitals",
        filter: "[amenity=hospital]",
        color: "#CB2B3E",
        letter: "H",
    },
    museum: {
        label: "Museums",
        filter: "[tourism=museum]",
        color: "#2A81CB",
        letter: "Mu",
    },
    aquarium: {
        label: "Aquariums",
        filter: "[tourism=aquarium]",
        color: "#0891b2",
        letter: "Aq",
    },
    theme_park: {
        label: "Theme Parks",
        filter: "[tourism=theme_park]",
        color: "#CB8427",
        letter: "TP",
    },
    zoo: {
        label: "Zoos",
        filter: "[tourism=zoo]",
        color: "#2AAD27",
        letter: "Z",
    },
    cinema: {
        label: "Cinemas",
        filter: "[amenity=cinema]",
        color: "#9C2BCB",
        letter: "C",
    },
    library: {
        label: "Libraries",
        filter: "[amenity=library]",
        color: "#b45309",
        letter: "Li",
    },
    golf_course: {
        label: "Golf Courses",
        filter: "[leisure=golf_course]",
        color: "#15803d",
        letter: "G",
    },
    consulate: {
        label: "Consulates",
        filter: "[diplomatic=consulate]",
        color: "#7B7B7B",
        letter: "D",
    },
    peak: {
        label: "Mountain Peaks",
        filter: "[natural=peak]",
        color: "#3D3D3D",
        letter: "Mt",
    },
    park: {
        label: "Parks",
        filter: "[leisure=park][name]",
        color: "#4ade80",
        letter: "P",
    },
    airport: {
        label: "Airports",
        filter: '["aeroway"="aerodrome"]["iata"]',
        color: "#003087",
        letter: "AP",
    },
};
