import { useStore } from "@nanostores/react";
import { Layers } from "lucide-react";

import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    baseTileLayer,
    mapOverlays,
    showTransitStops,
    thunderforestApiKey,
} from "@/lib/context";

import { OVERLAY_CONFIG, type OverlayKey } from "./overlayConfig";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select } from "./ui/select";
import { Separator } from "./ui/separator";

export const MapLayersButton = ({ className = "" }: { className?: string }) => {
    const $baseTileLayer = useStore(baseTileLayer);
    const $thunderforestApiKey = useStore(thunderforestApiKey);
    const $showTransitStops = useStore(showTransitStops);
    const $mapOverlays = useStore(mapOverlays);

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    className={`light text-slate-700 flex items-center gap-2 ${className}`}
                    aria-label="Map layers"
                >
                    <Layers className="h-4 w-4" />
                    Map Layers
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className="w-[300px] light flex flex-col gap-3 p-4"
                align="center"
                side="bottom"
            >
                <Label>Base map style</Label>
                <Select
                    trigger="Base map style"
                    options={{
                        voyager: "CARTO Voyager",
                        light: "CARTO Light",
                        dark: "CARTO Dark",
                        transport: "Thunderforest Transport",
                        neighbourhood: "Thunderforest Neighbourhood",
                        osmcarto: "OpenStreetMap Carto",
                    }}
                    value={$baseTileLayer}
                    onValueChange={(v) => baseTileLayer.set(v as any)}
                />
                <div className="flex flex-col gap-2">
                    <Label>Thunderforest API Key</Label>
                    <Input
                        type="text"
                        value={$thunderforestApiKey}
                        id="thunderforestApiKey"
                        onChange={(e) =>
                            thunderforestApiKey.set(e.target.value)
                        }
                        placeholder="Enter your Thunderforest API key"
                    />
                    <p className="text-xs text-gray-500">
                        Needed for Thunderforest map styles. Create a key{" "}
                        <a
                            href="https://manage.thunderforest.com/users/sign_up?price=hobby-project-usd"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-500 cursor-pointer"
                        >
                            here.
                        </a>{" "}
                        Don&apos;t worry, it&apos;s free.
                    </p>
                </div>
                <Separator className="bg-slate-300" />
                <div className="flex flex-row items-center justify-between gap-2">
                    <label className="text-base font-medium">
                        Show tube &amp; rail stops?
                    </label>
                    <Checkbox
                        checked={$showTransitStops}
                        onCheckedChange={() =>
                            showTransitStops.set(!$showTransitStops)
                        }
                    />
                </div>
                <Separator className="bg-slate-300" />
                <Label>Map Overlays</Label>
                <div className="flex flex-col gap-2">
                    {(
                        Object.entries(OVERLAY_CONFIG) as [
                            OverlayKey,
                            (typeof OVERLAY_CONFIG)[OverlayKey],
                        ][]
                    ).map(([key, cfg]) => (
                        <div
                            key={key}
                            className="flex flex-row items-center justify-between gap-2"
                        >
                            <label className="text-base font-medium">
                                {cfg.label}
                            </label>
                            <Checkbox
                                checked={$mapOverlays.includes(key)}
                                onCheckedChange={() => {
                                    if ($mapOverlays.includes(key)) {
                                        mapOverlays.set(
                                            $mapOverlays.filter(
                                                (k) => k !== key,
                                            ),
                                        );
                                    } else {
                                        mapOverlays.set([...$mapOverlays, key]);
                                    }
                                }}
                            />
                        </div>
                    ))}
                </div>
            </PopoverContent>
        </Popover>
    );
};
