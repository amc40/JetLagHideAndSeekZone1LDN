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
import { SidebarMenuButton } from "@/components/ui/sidebar-l";
import {
    addQuestion,
    deviceLocation,
    isLoading,
    leafletMapContext,
} from "@/lib/context";

export const AddQuestionDialog = ({
    children,
}: {
    children: React.ReactNode;
}) => {
    const $isLoading = useStore(isLoading);
    const [open, setOpen] = React.useState(false);

    const closeAll = () => setOpen(false);

    // New questions start at the seeker's own position when it is known
    // (Follow Me GPS or a debug override), otherwise at the map centre.
    const startPoint = () => {
        const map = leafletMapContext.get();
        if (!map) return null;
        const device = deviceLocation.get();
        if (device) return { lat: device.latitude, lng: device.longitude };
        return map.getCenter();
    };

    const runAddRadius = () => {
        const center = startPoint();
        if (!center) return false;
        addQuestion({
            id: "radius",
            data: { lat: center.lat, lng: center.lng },
        });
        return true;
    };

    const runAddThermometer = () => {
        const center = startPoint();
        if (!center) return false;
        const destination = turf.destination([center.lng, center.lat], 1, 90, {
            units: "kilometers",
        });

        addQuestion({
            id: "thermometer",
            data: {
                latA: center.lat,
                lngA: center.lng,
                latB: destination.geometry.coordinates[1],
                lngB: destination.geometry.coordinates[0],
            },
        });

        return true;
    };

    const runAddMatching = () => {
        const center = startPoint();
        if (!center) return false;
        addQuestion({
            id: "matching",
            data: { lat: center.lat, lng: center.lng },
        });
        return true;
    };

    const runAddMeasuring = () => {
        const center = startPoint();
        if (!center) return false;
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
