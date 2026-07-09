import { useStore } from "@nanostores/react";
import { useEffect, useRef } from "react";
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
import {
    Drawer,
    DrawerContent,
    DrawerHeader,
    DrawerTitle,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import {
    additionalMapGeoLocations,
    allowGooglePlusCodes,
    alwaysUsePastebin,
    animateMapMovements,
    autoSave,
    autoZoom,
    customInitPreference,
    customPresets,
    customStations,
    defaultCustomQuestions,
    defaultUnit,
    disabledStations,
    displayHidingZonesOptions,
    followMe,
    hiderMode,
    hidingRadius,
    hidingRadiusUnits,
    hidingZone,
    includeDefaultStations,
    isLoading,
    leafletMapContext,
    mapGeoJSON,
    mapGeoLocation,
    optionsDrawerOpen,
    pastebinApiKey,
    permanentOverlay,
    planningModeEnabled,
    polyGeoJSON,
    questions,
    save,
    showTutorial,
    triggerLocalRefresh,
    useCustomStations,
} from "@/lib/context";
import {
    HIDING_ZONE_COMPRESSED_URL_PARAM,
    PASTEBIN_URL_PARAM,
    shareHidingZone,
} from "@/lib/shareHidingZone";
import { cn, decompress, fetchFromPastebin } from "@/lib/utils";
import { CacheType, clearCache } from "@/maps/api";
import { questionsSchema } from "@/maps/schema";

import { LatitudeLongitude } from "./LatLngPicker";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select } from "./ui/select";
import { Separator } from "./ui/separator";
import {
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from "./ui/sidebar-l";
import { UnitSelect } from "./UnitSelect";

const HIDING_ZONE_URL_PARAM = "hz";

export const OptionDrawers = ({ className }: { className?: string }) => {
    useStore(triggerLocalRefresh);
    const $defaultCustomQuestions = useStore(defaultCustomQuestions);
    const $allowGooglePlusCodes = useStore(allowGooglePlusCodes);
    const $defaultUnit = useStore(defaultUnit);
    const $animateMapMovements = useStore(animateMapMovements);
    const $autoZoom = useStore(autoZoom);
    const $hiderMode = useStore(hiderMode);
    const $autoSave = useStore(autoSave);
    const $hidingZone = useStore(hidingZone);
    const $planningMode = useStore(planningModeEnabled);
    const $pastebinApiKey = useStore(pastebinApiKey);
    const $alwaysUsePastebin = useStore(alwaysUsePastebin);
    const $followMe = useStore(followMe);
    const $customInitPref = useStore(customInitPreference);
    const $isLoading = useStore(isLoading);
    const $isOptionsOpen = useStore(optionsDrawerOpen);
    const isMobile = useIsMobile();
    const lastDefaultUnit = useRef($defaultUnit);
    const hasSyncedInitialUnit = useRef(false);

    useEffect(() => {
        const currentDefault = $defaultUnit;

        if (!hasSyncedInitialUnit.current) {
            hasSyncedInitialUnit.current = true;
            if (hidingRadiusUnits.get() !== currentDefault) {
                hidingRadiusUnits.set(currentDefault);
            }
        } else if (lastDefaultUnit.current !== currentDefault) {
            hidingRadiusUnits.set(currentDefault);
        }

        lastDefaultUnit.current = currentDefault;
    }, [$defaultUnit]);

    useEffect(() => {
        const params = new URL(window.location.toString()).searchParams;
        const hidingZoneOld = params.get(HIDING_ZONE_URL_PARAM);
        const hidingZoneCompressed = params.get(
            HIDING_ZONE_COMPRESSED_URL_PARAM,
        );
        const pastebinId = params.get(PASTEBIN_URL_PARAM);

        if (hidingZoneOld !== null) {
            // Legacy base64 encoding
            try {
                loadHidingZone(atob(hidingZoneOld));
                // Remove hiding zone parameter after initial load
                window.history.replaceState({}, "", window.location.pathname);
            } catch (e) {
                toast.error(`Invalid hiding zone settings: ${e}`);
            }
        } else if (hidingZoneCompressed !== null) {
            // Modern compressed format
            decompress(hidingZoneCompressed).then((data) => {
                try {
                    loadHidingZone(data);
                    // Remove hiding zone parameter after initial load
                    window.history.replaceState(
                        {},
                        "",
                        window.location.pathname,
                    );
                } catch (e) {
                    toast.error(`Invalid hiding zone settings: ${e}`);
                }
            });
        } else if (pastebinId !== null) {
            fetchFromPastebin(pastebinId)
                .then((data) => {
                    try {
                        loadHidingZone(data);
                        // Remove pb parameter after initial load
                        window.history.replaceState(
                            {},
                            "",
                            window.location.pathname,
                        );
                        toast.success(
                            "Successfully loaded data from Pastebin link!",
                        );
                    } catch (e) {
                        toast.error(`Invalid data from Pastebin: ${e}`);
                    }
                })
                .catch((error) => {
                    console.error("Failed to fetch from Pastebin:", error);
                    toast.error(
                        `Failed to load from Pastebin: ${error.message}`,
                    );
                });
        }
    }, []);

    const loadHidingZone = (hidingZone: string) => {
        try {
            const geojson = JSON.parse(hidingZone);

            if (
                geojson.properties &&
                geojson.properties.isHidingZone === true
            ) {
                questions.set(
                    questionsSchema.parse(geojson.properties.questions ?? []),
                );
                mapGeoLocation.set(geojson);
                mapGeoJSON.set(null);
                polyGeoJSON.set(null);

                if (geojson.alternateLocations) {
                    additionalMapGeoLocations.set(geojson.alternateLocations);
                } else {
                    additionalMapGeoLocations.set([]);
                }
            } else {
                if (geojson.questions) {
                    questions.set(questionsSchema.parse(geojson.questions));
                    delete geojson.questions;

                    mapGeoJSON.set(geojson);
                    polyGeoJSON.set(geojson);
                } else {
                    questions.set([]);
                    mapGeoJSON.set(geojson);
                    polyGeoJSON.set(geojson);
                }
            }

            const incomingPresets =
                geojson.presets ?? geojson.properties?.presets;
            if (incomingPresets && Array.isArray(incomingPresets)) {
                try {
                    const normalized = (incomingPresets as any[])
                        .filter((p) => p && p.data)
                        .map((p) => {
                            return {
                                id:
                                    p.id ??
                                    (typeof crypto !== "undefined" &&
                                    typeof (crypto as any).randomUUID ===
                                        "function"
                                        ? (crypto as any).randomUUID()
                                        : String(Date.now()) + Math.random()),
                                name: p.name ?? "Imported preset",
                                type: p.type ?? "custom",
                                data: p.data,
                                createdAt:
                                    p.createdAt ?? new Date().toISOString(),
                            };
                        });
                    if (normalized.length > 0) {
                        customPresets.set(normalized);
                        toast.info(`Imported ${normalized.length} preset(s)`);
                    }
                } catch (err) {
                    console.warn("Failed to import presets", err);
                }
            }

            if (
                geojson.disabledStations !== null &&
                geojson.disabledStations.constructor === Array
            ) {
                disabledStations.set(geojson.disabledStations);
            }

            if (geojson.hidingRadius !== null) {
                hidingRadius.set(geojson.hidingRadius);
            }

            if (geojson.zoneOptions) {
                displayHidingZonesOptions.set(geojson.zoneOptions ?? []);
            }

            if (typeof geojson.useCustomStations === "boolean") {
                useCustomStations.set(geojson.useCustomStations);
            }

            if (
                geojson.customStations &&
                geojson.customStations.constructor === Array
            ) {
                customStations.set(geojson.customStations);
            }

            if (typeof geojson.includeDefaultStations === "boolean") {
                includeDefaultStations.set(geojson.includeDefaultStations);
            }

            if (geojson.permanentOverlay) {
                permanentOverlay.set(geojson.permanentOverlay);
            } else {
                permanentOverlay.set(null);
            }

            toast.success("Hiding zone loaded successfully", {
                autoClose: 2000,
            });
        } catch (e) {
            toast.error(`Invalid hiding zone settings: ${e}`);
        }
    };

    return (
        <>
            {!isMobile && (
                <div
                    className={cn(
                        "flex justify-end gap-2 max-[412px]:!mb-4 max-[340px]:flex-col",
                        className,
                    )}
                >
                    <Button
                        className="shadow-md"
                        onClick={() =>
                            shareHidingZone(
                                $hidingZone,
                                $alwaysUsePastebin,
                                $pastebinApiKey,
                            )
                        }
                        data-tutorial-id="share-questions-button"
                    >
                        Share
                    </Button>
                    <Button
                        className="w-24 shadow-md"
                        onClick={() => {
                            showTutorial.set(true);
                        }}
                    >
                        Tutorial
                    </Button>
                    <Button
                        className="w-24 shadow-md"
                        data-tutorial-id="option-questions-button"
                        onClick={() => optionsDrawerOpen.set(true)}
                    >
                        Options
                    </Button>
                </div>
            )}
            <Drawer open={$isOptionsOpen} onOpenChange={optionsDrawerOpen.set}>
                <DrawerContent>
                    <div className="flex flex-col items-center gap-4 mb-4">
                        <DrawerHeader>
                            <DrawerTitle className="text-4xl font-semibold font-poppins">
                                Options
                            </DrawerTitle>
                        </DrawerHeader>
                        <div className="overflow-y-scroll max-h-[65vh] flex flex-col items-center gap-4 max-w-[1000px] px-4 sm:px-12">
                            <div className="flex flex-row max-[330px]:flex-col gap-4">
                                <Button
                                    onClick={() => {
                                        if (!navigator || !navigator.clipboard)
                                            return toast.error(
                                                "Clipboard not supported",
                                            );
                                        navigator.clipboard.writeText(
                                            JSON.stringify($hidingZone),
                                        );
                                        toast.success(
                                            "Hiding zone copied successfully",
                                            {
                                                autoClose: 2000,
                                            },
                                        );
                                    }}
                                >
                                    Copy Hiding Zone
                                </Button>
                                <Button
                                    onClick={() => {
                                        if (!navigator || !navigator.clipboard)
                                            return toast.error(
                                                "Clipboard not supported",
                                            );
                                        navigator.clipboard
                                            .readText()
                                            .then(loadHidingZone);
                                    }}
                                >
                                    Paste Hiding Zone
                                </Button>
                            </div>
                            <Separator className="bg-slate-300 w-[280px]" />
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button
                                        variant="outline"
                                        disabled={$isLoading}
                                    >
                                        Clear Questions &amp; Cache
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>
                                            Clear questions &amp; cache?
                                        </AlertDialogTitle>
                                        <AlertDialogDescription>
                                            This action cannot be undone. This
                                            will permanently delete all
                                            questions and clear cached zone
                                            data, useful for starting a fresh
                                            round.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>
                                            Cancel
                                        </AlertDialogCancel>
                                        <AlertDialogAction
                                            onClick={() => {
                                                mapGeoJSON.set(null);
                                                questions.set([]);
                                                clearCache(
                                                    CacheType.ZONE_CACHE,
                                                );
                                            }}
                                            className="mb-2 sm:mb-0"
                                        >
                                            Clear Questions &amp; Cache
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                            <Separator className="bg-slate-300 w-[280px]" />
                            <Label>Default Unit</Label>
                            <UnitSelect
                                unit={$defaultUnit}
                                onChange={defaultUnit.set}
                            />
                            <Separator className="bg-slate-300 w-[280px]" />
                            <Label>New Custom Question Defaults</Label>
                            <Select
                                trigger="New custom default"
                                options={{
                                    ask: "Ask each time",
                                    blank: "Start blank",
                                    prefill: "Copy from current",
                                }}
                                value={$customInitPref}
                                onValueChange={(v) =>
                                    customInitPreference.set(v as any)
                                }
                            />
                            <Separator className="bg-slate-300 w-[280px]" />
                            <div className="flex flex-col items-center gap-2">
                                <Label>Pastebin API Key</Label>
                                <Input
                                    type="text"
                                    value={$pastebinApiKey}
                                    id="pastebinApiKey"
                                    onChange={(e) =>
                                        pastebinApiKey.set(e.target.value)
                                    }
                                    placeholder="Enter your Pastebin API key"
                                />
                                <p className="text-xs text-gray-500">
                                    Needed for sharing large game data. Create a
                                    key{" "}
                                    <a
                                        href="https://pastebin.com/doc_api"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-500 cursor-pointer"
                                    >
                                        here
                                    </a>
                                    .
                                </p>
                            </div>
                            <Separator className="bg-slate-300 w-[280px]" />
                            <Label>Permanent Map Overlay</Label>
                            <div className="flex flex-row max-[330px]:flex-col gap-4">
                                <Button
                                    onClick={() => permanentOverlay.set(null)}
                                >
                                    Remove
                                </Button>
                                <Button
                                    onClick={async () => {
                                        if (!navigator || !navigator.clipboard)
                                            return toast.error(
                                                "Clipboard not supported",
                                            );

                                        try {
                                            const clipboard =
                                                await navigator.clipboard.readText();
                                            const geojson =
                                                JSON.parse(clipboard);
                                            permanentOverlay.set(geojson);
                                        } catch (e) {
                                            toast.error(
                                                `Invalid GeoJSON overlay: ${e}`,
                                            );
                                        }
                                    }}
                                >
                                    Paste GeoJSON
                                </Button>
                            </div>
                            <Separator className="bg-slate-300 w-[280px]" />
                            <label className="flex w-full min-h-11 flex-row items-center justify-between gap-2 cursor-pointer">
                                <span className="text-base font-medium">
                                    Animate map movements?
                                </span>
                                <Checkbox
                                    checked={$animateMapMovements}
                                    onCheckedChange={() => {
                                        animateMapMovements.set(
                                            !$animateMapMovements,
                                        );
                                    }}
                                />
                            </label>
                            <label className="flex w-full min-h-11 flex-row items-center justify-between gap-2 cursor-pointer">
                                <span className="text-base font-medium">
                                    Force Pastebin for sharing?
                                </span>
                                <Checkbox
                                    checked={$alwaysUsePastebin}
                                    onCheckedChange={() =>
                                        alwaysUsePastebin.set(
                                            !$alwaysUsePastebin,
                                        )
                                    }
                                />
                            </label>
                            <label className="flex w-full min-h-11 flex-row items-center justify-between gap-2 cursor-pointer">
                                <span className="text-base font-medium">
                                    Enable planning mode?
                                </span>
                                <Checkbox
                                    checked={$planningMode}
                                    onCheckedChange={() => {
                                        if ($planningMode === true) {
                                            const map = leafletMapContext.get();

                                            if (map) {
                                                map.eachLayer((layer: any) => {
                                                    if (
                                                        layer.questionKey ||
                                                        layer.questionKey === 0
                                                    ) {
                                                        map.removeLayer(layer);
                                                    }
                                                });
                                            }
                                        } else {
                                            questions.set([...questions.get()]); // I think that this should always be auto-saved
                                        }

                                        planningModeEnabled.set(!$planningMode);
                                    }}
                                />
                            </label>
                            <label className="flex w-full min-h-11 flex-row items-center justify-between gap-2 cursor-pointer">
                                <span className="text-base font-medium">
                                    Auto save?
                                </span>
                                <Checkbox
                                    checked={$autoSave}
                                    onCheckedChange={() =>
                                        autoSave.set(!$autoSave)
                                    }
                                />
                            </label>
                            <label className="flex w-full min-h-11 flex-row items-center justify-between gap-2 cursor-pointer">
                                <span className="text-base font-medium">
                                    Auto zoom?
                                </span>
                                <Checkbox
                                    checked={$autoZoom}
                                    onCheckedChange={() =>
                                        autoZoom.set(!$autoZoom)
                                    }
                                />
                            </label>
                            <label className="flex w-full min-h-11 flex-row items-center justify-between gap-2 cursor-pointer">
                                <span className="text-base font-medium">
                                    Follow Me (GPS)?
                                </span>
                                <Checkbox
                                    checked={$followMe}
                                    onCheckedChange={() =>
                                        followMe.set(!$followMe)
                                    }
                                />
                            </label>
                            <label className="flex w-full min-h-11 flex-row items-center justify-between gap-2 cursor-pointer">
                                <span className="text-base font-medium">
                                    Default to custom questions?
                                </span>
                                <Checkbox
                                    checked={$defaultCustomQuestions}
                                    onCheckedChange={() =>
                                        defaultCustomQuestions.set(
                                            !$defaultCustomQuestions,
                                        )
                                    }
                                />
                            </label>
                            <label className="flex w-full min-h-11 flex-row items-center justify-between gap-2 cursor-pointer">
                                <span className="text-base font-medium">
                                    Allow Google Plus codes?
                                </span>
                                <Checkbox
                                    checked={$allowGooglePlusCodes}
                                    onCheckedChange={() =>
                                        allowGooglePlusCodes.set(
                                            !$allowGooglePlusCodes,
                                        )
                                    }
                                />
                            </label>
                            <label className="flex w-full min-h-11 flex-row items-center justify-between gap-2 cursor-pointer">
                                <span className="text-base font-medium">
                                    Hider mode?
                                </span>
                                <Checkbox
                                    checked={!!$hiderMode}
                                    onCheckedChange={() => {
                                        if ($hiderMode === false) {
                                            const $leafletMapContext =
                                                leafletMapContext.get();

                                            if ($leafletMapContext) {
                                                const center =
                                                    $leafletMapContext.getCenter();
                                                hiderMode.set({
                                                    latitude: center.lat,
                                                    longitude: center.lng,
                                                });
                                            } else {
                                                hiderMode.set({
                                                    latitude: 0,
                                                    longitude: 0,
                                                });
                                            }
                                        } else {
                                            hiderMode.set(false);
                                        }
                                    }}
                                />
                            </label>
                            {$hiderMode !== false && (
                                <SidebarMenu>
                                    <LatitudeLongitude
                                        latitude={$hiderMode.latitude}
                                        longitude={$hiderMode.longitude}
                                        inlineEdit
                                        onChange={(latitude, longitude) => {
                                            $hiderMode.latitude =
                                                latitude ?? $hiderMode.latitude;
                                            $hiderMode.longitude =
                                                longitude ??
                                                $hiderMode.longitude;

                                            if ($autoSave) {
                                                hiderMode.set({
                                                    ...$hiderMode,
                                                });
                                            } else {
                                                triggerLocalRefresh.set(
                                                    Math.random(),
                                                );
                                            }
                                        }}
                                        label="Hider Location"
                                    />
                                    {!autoSave && (
                                        <SidebarMenuItem>
                                            <SidebarMenuButton
                                                className="bg-blue-600 p-2 rounded-md font-semibold font-poppins transition-shadow duration-500 mt-2"
                                                onClick={save}
                                            >
                                                Save
                                            </SidebarMenuButton>
                                        </SidebarMenuItem>
                                    )}
                                </SidebarMenu>
                            )}
                        </div>
                    </div>
                </DrawerContent>
            </Drawer>
        </>
    );
};
