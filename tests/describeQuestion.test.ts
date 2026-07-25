import { expect, test } from "vitest";

import {
    describeQuestion,
    describeQuestionsSummary,
} from "@/lib/describeQuestion";
import type { Question } from "@/maps/schema";

const radiusQuestion: Question = {
    id: "radius",
    key: 1,
    data: {
        lat: 51.5,
        lng: -0.1,
        drag: false,
        color: "blue",
        collapsed: false,
        hidden: false,
        radius: 2,
        unit: "kilometers",
        within: true,
    },
};

const matchingHospitalQuestion: Question = {
    id: "matching",
    key: 2,
    data: {
        lat: 51.5,
        lng: -0.1,
        drag: false,
        color: "blue",
        collapsed: false,
        hidden: false,
        same: false,
        type: "hospital-full",
    },
};

const measuringSeaLevelQuestion: Question = {
    id: "measuring",
    key: 3,
    data: {
        lat: 51.5,
        lng: -0.1,
        drag: false,
        color: "blue",
        collapsed: false,
        hidden: false,
        hiderCloser: true,
        type: "sea-level",
    },
};

test("describes a radius question in plain English", () => {
    expect(describeQuestion(radiusQuestion)).toEqual({
        prompt: "(Radius) Are you within 2 kilometers of me?",
        answer: "Yes",
    });
});

test("describes a matching question in plain English", () => {
    expect(describeQuestion(matchingHospitalQuestion)).toEqual({
        prompt: "(Matching) Is your nearest hospital the same as mine?",
        answer: "No",
    });
});

test("describes a measuring question in plain English", () => {
    expect(describeQuestion(measuringSeaLevelQuestion)).toEqual({
        prompt: "(Measuring) Are you closer to sea level than me?",
        answer: "Yes",
    });
});

test("builds a summary block for multiple questions", () => {
    const summary = describeQuestionsSummary([
        radiusQuestion,
        matchingHospitalQuestion,
    ]);

    expect(summary).toBe(
        "> (Radius) Are you within 2 kilometers of me?\nYes\n\n" +
            "> (Matching) Is your nearest hospital the same as mine?\nNo\n\n",
    );
});

test("returns an empty string for no questions", () => {
    expect(describeQuestionsSummary([])).toBe("");
});

test("omits the answer for an unlocked (still-being-positioned) question", () => {
    const unlockedRadius: Question = {
        ...radiusQuestion,
        data: { ...radiusQuestion.data, drag: true },
    };

    expect(describeQuestionsSummary([unlockedRadius])).toBe(
        "> (Radius) Are you within 2 kilometers of me?\n\n",
    );
});

test("includes the answer once the question is locked", () => {
    const lockedRadius: Question = {
        ...radiusQuestion,
        data: { ...radiusQuestion.data, drag: false },
    };

    expect(describeQuestionsSummary([lockedRadius])).toBe(
        "> (Radius) Are you within 2 kilometers of me?\nYes\n\n",
    );
});
