import { persistentAtom } from "@nanostores/persistent";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type { Map } from "leaflet";
import { atom, computed, onSet } from "nanostores";

import { TFL_ZONE_1_POLYGON } from "@/lib/map-presets";
import type { OpenStreetMap, StationCircle } from "@/maps/api";
import { extractStationLabel } from "@/maps/geo-utils";
import {
    type DeepPartial,
    type Question,
    type Questions,
    questionSchema,
    questionsSchema,
    type Units,
} from "@/maps/schema";

export const mapGeoLocation = persistentAtom<OpenStreetMap>(
    "mapGeoLocation",
    {
        geometry: {
            coordinates: [51.5074, -0.1278],
            type: "Point",
        },
        type: "Feature",
        properties: {
            osm_type: "R",
            osm_id: 65606,
            extent: [51.6919, -0.5104, 51.2868, 0.334],
            country: "United Kingdom",
            osm_key: "place",
            countrycode: "GB",
            osm_value: "city",
            name: "London",
            type: "city",
        },
    },
    {
        encode: JSON.stringify,
        decode: JSON.parse,
    },
);

export const permanentOverlay = persistentAtom<FeatureCollection | null>(
    "permanentOverlay",
    null,
    {
        encode: JSON.stringify,
        decode: JSON.parse,
    },
);

export const mapGeoJSON = atom<FeatureCollection<
    Polygon | MultiPolygon
> | null>(null);
export const polyGeoJSON = persistentAtom<FeatureCollection<
    Polygon | MultiPolygon
> | null>("polyGeoJSON", TFL_ZONE_1_POLYGON, {
    encode: JSON.stringify,
    decode: JSON.parse,
});

export const questions = persistentAtom<Questions>("questions", [], {
    encode: JSON.stringify,
    decode: (x) => questionsSchema.parse(JSON.parse(x)),
});
export const addQuestion = (question: DeepPartial<Question>) =>
    questionModified(questions.get().push(questionSchema.parse(question)));
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const questionModified = (..._: any[]) => {
    if (autoSave.get()) {
        questions.set([...questions.get()]);
    } else {
        triggerLocalRefresh.set(Math.random());
    }
};

export const leafletMapContext = atom<Map | null>(null);

export const defaultUnit = persistentAtom<Units>("defaultUnit", "kilometers");
export const hiderMode = persistentAtom<
    | false
    | {
          latitude: number;
          longitude: number;
      }
>("isHiderMode", false, {
    encode: JSON.stringify,
    decode: JSON.parse,
});
export const triggerLocalRefresh = atom<number>(0);
export const displayHidingZones = persistentAtom<boolean>(
    "displayHidingZones",
    false,
    {
        encode: JSON.stringify,
        decode: JSON.parse,
    },
);
export const displayHidingZonesOptions = persistentAtom<string[]>(
    "displayHidingZonesOptions",
    ["[railway=station]"],
    {
        encode: JSON.stringify,
        decode: JSON.parse,
    },
);
export const displayHidingZonesStyle = persistentAtom<
    "zones" | "stations" | "no-overlap" | "no-display"
>("displayHidingZonesStyle", "zones");
export const questionFinishedMapData = atom<any>(null);

export const trainStations = atom<StationCircle[]>([]);
onSet(trainStations, ({ newValue }) => {
    newValue.sort((a, b) => {
        const aName = (extractStationLabel(a.properties) || "") as string;
        const bName = (extractStationLabel(b.properties) || "") as string;
        return aName.localeCompare(bName);
    });
});

export const animateMapMovements = persistentAtom<boolean>(
    "animateMapMovements",
    false,
    {
        encode: JSON.stringify,
        decode: JSON.parse,
    },
);
export const hidingRadius = persistentAtom<number>("hidingRadius", 0.5, {
    encode: JSON.stringify,
    decode: JSON.parse,
});
export const hidingRadiusUnits = persistentAtom<Units>(
    "hidingRadiusUnits",
    "kilometers",
    {
        encode: JSON.stringify,
        decode: JSON.parse,
    },
);
export const showHiderRadius = persistentAtom<boolean>(
    "showHiderRadius",
    true,
    {
        encode: JSON.stringify,
        decode: JSON.parse,
    },
);
export const showMovementAllowance = persistentAtom<boolean>(
    "showMovementAllowance",
    true,
    {
        encode: JSON.stringify,
        decode: JSON.parse,
    },
);

/**
 * How far apart two of the hider's positions can be, expressed in
 * `hidingRadiusUnits`.
 *
 * An answer constrains where the hider was at the moment they answered, not
 * where they are now. Since both that position and their final hiding spot lie
 * within `hidingRadius` of the same station, the two can differ by at most
 * twice the hiding radius — so that's the slack every answer deserves before
 * its area is treated as truly eliminated.
 */
