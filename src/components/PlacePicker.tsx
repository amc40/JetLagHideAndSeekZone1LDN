import { useStore } from "@nanostores/react";
import { ChevronsUpDown } from "lucide-react";
import { useState } from "react";

import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { useTutorialStep } from "@/hooks/use-tutorial-step";
import { isLoading, mapGeoJSON, questions } from "@/lib/context";
import { cn } from "@/lib/utils";
import { CacheType, clearCache } from "@/maps/api";

import { Button } from "./ui/button";

export const PlacePicker = ({ className = "" }: { className?: string }) => {
    const $isLoading = useStore(isLoading);
    const [open, setOpen] = useState(false);

    return (
        <Popover open={useTutorialStep(open, [2])} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className={cn(
                        "w-[300px] justify-between light text-slate-700",
                        className,
                    )}
                    data-tutorial-id="place-picker"
                >
                    TfL Zone 1
                    <ChevronsUpDown className="opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className="w-[300px] p-2 light"
                data-tutorial-id="place-picker-content"
            >
                <Button
                    variant="outline"
                    className="font-normal bg-slate-50 hover:bg-slate-200 w-full"
                    disabled={$isLoading}
                    onClick={() => {
                        mapGeoJSON.set(null);
                        questions.set([]);
                        clearCache(CacheType.ZONE_CACHE);
                    }}
                >
                    Clear Questions & Cache
                </Button>
            </PopoverContent>
        </Popover>
    );
};
