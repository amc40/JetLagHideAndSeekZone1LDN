import { useStore } from "@nanostores/react";
import { MapPinned } from "lucide-react";

import { debugLocationOverride } from "@/lib/context";

/**
 * Standing reminder that the app is using a hand-picked stand-in for the
 * device's GPS position, so debug mode can't be left on by accident during a
 * real game.
 */
export const DebugLocationIndicator = ({
    className = "",
}: {
    className?: string;
}) => {
    const $debugLocation = useStore(debugLocationOverride);

    if ($debugLocation === false) return null;

    return (
        <div
            className={`flex items-center gap-2 rounded-md bg-violet-100 px-3 py-1.5 text-sm text-violet-900 shadow-md ${className}`}
            role="status"
        >
            <MapPinned className="h-4 w-4 shrink-0" />
            <span>
                Debug location:{" "}
                <span className="tabular-nums">
                    {$debugLocation.latitude.toFixed(4)},{" "}
                    {$debugLocation.longitude.toFixed(4)}
                </span>
            </span>
            <button
                type="button"
                className="font-semibold underline underline-offset-2"
                onClick={() => debugLocationOverride.set(false)}
            >
                Turn off
            </button>
        </div>
    );
};
