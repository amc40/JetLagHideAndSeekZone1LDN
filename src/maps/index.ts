import type { Feature, FeatureCollection } from "geojson";

import { arcBuffer, modifyMapData } from "./geo-utils";
import {
    adjustPerMatching,
    hiderifyMatching,
    matchingPlanningPolygon,
} from "./questions/matching";
import {
    adjustPerMeasuring,
    hiderifyMeasuring,
    measuringPlanningPolygon,
} from "./questions/measuring";
import {
    adjustPerRadius,
    hiderifyRadius,
    radiusPlanningPolygon,
} from "./questions/radius";
import {
    adjustPerThermometer,
    hiderifyThermometer,
    thermometerPlanningPolygon,
} from "./questions/thermometer";
import type { Question, Questions, Units } from "./schema";

export * from "./geo-utils";

export const hiderifyQuestion = async (
    question: Question,
    location?: { latitude: number; longitude: number },
) => {
    if (question.data.drag) {
        switch (question.id) {
            case "radius":
                question.data = hiderifyRadius(question.data, location);
                break;
            case "thermometer":
                question.data = await hiderifyThermometer(
                    question.data,
                    location,
                );
                break;
            case "matching":
                question.data = await hiderifyMatching(question.data, location);
                break;
            case "measuring":
                question.data = await hiderifyMeasuring(
                    question.data,
                    location,
                );
                break;
        }
    }

    return question;
};

export const determinePlanningPolygon = async (
    question: Question,
    planningModeEnabled: boolean,
) => {
    if (planningModeEnabled && question.data.drag && !question.data.hidden) {
        switch (question.id) {
            case "radius":
                return radiusPlanningPolygon(question.data);
            case "thermometer":
                return thermometerPlanningPolygon(question.data);
            case "matching":
                return matchingPlanningPolygon(question.data);
            case "measuring":
                return measuringPlanningPolygon(question.data);
        }
    }
};

export async function adjustMapGeoDataForQuestion(
    question: any,
    mapGeoData: any,
) {
    if (question.data.hidden) {
        return mapGeoData;
    }

    try {
        switch (question?.id) {
            case "radius":
                return await adjustPerRadius(question.data, mapGeoData);
            case "thermometer":
                return await adjustPerThermometer(question.data, mapGeoData);
            case "matching":
                return await adjustPerMatching(question.data, mapGeoData);
            case "measuring":
                return await adjustPerMeasuring(question.data, mapGeoData);
            default:
                return mapGeoData;
        }
    } catch {
        return mapGeoData;
    }
}

const asFeatureCollection = (data: any) =>
    data.type === "FeatureCollection"
        ? data
        : { type: "FeatureCollection", features: [data] };

/**
 * The area that survives the questions once the hider is allowed to have moved
 * up to `allowance` between answering any one of them and now.
 *
 * Each question's allowed region is computed against the untouched play area
 * and dilated *before* being intersected with the others. Dilating every region
 * separately (rather than dilating the final strict intersection) is what makes
 * the result a true superset of the strict area for every question type: for an
 * "outside this radius" answer, growing the allowed region correctly shrinks
 * the excluded circle, which dilating the end result would never do.
 *
 * Returns `null` if nothing survives even with the allowance applied.
 */
export async function applyQuestionsToMapGeoDataWithAllowance(
    questions: Questions,
    mapGeoData: any,
    allowance: number,
    allowanceUnit: Units,
    planningModeEnabled: boolean,
): Promise<any> {
    const playArea = asFeatureCollection(mapGeoData);
    let relaxed = playArea;

    for (const question of questions) {
        if (planningModeEnabled && question.data.drag) continue;
        if (question.data.hidden) continue;

        // Errors inside adjustMapGeoDataForQuestion surface as the untouched
        // play area, which dilates and intersects to a no-op — the same way the
        // strict pipeline silently skips a question it can't evaluate.
        const allowed = await adjustMapGeoDataForQuestion(question, playArea);
        if (!allowed) continue;

        const dilated = await arcBuffer(
            asFeatureCollection(allowed),
            allowance,
            allowanceUnit,
        );

        const intersection = modifyMapData(relaxed, dilated, true);
        if (!intersection) return null;

        relaxed = asFeatureCollection(intersection);
    }

    return relaxed;
}

export async function applyQuestionsToMapGeoData(
    questions: Questions,
    mapGeoData: any,
    planningModeEnabled: boolean,
    planningModeCallback?: (
        polygon: FeatureCollection | Feature,
        question: any,
    ) => void,
): Promise<any> {
    for (const question of questions) {
        if (planningModeCallback) {
            const planningPolygon = await determinePlanningPolygon(
                question,
                planningModeEnabled,
            );
            if (planningPolygon) {
                planningModeCallback(planningPolygon, question);
            }
        }
        if (planningModeEnabled && question.data.drag) {
            continue;
        }

        mapGeoData = await adjustMapGeoDataForQuestion(question, mapGeoData);

        if (mapGeoData.type !== "FeatureCollection") {
            mapGeoData = {
                type: "FeatureCollection",
                features: [mapGeoData],
            };
        }
    }
    return mapGeoData;
}
