import { useIsMobile } from "@/hooks/use-mobile";

import { SidebarTrigger as SidebarTriggerL } from "./ui/sidebar-l";
import { SidebarTrigger as SidebarTriggerR } from "./ui/sidebar-r";

// On mobile the Questions/Zones triggers live in the bottom app bar
// (MobileActionBar) instead, within thumb reach.
export const DesktopSidebarTriggers = () => {
    const isMobile = useIsMobile();

    if (isMobile) return null;

    return (
        <>
            <div
                className="absolute top-2 left-2 z-[1030] group-[.fullscreen]:hidden"
                data-tutorial-id="left-sidebar-trigger"
            >
                <SidebarTriggerL />
            </div>
            <div className="absolute top-2 right-2 z-[1030] group-[.fullscreen]:hidden">
                <SidebarTriggerR />
            </div>
        </>
    );
};
