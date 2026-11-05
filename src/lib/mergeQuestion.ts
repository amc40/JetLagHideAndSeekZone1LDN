import { questionModified, questions } from "@/lib/context";
import { findMatchingQuestionIndex } from "@/lib/questionIdentity";
import type { Question } from "@/maps/schema";

export type MergeOutcome = "added" | "updated" | "skipped";

/**
 * Folds a question received from another device (pasted JSON or, later, a
 * server message) into the local `questions` list.
 *
 * Questions are matched by their stable `key`, so a later copy of a question
 * we already have (e.g. the hider's answer coming back for a question we sent
 * unanswered) updates it in place instead of adding a duplicate. An unlocked
 * (`drag`) incoming copy is a stale or in-progress copy of something we
 * already have, so it never clobbers the existing entry, locked or not; only
 * a locked incoming copy (a settled answer) takes precedence.
 *
 * This is idempotent and order-tolerant, which is what lets both paste and an
 * at-least-once server delivery share it.
 */
export const mergeIncomingQuestion = (incoming: Question): MergeOutcome => {
    const $questions = questions.get();
    const existingIndex = findMatchingQuestionIndex($questions, incoming);

    if (existingIndex === -1) {
        questionModified($questions.push(incoming));
        return "added";
    }

    if (incoming.data.drag) {
        return "skipped";
    }

    $questions[existingIndex] = incoming;
    questionModified(existingIndex);
    return "updated";
};
