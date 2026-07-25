import { useStore } from "@nanostores/react";
import { toast } from "react-toastify";

import { SidebarMenuButton } from "@/components/ui/sidebar-l";
import {
    hiderMode,
    isLoading,
    questionModified,
    questions,
} from "@/lib/context";
import { hiderifyQuestion } from "@/maps";
import { questionSchema } from "@/maps/schema";

export const PasteQuestionButton = () => {
    const $isLoading = useStore(isLoading);
    const $hiderMode = useStore(hiderMode);

    const runPasteQuestion = async () => {
        if (!navigator || !navigator.clipboard) {
            toast.error("Clipboard API not supported in your browser");
            return false;
        }

        try {
            await toast.promise(
                navigator.clipboard.readText().then(async (text) => {
                    const parsed = JSON.parse(text);
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
