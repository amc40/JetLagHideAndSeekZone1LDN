import type { Question } from "@/maps/schema";

// Fields that don't identify *which* question is being asked - they're
// either local UI state (unlocked/collapsed/hidden/marker color) or the
// answer itself. Two questions that only differ in these fields represent
// the same question at different points in its lifecycle (e.g. shared
// unanswered, then shared again once the hider has answered it), not two
// distinct questions.
const NON_IDENTITY_KEYS = new Set([
    "drag",
    "collapsed",
    "hidden",
    "color",
    "colorA",
    "colorB",
]);

const ANSWER_KEYS: Record<Question["id"], string[]> = {
    radius: ["within"],
    thermometer: ["warmer"],
    matching: ["same", "lengthComparison"],
    measuring: ["hiderCloser"],
};

/**
 * Whether `a` and `b` represent the same underlying question (same type,
 * same location/parameters), ignoring UI-only state and the answer fields.
 * Used to recognize a re-pasted/re-shared copy of a question (e.g. the
 * hider's answer coming back) so it updates the existing entry instead of
 * being added as a duplicate.
 */
export const questionsMatch = (a: Question, b: Question): boolean => {
    if (a.id !== b.id) return false;

    const ignoredKeys = new Set([...NON_IDENTITY_KEYS, ...ANSWER_KEYS[a.id]]);
    const dataA = a.data as Record<string, unknown>;
    const dataB = b.data as Record<string, unknown>;
    const keys = new Set([...Object.keys(dataA), ...Object.keys(dataB)]);

    for (const key of keys) {
        if (ignoredKeys.has(key)) continue;
        if (dataA[key] !== dataB[key]) return false;
    }

    return true;
};

/**
 * Finds the index of the question in `questions` that `candidate` is an
 * updated copy of (see `questionsMatch`), or -1 if it's a new question.
 */
export const findMatchingQuestionIndex = (
    questions: Question[],
    candidate: Question,
): number =>
    questions.findIndex((question) => questionsMatch(question, candidate));
