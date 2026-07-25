import { useStore } from "@nanostores/react";
import { toast } from "react-toastify";

import { SidebarMenuButton } from "@/components/ui/sidebar-l";
import {
    followMe,
    hiderMode,
    isLoading,
    questionModified,
    questions,
} from "@/lib/context";
import { parseJsonLenient } from "@/lib/utils";
import { hiderifyQuestion } from "@/maps";
import { questionSchema } from "@/maps/schema";

// One-off GPS fetch used to answer a question as the hider. Only called
// when hider mode is on and "Follow Me (GPS)" isn't already on (in which
// case Map.tsx's watchPosition keeps hiderMode up to date continuously).
// Falls back silently to the hider's currently saved location on failure
// or denial.
const shareOneOffHiderLocation = async () => {
    const $hiderMode = hiderMode.get();
    if ($hiderMode === false) return;

    if (!navigator || !navigator.geolocation) {
        toast.error("Geolocation not supported — using saved hider location");
        return;
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

        hiderMode.set({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
        });
    } catch {
        // Keep the previously saved hider location.
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

        if (hiderMode.get() !== false && !followMe.get()) {
            await shareOneOffHiderLocation();
        }

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
                    if (hiderMode.get() !== false) {
                        await hiderifyQuestion(validated);
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
