import { useStore } from "@nanostores/react";
import { toast } from "react-toastify";

import { SidebarMenuButton } from "@/components/ui/sidebar-l";
import {
    followMeLocation,
    hiderMode,
    isLoading,
    questionModified,
    questions,
} from "@/lib/context";
import { findMatchingQuestionIndex } from "@/lib/questionIdentity";
import { parseJsonLenient } from "@/lib/utils";
import { hiderifyQuestion } from "@/maps";
import { questionSchema } from "@/maps/schema";

type Location = { latitude: number; longitude: number };

// The location a pasted question should be answered from as the hider.
// This never touches hiderMode — the hider's station pin stays fixed;
// only this one answer is computed from wherever the hider actually is.
// Prefers an already-live Follow Me position; otherwise does a one-off
// GPS fetch. Falls back to the saved station location on failure/denial.
const getHiderAnswerLocation = async (): Promise<Location | undefined> => {
    const $followMeLocation = followMeLocation.get();
    if ($followMeLocation !== null) return $followMeLocation;

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

        return {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
        };
    } catch {
        return undefined;
    }
};

export const PasteQuestionButton = () => {
    const $isLoading = useStore(isLoading);
    const $hiderMode = useStore(hiderMode);

    const runPasteQuestion = async () => {
        if (!navigator || !navigator.clipboard) {
            toast.error("Clipboard API not supported in your browser");
            return false;
        }

        const isHider = hiderMode.get() !== false;
        const answerLocation = isHider
            ? await getHiderAnswerLocation()
            : undefined;

        try {
            await toast.promise(
                navigator.clipboard.readText().then(async (text) => {
                    const parsed = parseJsonLenient(text);

                    // Preserve the pasted question's `key` (rather than
                    // minting a new one) so it can be matched against a
                    // question we already have below - the schema only
                    // generates a fresh key when the pasted JSON doesn't
                    // include one at all.
                    const validated = questionSchema.parse(parsed);

                    // If hider mode is on, answer the pasted question
                    // immediately and lock it so it doesn't get
                    // accidentally edited or re-answered later.
                    if (isHider) {
                        await hiderifyQuestion(validated, answerLocation);
                        validated.data.drag = false;
                    }

                    // If this is a re-shared copy of a question already on
                    // the map (e.g. the hider's answer coming back for a
                    // question we sent unanswered), update that question in
                    // place instead of adding a duplicate.
                    const $questions = questions.get();
                    const existingIndex = findMatchingQuestionIndex(
                        $questions,
                        validated,
                    );

                    if (existingIndex === -1) {
                        questionModified($questions.push(validated));
                        return "added" as const;
                    }

                    // An unlocked (still-being-answered) paste is a stale or
                    // in-progress copy - never let it clobber whatever we
                    // already have for this question, locked or not. Only a
                    // locked incoming copy (a settled answer) takes
                    // precedence over the existing entry.
                    if (validated.data.drag) {
                        return "skipped" as const;
                    }

                    $questions[existingIndex] = validated;
                    questionModified(existingIndex);
                    return "updated" as const;
                }),
                {
                    pending: "Reading from clipboard",
                    success: {
                        render: ({ data: outcome }) => {
                            switch (outcome) {
                                case "updated":
                                    return "Question updated from clipboard!";
                                case "skipped":
                                    return "Already have this question - clipboard copy is unanswered, ignoring";
                                default:
                                    return "Question added from clipboard!";
                            }
                        },
                    },
                    error: "No valid question found in clipboard",
                },
                { autoClose: 1000 },
            );

            return true;
        } catch {
            return false;
        }
    };

    return (
        <SidebarMenuButton
            size="lg"
            disabled={$isLoading}
            className="bg-primary text-primary-foreground font-semibold justify-center hover:bg-primary/90 hover:text-primary-foreground"
            onClick={runPasteQuestion}
        >
            {$hiderMode !== false ? "Answer Question" : "Input Question Answer"}
        </SidebarMenuButton>
    );
};
