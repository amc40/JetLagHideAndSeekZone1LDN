import { useStore } from "@nanostores/react";
import * as turf from "@turf/turf";
import _ from "lodash";
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
    allowGooglePlusCodes,
    alwaysUsePastebin,
    animateMapMovements,
    autoSave,
    autoZoom,
    debugLocationOverride,
    defaultUnit,
    disabledStations,
    displayHidingZonesOptions,
    followMe,
    hiderMode,
    hidingRadius,
    hidingRadiusUnits,
    hidingZone,
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
} from "@/lib/context";
import {
    HIDING_ZONE_COMPRESSED_URL_PARAM,
    PASTEBIN_URL_PARAM,
    shareHidingZone,
} from "@/lib/shareHidingZone";
import {
    cn,
    decompress,
    fetchFromPastebin,
    parseJsonLenient,
} from "@/lib/utils";
import { CacheType, clearCache } from "@/maps/api";
import { questionsSchema } from "@/maps/schema";

import { LatitudeLongitude, loadCuratedStations } from "./LatLngPicker";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
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
    const $debugLocation = useStore(debugLocationOverride);
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
                loadHidingZone(atob(hidingZoneOld), false);
                // Remove hiding zone parameter after initial load
                window.history.replaceState({}, "", window.location.pathname);
            } catch (e) {
                toast.error(`Invalid hiding zone settings: ${e}`);
            }
        } else if (hidingZoneCompressed !== null) {
            // Modern compressed format
            decompress(hidingZoneCompressed).then((data) => {
                try {
                    loadHidingZone(data, false);
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
                        loadHidingZone(data, false);
                        // Remove pb parameter after initial load
                        window.history.replaceState(
                            {},
                            "",
                            window.location.pathname,
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

    const loadHidingZone = (hidingZone: string, showSuccessToast = true) => {
        try {
            const geojson = parseJsonLenient(hidingZone) as any;

            if (
                geojson.properties &&
                geojson.properties.isHidingZone === true
            ) {
                toast.error(
                    "This shared link uses an old format that's no longer supported.",
                );
                return;
            }

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

            if (geojson.permanentOverlay) {
                permanentOverlay.set(geojson.permanentOverlay);
            } else {
                permanentOverlay.set(null);
            }

            if (showSuccessToast) {
                toast.success("Hiding zone loaded successfully", {
                    autoClose: 2000,
                });
            }
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
                            <h3 className="text-lg font-semibold font-poppins self-start">
                                Playing
                            </h3>
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
                                            const center =
                                                $leafletMapContext?.getCenter();

                                            loadCuratedStations().then(
                                                (stations) => {
                                                    if (stations.length === 0)
                                                        return;

                                                    const nearest =
                                                        (center
                                                            ? _.minBy(
                                                                  stations,
                                                                  (station) =>
                                                                      turf.distance(
                                                                          [
                                                                              center.lng,
                                                                              center.lat,
                                                                          ],
                                                                          [
                                                                              station.lng,
                                                                              station.lat,
                                                                          ],
                                                                      ),
                                                              )
                                                            : stations[0]) ??
                                                        stations[0];

                                                    hiderMode.set({
                                                        latitude: nearest.lat,
                                                        longitude: nearest.lng,
                                                    });
                                                },
                                            );
                                        } else {
                                            hiderMode.set(false);
                                        }
                                    }}
                                />
                            </label>
                            {$hiderMode !== false && (
                                <SidebarMenu>
                                    <p className="text-sm text-muted-foreground self-start">
                                        Turn on <strong>Follow Me (GPS)</strong>{" "}
                                        below to answer questions from your live
                                        location, or set a{" "}
                                        <strong>debug location</strong> under
                                        Advanced to answer from a spot you pick
                                        by hand. This pin stays fixed as your
                                        hiding station either way.
                                    </p>
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
                                        stationsOnly
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
                                    Follow Me (GPS)?
                                </span>
                                <Checkbox
                                    checked={$followMe}
                                    onCheckedChange={() =>
                                        followMe.set(!$followMe)
                                    }
                                />
                            </label>
                            {$followMe && $debugLocation !== false && (
                                <p className="text-sm text-muted-foreground self-start">
                                    GPS tracking is paused while a debug
                                    location is set (see Advanced below).
                                </p>
                            )}

                            <Separator className="bg-slate-300 w-[280px]" />
                            <h3 className="text-lg font-semibold font-poppins self-start">
                                Map
                            </h3>
                            <Label>Default Unit</Label>
                            <UnitSelect
                                unit={$defaultUnit}
                                onChange={defaultUnit.set}
                            />
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

                            <Separator className="bg-slate-300 w-[280px]" />
                            <h3 className="text-lg font-semibold font-poppins self-start">
                                Data &amp; sharing
                            </h3>
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
                                                parseJsonLenient(clipboard);
                                            permanentOverlay.set(
                                                geojson as any,
                                            );
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
                            <h3 className="text-lg font-semibold font-poppins self-start">
                                Advanced
                            </h3>
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
                                    Debug: set my location manually?
                                </span>
                                <Checkbox
                                    checked={$debugLocation !== false}
                                    onCheckedChange={() => {
                                        if ($debugLocation !== false) {
                                            debugLocationOverride.set(false);
                                            return;
                                        }

                                        // Start from somewhere sensible: the
                                        // hider's station if there is one,
                                        // otherwise the middle of the map.
                                        const $hiderMode = hiderMode.get();
                                        const center = leafletMapContext
                                            .get()
                                            ?.getCenter();

                                        if ($hiderMode !== false) {
                                            debugLocationOverride.set({
                                                latitude: $hiderMode.latitude,
                                                longitude: $hiderMode.longitude,
                                            });
                                        } else if (center) {
                                            debugLocationOverride.set({
                                                latitude: center.lat,
                                                longitude: center.lng,
                                            });
                                        } else {
                                            const [latitude, longitude] =
                                                mapGeoLocation.get().geometry
                                                    .coordinates;
                                            debugLocationOverride.set({
                                                latitude,
                                                longitude,
                                            });
                                        }
                                    }}
                                />
                            </label>
                            {$debugLocation !== false && (
                                <SidebarMenu>
                                    <p className="text-sm text-muted-foreground self-start">
                                        The app will pretend your device is here
                                        instead of using real GPS, so you can
                                        answer questions as the hider from
                                        anywhere. Drag the violet pin on the
                                        map, or right-click the map and choose{" "}
                                        <strong>Set Debug Location</strong>.
                                    </p>
                                    <LatitudeLongitude
                                        latitude={$debugLocation.latitude}
                                        longitude={$debugLocation.longitude}
                                        inlineEdit
                                        onChange={(latitude, longitude) => {
                                            debugLocationOverride.set({
                                                latitude:
                                                    latitude ??
                                                    $debugLocation.latitude,
                                                longitude:
                                                    longitude ??
                                                    $debugLocation.longitude,
                                            });
                                        }}
                                        label="Debug Location"
                                    />
                                </SidebarMenu>
                            )}

                            <Separator className="bg-slate-300 w-[280px]" />
                            <h3 className="text-lg font-semibold font-poppins self-start">
                                Reset
                            </h3>
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
                        </div>
                    </div>
                </DrawerContent>
            </Drawer>
        </>
    );
};
