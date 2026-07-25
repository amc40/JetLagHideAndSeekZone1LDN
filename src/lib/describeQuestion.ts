import type { APILocations, Question } from "@/maps/schema";

const CATEGORY_LABELS: Record<APILocations | "aquarium", string> = {
    museum: "museum",
    hospital: "hospital",
    cinema: "cinema",
    library: "library",
    consulate: "foreign consulate",
    park: "park",
    aquarium: "aquarium",
};

const categoryLabelFor = (type: string): string => {
    const category = type.split("-full")[0] as keyof typeof CATEGORY_LABELS;
    return CATEGORY_LABELS[category] ?? category;
};

const yesNo = (value: boolean) => (value ? "Yes" : "No");

const formatDistance = (radius: number, unit: string) => {
    const singularUnit = radius === 1 ? unit.replace(/s$/, "") : unit;
    return `${radius} ${singularUnit}`;
};

/**
 * Renders a question in the plain-English form it's asked in the game
 * (as opposed to the raw JSON), from the perspective of the seeker asking
 * the hider. Used to give humans context when sharing a hiding zone.
 */
export const describeQuestion = (
    question: Question,
): { prompt: string; answer: string } => {
    switch (question.id) {
        case "radius": {
            const { radius, unit, within } = question.data;
            return {
                prompt: `Are you within ${formatDistance(radius, unit)} of me?`,
                answer: yesNo(within),
            };
        }
        case "thermometer": {
            const { warmer } = question.data;
            return {
                prompt: "Are you closer to Point B (the end point) than Point A (the start point)?",
                answer: yesNo(warmer),
            };
        }
        case "matching": {
            const { type, same } = question.data;
            switch (type) {
                case "london-borough":
                    return {
                        prompt: "Are you in the same London borough as me?",
                        answer: yesNo(same),
                    };
                case "thames":
                    return {
                        prompt: "Are you on the same side of the Thames as me?",
                        answer: yesNo(same),
                    };
                case "same-first-letter-station":
                    return {
                        prompt: "Does your nearest train station start with the same letter as mine?",
                        answer: yesNo(same),
                    };
                case "same-length-station":
                    return {
                        prompt: "Does your nearest train station's name have the same number of letters as mine?",
                        answer:
                            question.data.lengthComparison === undefined
                                ? "Unknown"
                                : question.data.lengthComparison === "same"
                                  ? "Yes, same length"
                                  : `No, ${question.data.lengthComparison}`,
                    };
                case "same-train-line":
                    return {
                        prompt: "Is your nearest train station on the same line as mine?",
                        answer: yesNo(same),
                    };
                default:
                    return {
                        prompt: `Is your nearest ${categoryLabelFor(type)} the same as mine?`,
                        answer: yesNo(same),
                    };
            }
        }
        case "measuring": {
            const { type, hiderCloser } = question.data;
            switch (type) {
                case "sea-level":
                    return {
                        prompt: "Are you closer to sea level than me?",
                        answer: yesNo(hiderCloser),
                    };
                case "rail-measure":
                    return {
                        prompt: "Is your nearest train station closer to you than mine is to me?",
                        answer: yesNo(hiderCloser),
                    };
                case "highspeed-measure-shinkansen":
                    return {
                        prompt: "Is your nearest bullet train station closer to you than mine is to me?",
                        answer: yesNo(hiderCloser),
                    };
                default:
                    return {
                        prompt: `Is your nearest ${categoryLabelFor(type)} closer to you than mine is to me?`,
                        answer: yesNo(hiderCloser),
                    };
            }
        }
    }
};

/**
 * Builds a human-readable summary of all questions in a hiding zone, meant
 * to be prepended to the raw JSON when it's copied to the clipboard so a
 * human reading the shared text (e.g. in chat) can understand it at a
 * glance. `parseJsonLenient` (see `@/lib/utils`) can still recover the JSON
 * object from the middle of this text when it's pasted back in.
 */
export const describeQuestionsSummary = (questions: Question[]): string => {
    if (questions.length === 0) return "";

    return (
        questions
            .map((question) => {
                const { prompt, answer } = describeQuestion(question);
                return `> ${prompt}\n${answer}`;
            })
            .join("\n\n") + "\n\n"
    );
};
