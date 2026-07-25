import type { Question } from "@/maps/schema";

/**
 * Whether `a` and `b` are different copies of the same question, identified
 * by the stable `key` assigned when a question is first created (see
 * `questionSchema` in `@/maps/schema`). "Share question"/"Copy to Clipboard"
 * serialize the question as-is, key included, so pasting a later copy of it
 * back (e.g. the hider's answer coming back for a question shared
 * unanswered) carries the same key and is recognized as an update rather
 * than a new question.
 */
export const questionsMatch = (a: Question, b: Question): boolean =>
    a.id === b.id && a.key === b.key;

/**
 * Finds the index of the question in `questions` that `candidate` is an
 * updated copy of (see `questionsMatch`), or -1 if it's a new question.
 */
export const findMatchingQuestionIndex = (
    questions: Question[],
    candidate: Question,
): number =>
    questions.findIndex((question) => questionsMatch(question, candidate));
