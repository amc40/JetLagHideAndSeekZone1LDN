import { useStore } from "@nanostores/react";
import { useState } from "react";
import { toast } from "react-toastify";

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isLoading, questions } from "@/lib/context";
import {
    connectionStatus,
    gameSession,
    onlineEnabled,
    outbox,
    questionSync,
    syncKey,
} from "@/lib/game/store";
import { answerQuestion, askQuestion } from "@/lib/game/sync";

/**
 * The online game's controls for one question card: a seeker sends a local
 * draft to the hider ("Ask"), the hider answers one that arrived. Renders
 * nothing when there is no active online game, so the card is exactly what it
 * was before for anyone using Share/Paste.
 */
export const OnlineQuestionActions = ({
    questionKey,
}: {
    questionKey: number;
}) => {
    const $session = useStore(gameSession);
    const $enabled = useStore(onlineEnabled);
    const $sync = useStore(questionSync);
    const $outbox = useStore(outbox);
    const $status = useStore(connectionStatus);
    const $questions = useStore(questions);
    const $isLoading = useStore(isLoading);
    const [answering, setAnswering] = useState(false);

    const question = $questions.find((q) => q.key === questionKey);
    if (!$session || !$enabled || !question) return null;

    // A locked question is settled however its answer arrived: over the
    // server, or pasted in by hand once the server was out of the picture.
    const recorded = $sync[syncKey(question)];
    const state = recorded && !question.data.drag ? "answered" : recorded;
    const queued = $outbox.some((entry) => {
        try {
            const queuedQuestion = JSON.parse(entry.payload);
            return (
                queuedQuestion.id === question.id &&
                queuedQuestion.key === question.key
            );
        } catch {
            return false;
        }
    });
    const offline = $status.status !== "online";

    if (state === "answered") {
        return (
            <div className="flex justify-center px-2 pt-2">
                <Badge variant="secondary">Answered</Badge>
            </div>
        );
    }

    if ($session.role === "seeker") {
        if (state === "asked") {
            return (
                <div className="flex justify-center px-2 pt-2">
                    <Badge variant="outline">
                        {queued && offline
                            ? "Queued: will send when connected"
                            : "Asked: waiting for the hider"}
                    </Badge>
                </div>
            );
        }

        // Only an unlocked question is still a draft.
        if (!question.data.drag) return null;

        return (
            <div className="flex justify-center px-2 pt-2">
                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button
                            size="sm"
                            disabled={$isLoading}
                            title="Send this question to the hider"
                        >
                            Ask the hider
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>
                                Ask the hider this question?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                                The hider will be notified straight away, and a
                                question can&apos;t be taken back once asked.
                                {offline &&
                                    " You're not connected right now, so it will be sent as soon as you are."}
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Not yet</AlertDialogCancel>
                            <AlertDialogAction
                                className="mb-2 sm:mb-0"
                                onClick={() => {
                                    const result = askQuestion(
                                        question.id,
                                        question.key,
                                    );
                                    if (result === "queued") {
                                        toast.success(
                                            offline
                                                ? "Queued. It will send when you're connected."
                                                : "Question sent to the hider",
                                            { autoClose: 2000 },
                                        );
                                    }
                                }}
                            >
                                Ask
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        );
    }

    // Hider
    if (state === "asked" && question.data.drag) {
        return (
            <div className="flex flex-col items-center gap-1 px-2 pt-2">
                <Button
                    size="sm"
                    disabled={$isLoading || answering}
                    onClick={async () => {
                        setAnswering(true);
                        try {
                            if (
                                await answerQuestion(question.id, question.key)
                            ) {
                                toast.success(
                                    offline
                                        ? "Answered. It will send when you're connected."
                                        : "Answer sent to the seekers",
                                    { autoClose: 2000 },
                                );
                            }
                        } finally {
                            setAnswering(false);
                        }
                    }}
                >
                    {answering ? "Answering…" : "Answer now"}
                </Button>
                <span className="text-xs text-muted-foreground">
                    Answers from where you are right now.
                </span>
            </div>
        );
    }

    return null;
};
