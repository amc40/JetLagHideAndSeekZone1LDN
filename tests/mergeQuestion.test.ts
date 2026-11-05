import { beforeEach, describe, expect, test } from "vitest";

import { questions } from "@/lib/context";
import { mergeIncomingQuestion } from "@/lib/mergeQuestion";
import { questionSchema } from "@/maps/schema";

const make = (key: number, drag: boolean, within = true) =>
    questionSchema.parse({
        id: "radius",
        key,
        data: {
            lat: 51.5,
            lng: -0.1,
            radius: 1,
            unit: "kilometers",
            drag,
            within,
        },
    });

beforeEach(() => {
    questions.set([]);
});

describe("mergeIncomingQuestion", () => {
    test("adds a question we have not seen", () => {
        expect(mergeIncomingQuestion(make(1, true))).toBe("added");
        expect(questions.get()).toHaveLength(1);
    });

    test("a locked answer updates the unanswered copy in place", () => {
        mergeIncomingQuestion(make(1, true, true));
        expect(mergeIncomingQuestion(make(1, false, false))).toBe("updated");

        const [only, ...rest] = questions.get();
        expect(rest).toHaveLength(0);
        expect(only.data.drag).toBe(false);
        expect((only.data as { within: boolean }).within).toBe(false);
    });

    test("an unlocked copy never clobbers what we already have", () => {
        mergeIncomingQuestion(make(1, false, false));
        expect(mergeIncomingQuestion(make(1, true, true))).toBe("skipped");

        const [only] = questions.get();
        expect(only.data.drag).toBe(false);
        expect((only.data as { within: boolean }).within).toBe(false);
    });

    test("is idempotent: re-delivering the same answer leaves one question", () => {
        mergeIncomingQuestion(make(1, true));
        mergeIncomingQuestion(make(1, false, false));
        mergeIncomingQuestion(make(1, false, false));

        expect(questions.get()).toHaveLength(1);
    });

    test("different keys are different questions", () => {
        mergeIncomingQuestion(make(1, true));
        mergeIncomingQuestion(make(2, true));

        expect(questions.get()).toHaveLength(2);
    });
});
