export type OverlayKey =
    | "hospital"
    | "museum"
    | "aquarium"
    | "cinema"
    | "library"
    | "consulate"
    | "park";

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
    consulate: {
        label: "Consulates",
        filter: "[diplomatic=consulate]",
        color: "#7B7B7B",
        letter: "D",
    },
    park: {
        label: "Parks",
        filter: "[leisure=park][name]",
        color: "#4ade80",
        letter: "P",
    },
};
