import { useStore } from "@nanostores/react";
import { toast } from "react-toastify";

import { SidebarMenuButton } from "@/components/ui/sidebar-l";
import { hiderMode, hiderStaticByDefault, isLoading } from "@/lib/context";
import {
    answerQuestionAsHider,
    getHiderAnswerLocation,
} from "@/lib/hiderAnswer";
import { mergeIncomingQuestion } from "@/lib/mergeQuestion";
import { parseJsonLenient } from "@/lib/utils";
import { questionSchema } from "@/maps/schema";

export const PasteQuestionButton = () => {
    const $isLoading = useStore(isLoading);
    const $hiderMode = useStore(hiderMode);

    const runPasteQuestion = async () => {
        if (!navigator || !navigator.clipboard) {
            toast.error("Clipboard API not supported in your browser");
            return false;
        }

        // Read the clipboard first, before any other `await` (e.g. fetching
        // the hider's GPS location below). Safari - the engine behind every
        // iOS browser - only allows navigator.clipboard.readText() within a
        // brief "user activation" window tied directly to the click; once
        // something else is awaited in between (like a real geolocation
        // fetch), that window closes and the read is silently rejected with
        // no permission prompt at all. Chrome/Android has no such window and
        // remembers clipboard permission once granted, which is why the same
        // paste can work there but not on iOS.
        let text: string;
        try {
            text = await navigator.clipboard.readText();
        } catch {
            toast.error(
                "Couldn't read the clipboard - try tapping the button again right after copying",
            );
            return false;
        }

        const isHider = hiderMode.get() !== false;
        const answerLocation = isHider
            ? await getHiderAnswerLocation()
            : undefined;

        try {
            await toast.promise(
                (async () => {
                    const parsed = parseJsonLenient(text);

                    // Preserve the pasted question's `key` (rather than
                    // minting a new one) so it can be matched against a
                    // question we already have below - the schema only
                    // generates a fresh key when the pasted JSON doesn't
                    // include one at all.
                    const validated = questionSchema.parse(parsed);

                    // Pasted questions that don't say whether the hider was
                    // static follow the global default.
                    validated.data.hiderStatic ??= hiderStaticByDefault.get();

                    // If hider mode is on, answer the pasted question
                    // immediately and lock it so it doesn't get
                    // accidentally edited or re-answered later.
                    if (isHider) {
                        await answerQuestionAsHider(validated, answerLocation);
                    }

                    // If this is a re-shared copy of a question already on
                    // the map (e.g. the hider's answer coming back for a
                    // question we sent unanswered), it updates that question
                    // in place instead of adding a duplicate.
                    return mergeIncomingQuestion(validated);
                })(),
                {
                    pending: "Adding question from clipboard",
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
