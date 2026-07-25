import { useStore } from "@nanostores/react";
import * as turf from "@turf/turf";
import React from "react";

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { SidebarContext, SidebarMenuButton } from "@/components/ui/sidebar-l";
import { useIsMobile } from "@/hooks/use-mobile";
import { addQuestion, isLoading, leafletMapContext } from "@/lib/context";

export const AddQuestionDialog = ({
    children,
}: {
    children: React.ReactNode;
}) => {
    const $isLoading = useStore(isLoading);
    const [open, setOpen] = React.useState(false);
    const isMobile = useIsMobile();

    const closeAll = () => {
        setOpen(false);
        if (isMobile) SidebarContext.get().setOpenMobile(false);
    };

    const runAddRadius = () => {
        const map = leafletMapContext.get();
        if (!map) return false;
        const center = map.getCenter();
        addQuestion({
            id: "radius",
            data: { lat: center.lat, lng: center.lng },
        });
        return true;
    };

    const runAddThermometer = () => {
        const map = leafletMapContext.get();
        if (!map) return false;
        const center = map.getCenter();
        const destination = turf.destination([center.lng, center.lat], 2, 90, {
            units: "kilometers",
        });

        addQuestion({
            id: "thermometer",
            data: {
                latA: center.lat,
                lngB: center.lng,
                latB: destination.geometry.coordinates[1],
                lngA: destination.geometry.coordinates[0],
            },
        });

        return true;
    };

    const runAddMatching = () => {
        const map = leafletMapContext.get();
        if (!map) return false;
        const center = map.getCenter();
        addQuestion({
            id: "matching",
            data: { lat: center.lat, lng: center.lng },
        });
        return true;
    };

    const runAddMeasuring = () => {
        const map = leafletMapContext.get();
        if (!map) return false;
        const center = map.getCenter();
        addQuestion({
            id: "measuring",
            data: { lat: center.lat, lng: center.lng },
        });
        return true;
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>{children}</DialogTrigger>
            <DialogContent>
                <DialogTitle>Add Question</DialogTitle>
                <DialogDescription>
                    Select which question type you would like to add.
                </DialogDescription>

                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <SidebarMenuButton
                        onClick={() => {
                            if (runAddRadius()) closeAll();
                        }}
                        disabled={$isLoading}
                    >
                        Add Radius
                    </SidebarMenuButton>
                    <SidebarMenuButton
                        onClick={() => {
                            if (runAddThermometer()) closeAll();
                        }}
                        disabled={$isLoading}
                    >
                        Add Thermometer
                    </SidebarMenuButton>
                    <SidebarMenuButton
                        onClick={() => {
                            if (runAddMatching()) closeAll();
                        }}
                        disabled={$isLoading}
                    >
                        Add Matching
                    </SidebarMenuButton>
                    <SidebarMenuButton
                        onClick={() => {
                            if (runAddMeasuring()) closeAll();
                        }}
                        disabled={$isLoading}
                    >
                        Add Measuring
                    </SidebarMenuButton>
                </div>
            </DialogContent>
        </Dialog>
    );
};
