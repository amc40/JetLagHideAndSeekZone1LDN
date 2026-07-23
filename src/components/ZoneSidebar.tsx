import { useStore } from "@nanostores/react";
import * as turf from "@turf/turf";
import type { Feature, FeatureCollection } from "geojson";
import * as L from "leaflet";
import _ from "lodash";
import { SidebarCloseIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";

import {
    Sidebar,
    SidebarContent,
    SidebarContext,
    SidebarGroup,
    SidebarGroupContent,
    SidebarMenu,
    SidebarMenuItem,
} from "@/components/ui/sidebar-r";
import {
    animateMapMovements,
    autoZoom,
    disabledStations,
    displayHidingZones,
    displayHidingZonesStyle,
    hidingRadius,
    hidingRadiusUnits,
    isLoading,
    leafletMapContext,
    planningModeEnabled,
    questionFinishedMapData,
    questions,
    trainStations,
} from "@/lib/context";
import { getStationModesIcon } from "@/lib/stationIcons";
import { cn } from "@/lib/utils";
import {
    BLANK_GEOJSON,
    fetchCuratedStations,
    findPlacesSpecificInZone,
    findTentacleLocations,
    nearestToQuestion,
    QuestionSpecificLocation,
    type StationCircle,
    type StationPlace,
} from "@/maps/api";
import {
    extractStationLabel,
    extractStationName,
    geoSpatialVoronoi,
    holedMask,
    lngLatToText,
    safeUnion,
    type StationMode,
} from "@/maps/geo-utils";

import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "./ui/command";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { ScrollToTop } from "./ui/scroll-to-top";
import { MENU_ITEM_CLASSNAME } from "./ui/sidebar-l";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";
import { UnitSelect } from "./UnitSelect";

// Above this, the "can drastically slow down your device" warning is worth
// surfacing; below it (e.g. a Zone 1 sweep of a few dozen stations) it's just
// permanent noise.
const SLOW_STATION_COUNT_THRESHOLD = 150;

const DISPLAY_STYLE_OPTIONS: {
    value: "no-display" | "stations" | "zones" | "no-overlap";
    label: string;
}[] = [
    { value: "no-display", label: "No Display" },
    { value: "stations", label: "All Stations" },
    { value: "zones", label: "All Zones" },
    { value: "no-overlap", label: "No Overlap" },
];

export const ZoneSidebar = () => {
    const $displayHidingZones = useStore(displayHidingZones);
    const $questionFinishedMapData = useStore(questionFinishedMapData);
    const $displayHidingZonesStyle = useStore(displayHidingZonesStyle);
    const $hidingRadius = useStore(hidingRadius);
    const $hidingRadiusUnits = useStore(hidingRadiusUnits);
    const $isLoading = useStore(isLoading);
    const map = useStore(leafletMapContext);
    const stations = useStore(trainStations);
    const $disabledStations = useStore(disabledStations);
    const [hidingZoneModeStationID, setHidingZoneModeStationID] =
        useState<string>("");
    const [stationSearch, setStationSearch] = useState<string>("");
    const isStationSearchActive = stationSearch.trim().length > 0;
    const setStations = trainStations.set;
    const sidebarRef = useRef<HTMLDivElement>(null);

    const removeHidingZones = () => {
        if (!map) return;

        map.eachLayer((layer: any) => {
            if (layer.hidingZones) {
                // Hopefully only geoJSON layers
                map.removeLayer(layer);
            }
        });
    };

    const showGeoJSON = (
        geoJSONData: any,
        nonOverlappingStations: boolean = false,
        additionalOptions: L.GeoJSONOptions = {},
    ) => {
        if (!map) return;

        removeHidingZones();

        const geoJsonLayer = L.geoJSON(geoJSONData, {
            style: {
                color: "green",
                fillColor: "green",
                fillOpacity: 0.2,
            },
            onEachFeature: nonOverlappingStations
                ? (feature, layer) => {
                      layer.on("click", async () => {
                          if (!map) return;

                          setHidingZoneModeStationID(
                              feature.properties.properties.id,
                          );
                      });
                  }
                : undefined,
            pointToLayer(geoJsonPoint, latlng) {
                const modes = (geoJsonPoint.properties?.modes ??
                    []) as StationMode[];
                const marker = L.marker(latlng, {
                    icon: getStationModesIcon(modes, map.getZoom()),
                });

                marker.bindPopup(
                    `<b>${
                        extractStationName(geoJsonPoint) || "No Name Found"
                    } (${lngLatToText(
                        geoJsonPoint.geometry.coordinates as [number, number],
                    )})</b>`,
                );

                return marker;
            },
            ...additionalOptions,
        });

        // @ts-expect-error This is intentionally added as a check
        geoJsonLayer.hidingZones = true;

        geoJsonLayer.addTo(map);
    };

    useEffect(() => {
        if (!map || isLoading.get()) return;

        const initializeHidingZones = async () => {
            isLoading.set(true);

            try {
                // Stations come solely from the hand-curated list, with all
                // metadata (modes/icons, lines, merged interchanges) baked in.
                // Nothing is fetched live.
                const curated = await fetchCuratedStations();
                const places: StationPlace[] = (curated.features ?? []).map(
                    (f: any) => ({
                        type: "Feature",
                        geometry: f.geometry,
                        properties: f.properties,
                    }),
                );

                const unionized = safeUnion(
                    turf.simplify($questionFinishedMapData, {
                        tolerance: 0.001,
                    }),
                );

                let circles = places
                    .map((place) => {
                        const radius = $hidingRadius;
                        const center = turf.getCoord(place);
                        const circle = turf.circle(center, radius, {
                            steps: 32,
                            units: $hidingRadiusUnits,
                            properties: place,
                        });

                        return circle;
                    })
                    .filter((circle) => {
                        return !turf.booleanWithin(circle, unionized);
                    });

                for (const question of questions.get()) {
                    if (planningModeEnabled.get() && question.data.drag) {
                        continue;
                    }

                    if (
                        question.id === "matching" &&
                        (question.data.type === "same-first-letter-station" ||
                            question.data.type === "same-length-station" ||
                            question.data.type === "same-train-line")
                    ) {
                        const location = turf.point([
                            question.data.lng,
                            question.data.lat,
                        ]);

                        const nearestTrainStation = turf.nearestPoint(
                            location,
                            turf.featureCollection(
                                circles.map((x) => x.properties),
                            ) as any,
                        );

                        if (question.data.type === "same-train-line") {
                            // Line memberships are baked into the curated data,
                            // so "same line" = the stations share any line.
                            const seekerLines = new Set(
                                (nearestTrainStation.properties.lines ??
                                    []) as string[],
                            );
                            if (seekerLines.size === 0) {
                                toast.warning(
                                    `No line data for ${extractStationName(
                                        nearestTrainStation,
                                    )}; skipping 'same train line' filter.`,
                                );
                                continue;
                            }

                            circles = circles.filter((circle) => {
                                const lines = (circle.properties.properties
                                    .lines ?? []) as string[];
                                const shares = lines.some((line) =>
                                    seekerLines.has(line),
                                );

                                return question.data.same ? shares : !shares;
                            });
                        }

                        const englishName =
                            extractStationName(nearestTrainStation);

                        if (!englishName)
                            return toast.error("No English name found");

                        if (
                            question.data.type === "same-first-letter-station"
                        ) {
                            const letter = englishName[0].toUpperCase();

                            circles = circles.filter((circle) => {
                                const name = extractStationName(
                                    circle.properties,
                                );
                                if (!name) return false;

                                return question.data.same
                                    ? name[0].toUpperCase() === letter
                                    : name[0].toUpperCase() !== letter;
                            });
                        } else if (
                            question.data.type === "same-length-station"
                        ) {
                            const seekerLength = englishName.length;
                            const comparison = question.data.lengthComparison;

                            circles = circles.filter((circle) => {
                                const name = extractStationName(
                                    circle.properties,
                                );
                                if (!name) return false;

                                if (comparison === "same") {
                                    return name.length === seekerLength;
                                } else if (comparison === "shorter") {
                                    return name.length < seekerLength;
                                } else if (comparison === "longer") {
                                    return name.length > seekerLength;
                                }
                                return false;
                            });
                        }
                    }
                    if (
                        question.id === "measuring" &&
                        (question.data.type === "mcdonalds" ||
                            question.data.type === "seven11")
                    ) {
                        const points = await findPlacesSpecificInZone(
                            question.data.type === "mcdonalds"
                                ? QuestionSpecificLocation.McDonalds
                                : QuestionSpecificLocation.Seven11,
                        );

                        const nearestPoint = turf.nearestPoint(
                            turf.point([question.data.lng, question.data.lat]),
                            points as any,
                        );

                        const distance = turf.distance(
                            turf.point([question.data.lng, question.data.lat]),
                            nearestPoint as any,
                            {
                                units: "miles",
                            },
                        );

                        circles = circles.filter((circle) => {
                            const point = turf.point(
                                turf.getCoord(circle.properties),
                            );

                            const nearest = turf.nearestPoint(
                                point,
                                points as any,
                            );

                            return question.data.hiderCloser
                                ? turf.distance(point, nearest as any, {
                                      units: "miles",
                                  }) <
                                      distance + $hidingRadius
                                : turf.distance(point, nearest as any, {
                                      units: "miles",
                                  }) >
                                      distance - $hidingRadius;
                        });
                    }
                }

                setStations(circles);
            } finally {
                isLoading.set(false);
            }
        };

        if ($displayHidingZones && $questionFinishedMapData) {
            initializeHidingZones().catch((error) => {
                console.log("Error in hiding zone initialization:", error);
                toast.error(
                    "An error occurred during hiding zone initialization",
                    { toastId: "hiding-zone-initialization-error" },
                );
            });
        }
    }, [
        $questionFinishedMapData,
        $displayHidingZones,
        $hidingRadius,
        $hidingRadiusUnits,
    ]);

    useEffect(() => {
        if (!map || isLoading.get()) return;

        if ($displayHidingZones && hidingZoneModeStationID) {
            const hiderStation = _.find(
                stations,
                (c) => c.properties.properties.id === hidingZoneModeStationID,
            );

            if (hiderStation !== undefined) {
                selectionProcess(
                    hiderStation,
                    map,
                    stations,
                    showGeoJSON,
                    $questionFinishedMapData,
                    $hidingRadius,
                ).catch((error) => {
                    console.log("Error in hiding zone selection:", error);
                    toast.error(
                        "An error occurred during hiding zone selection",
                        { toastId: "hiding-zone-selection-error" },
                    );
                });
            } else {
                toast.error("Invalid hiding zone selected", {
                    toastId: "hiding-zone-selection-error",
                });
            }
        } else if ($displayHidingZones) {
            const activeStations = stations.filter(
                (x) => !$disabledStations.includes(x.properties.properties.id),
            );
            showGeoJSON(
                styleStations(activeStations, $displayHidingZonesStyle),
                $displayHidingZonesStyle === "zones",
            );
        } else {
            removeHidingZones();
        }
    }, [
        $disabledStations,
        $displayHidingZones,
        $displayHidingZonesStyle,
        $hidingRadius,
        $questionFinishedMapData,
        hidingZoneModeStationID,
        stations,
    ]);

    return (
        <Sidebar
            side="right"
            title="Hiding Zone"
            description="View and configure the computed hiding zone and train stations."
        >
            <div className="flex items-center justify-between">
                <h2 className="ml-4 mt-4 font-poppins text-2xl">Hiding Zone</h2>
                <button
                    type="button"
                    aria-label="Close Hiding Zone panel"
                    className="p-2 mr-1 visible md:hidden cursor-pointer"
                    onClick={() => {
                        SidebarContext.get().setOpenMobile(false);
                    }}
                >
                    <SidebarCloseIcon className="scale-x-[-1]" />
                </button>
            </div>
            <SidebarContent ref={sidebarRef}>
                <ScrollToTop element={sidebarRef} minHeight={500} />
                <SidebarGroup>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            <SidebarMenuItem className={MENU_ITEM_CLASSNAME}>
                                <label className="flex w-full min-h-11 items-center justify-between gap-2 cursor-pointer">
                                    <span className="font-semibold font-poppins">
                                        Display hiding zones?
                                    </span>
                                    <Checkbox
                                        defaultChecked={$displayHidingZones}
                                        checked={$displayHidingZones}
                                        onCheckedChange={displayHidingZones.set}
                                        disabled={$isLoading}
                                    />
                                </label>
                            </SidebarMenuItem>
                            {$displayHidingZones &&
                                stations.length >
                                    SLOW_STATION_COUNT_THRESHOLD && (
                                    <SidebarMenuItem
                                        className={cn(
                                            MENU_ITEM_CLASSNAME,
                                            "text-orange-500",
                                        )}
                                    >
                                        Warning: {stations.length} stations is a
                                        lot to display at once and can
                                        drastically slow down your device.
                                    </SidebarMenuItem>
                                )}
                            <SidebarMenuItem>
                                <Label className="font-semibold font-poppins ml-2">
                                    Hiding Zone Radius
                                </Label>
                                <div
                                    className={cn(
                                        MENU_ITEM_CLASSNAME,
                                        "gap-2 flex flex-row",
                                    )}
                                >
                                    <Input
                                        type="number"
                                        className="rounded-md p-2 w-16"
                                        value={$hidingRadius}
                                        onChange={(e) => {
                                            hidingRadius.set(
                                                parseFloat(e.target.value),
                                            );
                                        }}
                                        disabled={$isLoading}
                                    />
                                    <UnitSelect
                                        unit={$hidingRadiusUnits}
                                        disabled={$isLoading}
                                        onChange={(unit) => {
                                            hidingRadiusUnits.set(unit);
                                        }}
                                    />
                                </div>
                            </SidebarMenuItem>
                            {$displayHidingZones && stations.length > 0 && (
                                <SidebarMenuItem>
                                    <Label className="font-semibold font-poppins ml-2">
                                        Display style
                                    </Label>
                                    <div
                                        className={cn(
                                            MENU_ITEM_CLASSNAME,
                                            "flex-col items-stretch gap-2",
                                        )}
                                    >
                                        <ToggleGroup
                                            type="single"
                                            variant="outline"
                                            className="flex-wrap justify-start"
                                            value={$displayHidingZonesStyle}
                                            disabled={$isLoading}
                                            onValueChange={(value) => {
                                                if (!value) return;
                                                setHidingZoneModeStationID("");
                                                displayHidingZonesStyle.set(
                                                    value as typeof $displayHidingZonesStyle,
                                                );
                                            }}
                                        >
                                            {DISPLAY_STYLE_OPTIONS.map(
                                                (option) => (
                                                    <ToggleGroupItem
                                                        key={option.value}
                                                        value={option.value}
                                                        aria-label={
                                                            option.label
                                                        }
                                                        className="text-xs px-2"
                                                    >
                                                        {option.label}
                                                    </ToggleGroupItem>
                                                ),
                                            )}
                                        </ToggleGroup>
                                        <Button
                                            variant="destructive"
                                            size="sm"
                                            onClick={() => {
                                                disabledStations.set(
                                                    stations.map(
                                                        (x) =>
                                                            x.properties
                                                                .properties.id,
                                                    ),
                                                );
                                            }}
                                            disabled={$isLoading}
                                        >
                                            Disable All Stations
                                        </Button>
                                    </div>
                                </SidebarMenuItem>
                            )}
                            {$displayHidingZones && hidingZoneModeStationID && (
                                <SidebarMenuItem
                                    className={cn(
                                        MENU_ITEM_CLASSNAME,
                                        "bg-popover hover:bg-accent",
                                    )}
                                    disabled={$isLoading}
                                >
                                    Current:{" "}
                                    {(() => {
                                        const selected = stations.find(
                                            (x) =>
                                                x.properties.properties.id ===
                                                hidingZoneModeStationID,
                                        );
                                        const displayName = extractStationLabel(
                                            selected?.properties,
                                        );
                                        const id = selected?.properties
                                            .properties.id as string;
                                        const coords = selected?.properties
                                            .geometry.coordinates as [
                                            number,
                                            number,
                                        ];
                                        const href = id?.includes("/")
                                            ? `https://www.openstreetmap.org/${id}`
                                            : `https://www.openstreetmap.org/?mlat=${coords[1]}&mlon=${coords[0]}#map=17/${coords[1]}/${coords[0]}`;
                                        return (
                                            <a
                                                href={href}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="text-blue-500"
                                            >
                                                {displayName}
                                            </a>
                                        );
                                    })()}
                                </SidebarMenuItem>
                            )}
                            {$displayHidingZones &&
                                $disabledStations.length > 0 && (
                                    <SidebarMenuItem
                                        className="bg-popover hover:bg-accent relative flex cursor-pointer gap-2 select-none items-center rounded-sm px-2 py-2.5 text-sm outline-none data-[disabled=true]:pointer-events-none data-[selected='true']:bg-accent data-[selected=true]:text-accent-foreground data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0"
                                        onClick={() => {
                                            disabledStations.set([]);
                                        }}
                                        disabled={$isLoading}
                                    >
                                        Clear Disabled
                                    </SidebarMenuItem>
                                )}
                            {$displayHidingZones && (
                                <Command
                                    key={
                                        isStationSearchActive
                                            ? "station-search-active"
                                            : "station-search-idle"
                                    }
                                    shouldFilter={isStationSearchActive}
                                >
                                    <CommandInput
                                        placeholder="Search for a hiding zone..."
                                        value={stationSearch}
                                        onValueChange={setStationSearch}
                                        disabled={$isLoading}
                                    />
                                    <CommandList className="max-h-full">
                                        <CommandEmpty>
                                            No hiding zones found.
                                        </CommandEmpty>
                                        <CommandGroup>
                                            {stations.map((station) => {
                                                const id =
                                                    station.properties
                                                        .properties.id;
                                                const label =
                                                    extractStationLabel(
                                                        station.properties,
                                                    );
                                                const isDisabled =
                                                    $disabledStations.includes(
                                                        id,
                                                    );
                                                return (
                                                    <CommandItem
                                                        key={id}
                                                        data-station-id={id}
                                                        className="flex items-center justify-between gap-2"
                                                        onSelect={() => {
                                                            if (!map) return;
                                                            setHidingZoneModeStationID(
                                                                id,
                                                            );
                                                        }}
                                                        disabled={$isLoading}
                                                    >
                                                        <span
                                                            className={cn(
                                                                isDisabled &&
                                                                    "line-through text-muted-foreground",
                                                            )}
                                                        >
                                                            {label}
                                                        </span>
                                                        <label
                                                            className="flex items-center gap-1.5 shrink-0 min-h-11 pl-2 cursor-pointer"
                                                            onClick={(e) =>
                                                                e.stopPropagation()
                                                            }
                                                        >
                                                            <span className="text-xs text-muted-foreground">
                                                                Disable
                                                            </span>
                                                            <Checkbox
                                                                checked={
                                                                    isDisabled
                                                                }
                                                                aria-label={`Disable ${label}`}
                                                                onCheckedChange={(
                                                                    checked,
                                                                ) => {
                                                                    disabledStations.set(
                                                                        checked
                                                                            ? [
                                                                                  ...$disabledStations,
                                                                                  id,
                                                                              ]
                                                                            : $disabledStations.filter(
                                                                                  (
                                                                                      x,
                                                                                  ) =>
                                                                                      x !==
                                                                                      id,
                                                                              ),
                                                                    );
                                                                    setStations(
                                                                        [
                                                                            ...stations,
                                                                        ],
                                                                    );
                                                                }}
                                                                disabled={
                                                                    $isLoading
                                                                }
                                                            />
                                                        </label>
                                                    </CommandItem>
                                                );
                                            })}
                                        </CommandGroup>
                                    </CommandList>
                                </Command>
                            )}
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
            </SidebarContent>
        </Sidebar>
    );
};

function styleStations(
    circles: StationCircle[],
    style: string,
): FeatureCollection | Feature {
    switch (style) {
        case "no-display":
            return { type: "FeatureCollection", features: [] };

        case "no-overlap":
            return safeUnion(turf.featureCollection(circles));

        case "stations":
            return turf.featureCollection(circles.map((c) => c.properties));

        default:
            return turf.featureCollection(circles);
    }
}

async function selectionProcess(
    station: any,
    map: L.Map,
    stations: any[],
    showGeoJSON: (geoJSONData: any) => void,
    $questionFinishedMapData: any,
    $hidingRadius: number,
) {
    const bbox = turf.bbox(station);

    const bounds: [[number, number], [number, number]] = [
        [bbox[1], bbox[0]],
        [bbox[3], bbox[2]],
    ];

    let mapData: any = turf.featureCollection([
        safeUnion(
            turf.featureCollection([
                ...$questionFinishedMapData.features,
                turf.mask(station),
            ]),
        ),
    ]);

    for (const question of questions.get()) {
        if (planningModeEnabled.get() && question.data.drag) {
            continue;
        }

        if (
            (question.id === "measuring" || question.id === "matching") &&
            (question.data.type === "aquarium" ||
                question.data.type === "zoo" ||
                question.data.type === "theme_park" ||
                question.data.type === "peak" ||
                question.data.type === "museum" ||
                question.data.type === "hospital" ||
                question.data.type === "cinema" ||
                question.data.type === "library" ||
                question.data.type === "golf_course" ||
                question.data.type === "consulate" ||
                question.data.type === "park")
        ) {
            const nearestQuestion = await nearestToQuestion(question.data);

            let radius = 30;

            let instances: any = { features: [] };

            const nearestPoints = [];

            while (instances.features.length === 0) {
                instances = await findTentacleLocations(
                    {
                        lat: station.properties.geometry.coordinates[1],
                        lng: station.properties.geometry.coordinates[0],
                        radius: radius,
                        unit: "miles",
                        location: false,
                        locationType: question.data.type,
                        drag: false,
                        color: "black",
                        collapsed: false,
                        hidden: false,
                    },
                    "Finding matching locations to hiding zone...",
                );

                const distances: any[] = instances.features.map((x: any) => {
                    return {
                        distance: turf.distance(
                            turf.point(turf.getCoord(x)),
                            station.properties,
                            {
                                units: "miles",
                            },
                        ),
                        point: x,
                    };
                });

                if (distances.length === 0) {
                    radius += 30;
                    continue;
                }

                const minimumPoint = _.minBy(distances, "distance")!;

                if (minimumPoint.distance + $hidingRadius * 2 > radius) {
                    radius = minimumPoint.distance + $hidingRadius * 2;
                    continue;
                }

                nearestPoints.push(
                    ...distances
                        .filter(
                            (x) =>
                                x.distance <
                                    minimumPoint.distance + $hidingRadius * 2 &&
                                x.point.properties.name, // If it doesn't have a name, it's not a valid location
                        )
                        .map((x) => x.point),
                );
            }

            if (question.id === "matching") {
                const voronoi = geoSpatialVoronoi(
                    turf.featureCollection(nearestPoints),
                );

                const correctPolygon = voronoi.features.find((feature: any) => {
                    return (
                        feature.properties.site.properties.name ===
                        nearestQuestion.properties.name
                    );
                });

                if (!correctPolygon) {
                    if (question.data.same) {
                        mapData = BLANK_GEOJSON;
                    }

                    continue;
                }

                if (question.data.same) {
                    mapData = safeUnion(
                        turf.featureCollection([
                            ...mapData.features,
                            turf.mask(correctPolygon),
                        ]),
                    );
                } else {
                    mapData = safeUnion(
                        turf.featureCollection([
                            ...mapData.features,
                            correctPolygon,
                        ]),
                    );
                }
            } else {
                const circles = nearestPoints.map((x) =>
                    turf.circle(
                        turf.getCoord(x),
                        nearestQuestion.properties.distanceToPoint,
                    ),
                );

                if (question.data.hiderCloser) {
                    mapData = safeUnion(
                        turf.featureCollection([
                            ...mapData.features,
                            holedMask(turf.featureCollection(circles)),
                        ]),
                    );
                } else {
                    mapData = safeUnion(
                        turf.featureCollection([
                            ...mapData.features,
                            ...circles,
                        ]),
                    );
                }
            }
        }
        if (
            question.id === "measuring" &&
            question.data.type === "rail-measure"
        ) {
            const location = turf.point([question.data.lng, question.data.lat]);

            const nearestTrainStation = turf.nearestPoint(
                location,
                turf.featureCollection(
                    stations.map((x) => x.properties.geometry),
                ),
            );

            const distance = turf.distance(location, nearestTrainStation);

            const circles = stations
                .filter(
                    (x) =>
                        turf.distance(
                            station.properties.geometry,
                            x.properties.geometry,
                        ) <
                        distance + 1.61 * $hidingRadius,
                )
                .map((x) => turf.circle(x.properties.geometry, distance));

            if (question.data.hiderCloser) {
                mapData = safeUnion(
                    turf.featureCollection([
                        ...mapData.features,
                        holedMask(turf.featureCollection(circles)),
                    ]),
                );
            } else {
                mapData = safeUnion(
                    turf.featureCollection([...mapData.features, ...circles]),
                );
            }
        }
        if (
            question.id === "measuring" &&
            (question.data.type === "mcdonalds" ||
                question.data.type === "seven11")
        ) {
            const points = await findPlacesSpecificInZone(
                question.data.type === "mcdonalds"
                    ? QuestionSpecificLocation.McDonalds
                    : QuestionSpecificLocation.Seven11,
            );

            const seeker = turf.point([question.data.lng, question.data.lat]);
            const nearest = turf.nearestPoint(seeker, points as any);

            const distance = turf.distance(seeker, nearest, {
                units: "miles",
            });

            const filtered = points.features.filter(
                (x) =>
                    turf.distance(x as any, station.properties.geometry, {
                        units: "miles",
                    }) <
                    distance + $hidingRadius,
            );

            const circles = filtered.map((x) =>
                turf.circle(x as any, distance, {
                    units: "miles",
                }),
            );

            if (question.data.hiderCloser) {
                mapData = safeUnion(
                    turf.featureCollection([
                        ...mapData.features,
                        holedMask(turf.featureCollection(circles)),
                    ]),
                );
            } else {
                mapData = safeUnion(
                    turf.featureCollection([...mapData.features, ...circles]),
                );
            }
        }

        if (mapData.type !== "FeatureCollection") {
            mapData = {
                type: "FeatureCollection",
                features: [mapData],
            };
        }
    }

    if (_.isEqual(mapData, BLANK_GEOJSON)) {
        toast.warning(
            "The hider cannot be in this hiding zone. This wasn't eliminated on the sidebar as its absence was caused by multiple criteria.",
        );
    }

    showGeoJSON(mapData);

    if (autoZoom.get()) {
        if (animateMapMovements.get()) {
            map?.flyToBounds(bounds);
        } else {
            map?.fitBounds(bounds);
        }
    }

    const element: HTMLDivElement | null = document.querySelector(
        `[data-station-id="${station.properties.properties.id}"]`,
    );

    if (element) {
        element.scrollIntoView({
            behavior: "smooth",
            block: "center",
        });
        element.classList.add("selected-card-background-temporary");

        setTimeout(() => {
            element.classList.remove("selected-card-background-temporary");
        }, 5000);
    }
}
