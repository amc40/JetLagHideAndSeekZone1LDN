import { useStore } from "@nanostores/react";
import { useState } from "react";
import { LiaThumbtackSolid } from "react-icons/lia";
import { TbMessage2Question } from "react-icons/tb";
import { VscEllipsis, VscShare } from "react-icons/vsc";

import {
    Drawer,
    DrawerContent,
    DrawerHeader,
    DrawerTitle,
    DrawerTrigger,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import {
    alwaysUsePastebin,
    hidingZone,
    mapLayersDrawerOpen,
    optionsDrawerOpen,
    pastebinApiKey,
    showTutorial,
} from "@/lib/context";
import { shareHidingZone } from "@/lib/shareHidingZone";
import { cn } from "@/lib/utils";

import { clearQuestionsAndCache } from "./PlacePicker";
import { SidebarContext as SidebarContextL } from "./ui/sidebar-l";
import { SidebarContext as SidebarContextR } from "./ui/sidebar-r";

const barButtonClassName =
    "flex flex-1 flex-col items-center justify-center gap-0.5 min-h-[3rem] py-1.5 text-black active:bg-black/5 rounded-md";

// Owns the bottom edge of the screen on phones: the two actions a player
// uses constantly (Questions, Zones) plus Share get thumb-reachable, labeled,
// ≥48px targets; everything else (Tutorial, Options) sits behind "More" so it
// stops competing with them for the same prime real estate.
export const MobileActionBar = () => {
    const isMobile = useIsMobile();
    const { toggleSidebar: toggleQuestions, openMobile: questionsOpen } =
        useStore(SidebarContextL);
    const { toggleSidebar: toggleZones, openMobile: zonesOpen } =
        useStore(SidebarContextR);
    const $hidingZone = useStore(hidingZone);
    const $alwaysUsePastebin = useStore(alwaysUsePastebin);
    const $pastebinApiKey = useStore(pastebinApiKey);
    const [isMoreOpen, setMoreOpen] = useState(false);

    // Both sidebars are full-screen sheets on mobile, so keeping the bar
    // fixed on top while one is open would cover its own bottom controls.
    if (!isMobile || questionsOpen || zonesOpen) return null;

    return (
        <div
            className={cn(
                "fixed bottom-0 left-0 right-0 z-[1040] flex items-stretch justify-around gap-1 px-1",
                "bg-white/95 backdrop-blur border-t-2 border-black border-opacity-30 shadow-[0_-2px_8px_rgba(0,0,0,0.15)]",
                "pb-[env(safe-area-inset-bottom)]",
                "group-[.fullscreen]:hidden",
            )}
        >
            <button
                type="button"
                className={barButtonClassName}
                onClick={() => toggleQuestions()}
                aria-label="Open Questions panel"
                data-tutorial-id="left-sidebar-trigger"
            >
                <TbMessage2Question className="text-2xl" />
                <span className="text-[11px] font-medium">Questions</span>
            </button>
            <button
                type="button"
                className={barButtonClassName}
                onClick={() => toggleZones()}
                aria-label="Open Hiding Zone panel"
            >
                <LiaThumbtackSolid className="text-2xl" />
                <span className="text-[11px] font-medium">Zones</span>
            </button>
            <button
                type="button"
                className={cn(
                    barButtonClassName,
                    "bg-blue-600 text-white active:bg-blue-700 my-1",
                )}
                onClick={() =>
                    shareHidingZone(
                        $hidingZone,
                        $alwaysUsePastebin,
                        $pastebinApiKey,
                    )
                }
                aria-label="Share hiding zone"
                data-tutorial-id="share-questions-button"
            >
                <VscShare className="text-2xl" />
                <span className="text-[11px] font-medium">Share</span>
            </button>
            <Drawer open={isMoreOpen} onOpenChange={setMoreOpen}>
                <DrawerTrigger asChild>
                    <button
                        type="button"
                        className={barButtonClassName}
                        aria-label="More actions"
                    >
                        <VscEllipsis className="text-2xl" />
                        <span className="text-[11px] font-medium">More</span>
                    </button>
                </DrawerTrigger>
                <DrawerContent>
                    <DrawerHeader>
                        <DrawerTitle className="text-2xl font-semibold font-poppins">
                            More
                        </DrawerTitle>
                    </DrawerHeader>
                    <div className="flex flex-col gap-2 p-4 pb-8">
                        <button
                            type="button"
                            className="h-12 rounded-md border-2 border-black border-opacity-30 text-base font-medium"
                            onClick={() => {
                                setMoreOpen(false);
                                showTutorial.set(true);
                            }}
                        >
                            Tutorial
                        </button>
                        <button
                            type="button"
                            className="h-12 rounded-md border-2 border-black border-opacity-30 text-base font-medium"
                            data-tutorial-id="option-questions-button"
                            onClick={() => {
                                setMoreOpen(false);
                                optionsDrawerOpen.set(true);
                            }}
                        >
                            Options
                        </button>
                        <button
                            type="button"
                            className="h-12 rounded-md border-2 border-black border-opacity-30 text-base font-medium"
                            onClick={() => {
                                setMoreOpen(false);
                                mapLayersDrawerOpen.set(true);
                            }}
                        >
                            Map Layers
                        </button>
                        <button
                            type="button"
                            className="h-12 rounded-md border-2 border-black border-opacity-30 text-base font-medium"
                            onClick={() => {
                                setMoreOpen(false);
                                clearQuestionsAndCache();
                            }}
                        >
                            Clear Questions &amp; Cache
                        </button>
                    </div>
                </DrawerContent>
            </Drawer>
        </div>
    );
};