export const movementAllowance = computed(
    [showMovementAllowance, hidingRadius],
    (enabled, radius) =>
        enabled && Number.isFinite(radius) && radius > 0 ? radius * 2 : 0,
);
export const disabledStations = persistentAtom<string[]>(
    "disabledStations",
    [],
    {
        encode: JSON.stringify,
        decode: JSON.parse,
    },
);
export const autoSave = persistentAtom<boolean>("autoSave", true, {
    encode: JSON.stringify,
    decode: JSON.parse,
});
export const save = () => {
    questions.set([...questions.get()]);
    const $hiderMode = hiderMode.get();

    if ($hiderMode !== false) {
        hiderMode.set({ ...$hiderMode });
    }
};

export const hidingZone = computed(
    [
        questions,
        mapGeoJSON,
        polyGeoJSON,
        disabledStations,
        hidingRadius,
        hidingRadiusUnits,
        displayHidingZonesOptions,
        permanentOverlay,
    ],
    (
        q,
        geo,
        poly,
        disabledStations,
        radius,
        hidingRadiusUnits,
        zoneOptions,
        $permanentOverlay,
    ) => {
        return {
            ...(geo ?? poly ?? TFL_ZONE_1_POLYGON),
            questions: q,
            disabledStations: disabledStations,
            hidingRadius: radius,
            hidingRadiusUnits,
            zoneOptions: zoneOptions,
            permanentOverlay: $permanentOverlay,
        };
    },
);

export const planningModeEnabled = persistentAtom<boolean>(
    "planningModeEnabled",
    false,
    {
        encode: JSON.stringify,
        decode: JSON.parse,
    },
);
export const autoZoom = persistentAtom<boolean>("autoZoom", true, {
    encode: JSON.stringify,
    decode: JSON.parse,
});

export const isLoading = atom<boolean>(false);

export const baseTileLayer = persistentAtom<
    "voyager" | "light" | "dark" | "transport" | "neighbourhood" | "osmcarto"
>("baseTileLayer", "voyager");
export const thunderforestApiKey = persistentAtom<string>(
    "thunderforestApiKey",
    "",
    {
        encode: (value: string) => value,
        decode: (value: string) => value,
    },
);
export const followMe = persistentAtom<boolean>("followMe", false, {
    encode: JSON.stringify,
    decode: JSON.parse,
});
// The live position Follow Me is currently tracking, kept separate from
// hiderMode so a hider's fixed station pin never moves just because their
// device's GPS is being watched.
export const followMeLocation = atom<{
    latitude: number;
    longitude: number;
} | null>(null);

/**
 * Debug mode: a manually chosen stand-in for the device's GPS position.
 *
 * When set, the app pretends "you" are here instead of asking the browser
 * where you actually are — so a hider can test answering questions from an
 * arbitrary spot (or on a desktop with no usable GPS) without travelling
 * there. This is deliberately separate from `hiderMode`, which is the
 * hider's fixed hiding station.
 */
export const debugLocationOverride = persistentAtom<
    | false
    | {
          latitude: number;
          longitude: number;
      }
>("debugLocationOverride", false, {
    encode: JSON.stringify,
    decode: JSON.parse,
});

/**
 * Where the app should consider the device to be: the debug override when
 * one is set, otherwise whatever Follow Me's GPS watch last reported (null
 * if it isn't running).
 */
export const deviceLocation = computed(
    [debugLocationOverride, followMeLocation],
    (override, live) => (override === false ? live : override),
);

export const pastebinApiKey = persistentAtom<string>("pastebinApiKey", "");
export const alwaysUsePastebin = persistentAtom<boolean>(
    "alwaysUsePastebin",
    false,
    {
        encode: JSON.stringify,
        decode: JSON.parse,
    },
);

export const showTutorial = persistentAtom<boolean>("showTutorials", false, {
    encode: JSON.stringify,
    decode: JSON.parse,
});
export const tutorialStep = atom<number>(0);

// Lets the mobile bottom app bar's overflow menu open the same Options
// drawer that the desktop button row opens.
export const optionsDrawerOpen = atom<boolean>(false);

// Lets the mobile bottom app bar's overflow menu open the same Map Layers
// settings that the desktop header button opens.
export const mapLayersDrawerOpen = atom<boolean>(false);

export const allowGooglePlusCodes = persistentAtom<boolean>(
    "allowGooglePlusCodes",
    false,
    {
        encode: JSON.stringify,
        decode: JSON.parse,
    },
);

export const showTransitStops = persistentAtom<boolean>(
    "showTransitStops",
    true,
    {
        encode: JSON.stringify,
        decode: JSON.parse,
    },
);

export const mapOverlays = persistentAtom<string[]>("mapOverlays", [], {
    encode: JSON.stringify,
    decode: JSON.parse,
});

export const showElevationOverlay = persistentAtom<boolean>(
    "showElevationOverlay",
    false,
    {
        encode: JSON.stringify,
        decode: JSON.parse,
    },
);
