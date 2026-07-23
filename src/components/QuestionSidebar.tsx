import { useStore } from "@nanostores/react";
import { SidebarCloseIcon, Trash2Icon } from "lucide-react";

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
import { Button } from "@/components/ui/button";
import {
    Sidebar,
    SidebarContent,
    SidebarContext,
    SidebarGroup,
    SidebarGroupContent,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from "@/components/ui/sidebar-l";
import {
    autoSave,
    isLoading,
    questions,
    save,
    triggerLocalRefresh,
} from "@/lib/context";

import { AddQuestionDialog } from "./AddQuestionDialog";
import {
    MatchingQuestionComponent,
    MeasuringQuestionComponent,
    RadiusQuestionComponent,
    ThermometerQuestionComponent,
} from "./QuestionCards";

export const QuestionSidebar = () => {
    useStore(triggerLocalRefresh);
    const $questions = useStore(questions);
    const $autoSave = useStore(autoSave);
    const $isLoading = useStore(isLoading);

    return (
        <Sidebar
            title="Questions"
            description="Add and edit hide-and-seek questions to narrow down the hiding zone."
        >
            <div className="flex items-center justify-between">
                <h2 className="ml-4 mt-4 font-poppins text-2xl">Questions</h2>
                <div className="flex items-center gap-1 mr-1">
                    {$questions.length > 0 && (
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    disabled={$isLoading}
                                    title="Delete all questions"
                                    aria-label="Delete all questions"
                                >
                                    <Trash2Icon />
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>
                                        Delete all questions?
                                    </AlertDialogTitle>
                                    <AlertDialogDescription>
                                        This action cannot be undone. This will
                                        permanently delete all{" "}
                                        {$questions.length} question
                                        {$questions.length === 1 ? "" : "s"}.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>
                                        Cancel
                                    </AlertDialogCancel>
                                    <AlertDialogAction
                                        onClick={() => {
                                            questions.set([]);
                                        }}
                                        className="mb-2 sm:mb-0"
                                    >
                                        Delete All Questions
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    )}
                    <button
                        type="button"
                        aria-label="Close Questions panel"
                        className="p-2 visible md:hidden cursor-pointer"
                        onClick={() => {
                            SidebarContext.get().setOpenMobile(false);
                        }}
                    >
                        <SidebarCloseIcon />
                    </button>
                </div>
            </div>
            <SidebarGroup>
                <SidebarGroupContent>
                    <SidebarMenu data-tutorial-id="add-questions-buttons">
                        <SidebarMenuItem>
                            <AddQuestionDialog>
                                <SidebarMenuButton
                                    size="lg"
                                    disabled={$isLoading}
                                    className="bg-primary text-primary-foreground font-semibold justify-center hover:bg-primary/90 hover:text-primary-foreground"
                                >
                                    Add Question
                                </SidebarMenuButton>
                            </AddQuestionDialog>
                        </SidebarMenuItem>
                        {!$autoSave && (
                            <SidebarMenuItem>
                                <SidebarMenuButton
                                    className="bg-blue-600 p-2 rounded-md font-semibold font-poppins transition-shadow duration-500"
                                    onClick={save}
                                    disabled={$isLoading}
                                >
                                    Save
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                        )}
                    </SidebarMenu>
                </SidebarGroupContent>
            </SidebarGroup>
            <SidebarContent>
                {$questions.length === 0 ? (
                    <p className="mx-4 mt-4 text-sm text-muted-foreground">
                        No questions yet — tap <strong>Add Question</strong>{" "}
                        above or long-press anywhere on the map.
                    </p>
                ) : (
                    $questions.map((question) => {
                        switch (question.id) {
                            case "radius":
                                return (
                                    <RadiusQuestionComponent
                                        data={question.data}
                                        key={question.key}
                                        questionKey={question.key}
                                    />
                                );
                            case "thermometer":
                                return (
                                    <ThermometerQuestionComponent
                                        data={question.data}
                                        key={question.key}
                                        questionKey={question.key}
                                    />
                                );
                            case "matching":
                                return (
                                    <MatchingQuestionComponent
                                        data={question.data}
                                        key={question.key}
                                        questionKey={question.key}
                                    />
                                );
                            case "measuring":
                                return (
                                    <MeasuringQuestionComponent
                                        data={question.data}
                                        key={question.key}
                                        questionKey={question.key}
                                    />
                                );
                            default:
                                return null;
                        }
                    })
                )}
            </SidebarContent>
        </Sidebar>
    );
};
