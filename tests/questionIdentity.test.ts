import { expect, test } from "vitest";

import {
    findMatchingQuestionIndex,
    questionsMatch,
} from "@/lib/questionIdentity";
import type { Question } from "@/maps/schema";

const radiusQuestion = (
    overrides: Partial<Extract<Question, { id: "radius" }>["data"]> = {},
    key = Math.random(),
): Question => ({
    id: "radius",
    key,
    data: {
        lat: 51.50799526262801,
        lng: -0.1278018951416016,
        drag: true,
        color: "grey",
        collapsed: false,
        hidden: false,
        radius: 2,
        unit: "kilometers",
        within: true,
        ...overrides,
    },
});

test("matches the same question before and after it's been answered", () => {
    const unanswered = radiusQuestion();
    const answered = radiusQuestion(
        { drag: false, within: false },
        unanswered.key + 1,
    );

    expect(questionsMatch(unanswered, answered)).toBe(true);
});

test("does not match questions with different locations or parameters", () => {
    const a = radiusQuestion();
    const differentLocation = radiusQuestion({ lat: 51.5 });
    const differentRadius = radiusQuestion({ radius: 3 });

    expect(questionsMatch(a, differentLocation)).toBe(false);
    expect(questionsMatch(a, differentRadius)).toBe(false);
});

test("does not match questions of a different type", () => {
    const radius = radiusQuestion();
    const thermometer: Question = {
        id: "thermometer",
        key: Math.random(),
        data: {
            latA: 51.5,
            lngA: -0.1,
            latB: 51.6,
            lngB: -0.2,
            warmer: true,
            colorA: "blue",
            colorB: "red",
            drag: true,
            collapsed: false,
            hidden: false,
        },
    };

    expect(questionsMatch(radius, thermometer)).toBe(false);
});

test("findMatchingQuestionIndex locates the re-shared copy in a list", () => {
    const existing = radiusQuestion();
    const rePasted = radiusQuestion(
        { drag: false, within: false },
        existing.key + 1,
    );

    expect(findMatchingQuestionIndex([existing], rePasted)).toBe(0);
    expect(
        findMatchingQuestionIndex([existing], radiusQuestion({ lat: 0 })),
    ).toBe(-1);
});
