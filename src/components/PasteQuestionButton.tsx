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
                    const question =
                        parsed &&
                        typeof parsed === "object" &&
                        !Array.isArray(parsed)
                            ? { ...parsed, key: Math.random() }
                            : parsed;

                    const validated = questionSchema.parse(question);

                    // If hider mode is on, answer the pasted question
                    // immediately and lock it so it doesn't get
                    // accidentally edited or re-answered later.
                    if (isHider) {
                        await hiderifyQuestion(validated, answerLocation);
                        validated.data.drag = false;
                    }

                    return questionModified(questions.get().push(validated));
                }),
                {
                    pending: "Reading from clipboard",
                    success: "Question added from clipboard!",
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
