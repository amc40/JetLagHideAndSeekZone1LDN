import * as turf from "@turf/turf";
import { toast } from "react-toastify";

import {
    debugLocationOverride,
    deviceLocation,
    hiderMode,
    hiderStaticByDefault,
    hidingRadius,
    hidingRadiusUnits,
    mapGeoJSON,
} from "@/lib/context";
import { TFL_ZONE_1_POLYGON } from "@/lib/map-presets";
import { hiderifyQuestion } from "@/maps";
import { safeUnion } from "@/maps/geo-utils";
import type { Question } from "@/maps/schema";

export type Location = { latitude: number; longitude: number };

const warnIfOutsideSelectedZone = (location: Location) => {
    const $hiderMode = hiderMode.get();

    // Outside the hider's declared hiding radius around their station,
    // even if still within the wider play area.
    if ($hiderMode !== false) {
        const distance = turf.distance(
            turf.point([location.longitude, location.latitude]),
            turf.point([$hiderMode.longitude, $hiderMode.latitude]),
            { units: hidingRadiusUnits.get() },
        );
        if (distance > hidingRadius.get()) {
            toast.warning(
                "Your location is outside your hiding radius from your station",
            );
            return;
        }
    }

    // Outside the wider selected play area entirely.
    const zone = mapGeoJSON.get() ?? TFL_ZONE_1_POLYGON;

    try {
        const inZone = turf.booleanPointInPolygon(
            turf.point([location.longitude, location.latitude]),
            safeUnion(zone),
        );
        if (!inZone) {
            toast.warning("Your location is outside the selected hiding zone");
        }
    } catch {
        // If the zone geometry can't be checked, don't block answering.
    }
};

/**
 * The location a question should be answered from as the hider.
 *
 * This never touches hiderMode — the hider's station pin stays fixed; only
 * this one answer is computed from wherever the hider actually is. Prefers a
 * debug location override, then an already-live Follow Me position;
 * otherwise does a one-off GPS fetch. Falls back to the saved station
 * location (by returning undefined) on failure/denial.
 */
export const getHiderAnswerLocation = async (): Promise<
    Location | undefined
> => {
    const $deviceLocation = deviceLocation.get();
    if ($deviceLocation !== null) {
        if (debugLocationOverride.get() !== false) {
            toast.info("Answering from your debug location", {
                autoClose: 1500,
            });
        }
        warnIfOutsideSelectedZone($deviceLocation);
        return $deviceLocation;
    }

    if (!navigator || !navigator.geolocation) {
        toast.error("Geolocation not supported — using saved hider location");
        return undefined;
    }

    try {
        const position = await toast.promise(
            new Promise<GeolocationPosition>((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    enableHighAccuracy: true,
                    maximumAge: 0,
                });
            }),
            {
                pending: "Fetching your location",
                success: "Location shared",
                error: "Could not fetch location — using saved hider location",
            },
            { autoClose: 500 },
        );

        const location = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
        };
        warnIfOutsideSelectedZone(location);
        return location;
    } catch {
        return undefined;
    }
};

/**
 * Answers `question` as the hider from `location` (or the saved station when
 * undefined), then locks it so it can't be accidentally edited or re-answered.
 * Mutates and returns the question.
 */
export const answerQuestionAsHider = async (
    question: Question,
    location: Location | undefined,
): Promise<Question> => {
    await hiderifyQuestion(question, location);
    question.data.drag = false;
    question.data.hiderStatic = hiderStaticByDefault.get();
    return question;
};
