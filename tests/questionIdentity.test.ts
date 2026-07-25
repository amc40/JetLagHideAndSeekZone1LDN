import { expect, test } from "vitest";

import {
    findMatchingQuestionIndex,
    questionsMatch,
} from "@/lib/questionIdentity";
import type { Question } from "@/maps/schema";

const radiusQuestion = (
    key: number,
    overrides: Partial<Extract<Question, { id: "radius" }>["data"]> = {},
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

test("matches the same question (by key) before and after it's been answered", () => {
    const unanswered = radiusQuestion(0.8844037764051809);
    const answered = radiusQuestion(0.8844037764051809, {
        drag: false,
        within: false,
    });

    expect(questionsMatch(unanswered, answered)).toBe(true);
});

test("does not match a different question that happens to share the same data", () => {
    const a = radiusQuestion(0.1);
    const b = radiusQuestion(0.2);

    expect(questionsMatch(a, b)).toBe(false);
});

test("does not match the same key across different question types", () => {
    const radius = radiusQuestion(0.5);
    const thermometer: Question = {
        id: "thermometer",
        key: 0.5,
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
    const existing = radiusQuestion(0.8844037764051809);
    const rePasted = radiusQuestion(0.8844037764051809, {
        drag: false,
        within: false,
    });

    expect(findMatchingQuestionIndex([existing], rePasted)).toBe(0);
    expect(findMatchingQuestionIndex([existing], radiusQuestion(0.999))).toBe(
        -1,
    );
});
