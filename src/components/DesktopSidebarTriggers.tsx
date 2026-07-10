import { LeafletFullScreenButton } from "@/components/LeafletFullScreenButton";
import { useIsMobile } from "@/hooks/use-mobile";

import { SidebarTrigger as SidebarTriggerL } from "./ui/sidebar-l";
import { SidebarTrigger as SidebarTriggerR } from "./ui/sidebar-r";

// On mobile the Questions/Zones triggers live in the bottom app bar
// (MobileActionBar) instead, within thumb reach. The fullscreen button has
// nowhere else to go, so it renders on both, stacked under the Zones
// trigger on desktop via the shared flex column below (rather than two
// separately-positioned elements whose spacing has to be hand-tuned to
// not overlap).
export const DesktopSidebarTriggers = () => {
    const isMobile = useIsMobile();

    return (
        <>
            {!isMobile && (
                <div
                    className="absolute top-2 left-2 z-[1030] group-[.fullscreen]:hidden"
                    data-tutorial-id="left-sidebar-trigger"
                >
                    <SidebarTriggerL />
                </div>
            )}
            <div className="absolute top-2 right-2 z-[1030] flex flex-col gap-2">
                {!isMobile && (
                    <div className="group-[.fullscreen]:hidden">
                        <SidebarTriggerR />
                    </div>
                )}
                <LeafletFullScreenButton />
            </div>
        </>
    );
};
