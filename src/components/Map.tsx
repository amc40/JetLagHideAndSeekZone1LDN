import "leaflet/dist/leaflet.css";
import "leaflet-contextmenu/dist/leaflet.contextmenu.css";
import "leaflet-contextmenu";

import { useStore } from "@nanostores/react";
import * as turf from "@turf/turf";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import * as L from "leaflet";
import { useEffect, useMemo } from "react";
import { MapContainer, ScaleControl, TileLayer } from "react-leaflet";
import { toast } from "react-toastify";

import {
    addQuestion,
    animateMapMovements,
    autoZoom,
    baseTileLayer,
    debugLocationOverride,
    followMe,
    followMeLocation,
    hiderMode,
    hidingRadiusUnits,
    isLoading,
    leafletMapContext,
    mapGeoJSON,
    mapGeoLocation,
    movementAllowance,
    permanentOverlay,
    planningModeEnabled,
    polyGeoJSON,
    questionFinishedMapData,
    questions,
    thunderforestApiKey,
    triggerLocalRefresh,
} from "@/lib/context";
import { TFL_ZONE_1_POLYGON } from "@/lib/map-presets";
import { cn } from "@/lib/utils";
import {
    applyQuestionsToMapGeoData,
    applyQuestionsToMapGeoDataWithAllowance,
    holedMask,
    safeUnion,
} from "@/maps";
import { hiderifyQuestion } from "@/maps";
import {
    clearCache,
    fetchCoastline,
    fetchCuratedAquariums,
    fetchCuratedCinemas,
    fetchCuratedConsulates,
    fetchCuratedHighspeed,
    fetchCuratedHospitals,
    fetchCuratedLibraries,
    fetchCuratedMuseums,
    fetchCuratedParks,
    fetchCuratedStations,
    fetchLondonBoroughs,
    fetchThamesLine,
} from "@/maps/api";
import { loadGrid as loadElevationGrid } from "@/maps/geo-utils";

import { DraggableMarkers } from "./DraggableMarkers";
import { ElevationOverlay } from "./ElevationOverlay";
import { MapOverlayMarkers } from "./MapOverlayMarkers";
import { TransitStopMarkers } from "./TransitStopMarkers";

const getTileLayer = (tileLayer: string, thunderforestApiKey: string) => {
    switch (tileLayer) {
        case "light":
            return (
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors; &copy; <a href="https://carto.com/attributions">CARTO</a>; Powered by Esri and Turf.js; Borough boundaries &copy; <a href="https://data.london.gov.uk/dataset/statistical-gis-boundary-files-london">GLA</a>; river data: <a href="https://www.ordnancesurvey.co.uk/products/os-open-rivers">OS Open Rivers</a>; elevation data: OS Terrain 50; contains OS data &copy; Crown copyright and database right, <a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/">OGL v3</a>'
                    url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                    subdomains="abcd"
                    maxZoom={20} // This technically should be 6, but once the ratelimiting starts this can take over
                    minZoom={2}
                    noWrap
                />
            );

        case "dark":
            return (
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors; &copy; <a href="https://carto.com/attributions">CARTO</a>; Powered by Esri and Turf.js; Borough boundaries &copy; <a href="https://data.london.gov.uk/dataset/statistical-gis-boundary-files-london">GLA</a>; river data: <a href="https://www.ordnancesurvey.co.uk/products/os-open-rivers">OS Open Rivers</a>; elevation data: OS Terrain 50; contains OS data &copy; Crown copyright and database right, <a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/">OGL v3</a>'
                    url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                    subdomains="abcd"
                    maxZoom={20} // This technically should be 6, but once the ratelimiting starts this can take over
                    minZoom={2}
                    noWrap
                />
            );

        case "transport":
            if (thunderforestApiKey)
                return (
                    <TileLayer
                        url={`https://tile.thunderforest.com/transport/{z}/{x}/{y}.png?apikey=${thunderforestApiKey}`}
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors; &copy; <a href="http://www.thunderforest.com/">Thunderforest</a>; Powered by Esri and Turf.js; Borough boundaries &copy; <a href="https://data.london.gov.uk/dataset/statistical-gis-boundary-files-london">GLA</a>; river data: <a href="https://www.ordnancesurvey.co.uk/products/os-open-rivers">OS Open Rivers</a>; elevation data: OS Terrain 50; contains OS data &copy; Crown copyright and database right, <a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/">OGL v3</a>'
                        maxZoom={22}
                        minZoom={2}
                        noWrap
                    />
                );
            break;

        case "neighbourhood":
            if (thunderforestApiKey)
                return (
                    <TileLayer
                        url={`https://tile.thunderforest.com/neighbourhood/{z}/{x}/{y}.png?apikey=${thunderforestApiKey}`}
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors; &copy; <a href="http://www.thunderforest.com/">Thunderforest</a>; Powered by Esri and Turf.js; Borough boundaries &copy; <a href="https://data.london.gov.uk/dataset/statistical-gis-boundary-files-london">GLA</a>; river data: <a href="https://www.ordnancesurvey.co.uk/products/os-open-rivers">OS Open Rivers</a>; elevation data: OS Terrain 50; contains OS data &copy; Crown copyright and database right, <a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/">OGL v3</a>'
                        maxZoom={22}
                        minZoom={2}
                        noWrap
                    />
                );
            break;

        case "osmcarto":
            return (
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors; Powered by Esri and Turf.js; Borough boundaries &copy; <a href="https://data.london.gov.uk/dataset/statistical-gis-boundary-files-london">GLA</a>; river data: <a href="https://www.ordnancesurvey.co.uk/products/os-open-rivers">OS Open Rivers</a>; elevation data: OS Terrain 50; contains OS data &copy; Crown copyright and database right, <a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/">OGL v3</a>'
                    url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                    maxZoom={19}
                    minZoom={2}
                    noWrap
                />
            );
    }

    return (
        <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors; &copy; <a href="https://carto.com/attributions">CARTO</a>; Powered by Esri and Turf.js; Borough boundaries &copy; <a href="https://data.london.gov.uk/dataset/statistical-gis-boundary-files-london">GLA</a>; river data: <a href="https://www.ordnancesurvey.co.uk/products/os-open-rivers">OS Open Rivers</a>; elevation data: OS Terrain 50; contains OS data &copy; Crown copyright and database right, <a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/">OGL v3</a>'
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            subdomains="abcd"
            maxZoom={20} // This technically should be 6, but once the ratelimiting starts this can take over
            minZoom={2}
            noWrap
        />
    );
};

export const Map = ({ className }: { className?: string }) => {
    const $mapGeoLocation = useStore(mapGeoLocation);
    const $questions = useStore(questions);
    const $baseTileLayer = useStore(baseTileLayer);
    const $thunderforestApiKey = useStore(thunderforestApiKey);
    const $hiderMode = useStore(hiderMode);
    const $isLoading = useStore(isLoading);
    const $followMe = useStore(followMe);
    const $debugLocationOverride = useStore(debugLocationOverride);
    const $permanentOverlay = useStore(permanentOverlay);
    const map = useStore(leafletMapContext);

    const followMeMarkerRef = useMemo(
        () => ({ current: null as L.Marker | null }),
        [],
    );
    const geoWatchIdRef = useMemo(
        () => ({ current: null as number | null }),
        [],
    );

    // Warm the permanent cache for every bundled curated dataset on mount so
    // they're all available offline immediately, rather than only once a
    // question/overlay that happens to need that particular dataset is used.
    useEffect(() => {
        for (const fetcher of [
            fetchCoastline,
            fetchLondonBoroughs,
            fetchThamesLine,
            fetchCuratedStations,
            fetchCuratedHospitals,
            fetchCuratedParks,
            fetchCuratedCinemas,
            fetchCuratedHighspeed,
            fetchCuratedConsulates,
            fetchCuratedAquariums,
            fetchCuratedLibraries,
            fetchCuratedMuseums,
            loadElevationGrid,
        ]) {
            fetcher().catch((err) =>
                console.error("Failed to preload curated data", err),
            );
        }
    }, []);

    const refreshQuestions = async (focus: boolean = false) => {
        if (!map) return;

        if ($isLoading) return;

        isLoading.set(true);

        try {
            if ($questions.length === 0) {
                await clearCache();
            }

            let mapGeoData = mapGeoJSON.get();

            if (!mapGeoData) {
                const polyGeoData = polyGeoJSON.get() ?? TFL_ZONE_1_POLYGON;
                mapGeoData = polyGeoData;
                mapGeoJSON.set(polyGeoData);
            }

            if ($hiderMode !== false) {
                for (const question of $questions) {
                    await hiderifyQuestion(question);
                }

                triggerLocalRefresh.set(Math.random()); // Refresh the question sidebar with new information but not this map
            }

            map.eachLayer((layer: any) => {
                if (layer.questionKey || layer.questionKey === 0) {
                    map.removeLayer(layer);
                }
            });

            const playAreaBoundary = structuredClone(mapGeoData);
            const playArea = structuredClone(mapGeoData);

            const strictGeoData = await applyQuestionsToMapGeoData(
                $questions,
                mapGeoData,
                planningModeEnabled.get(),
                (geoJSONObj, question) => {
                    const geoJSONPlane = L.geoJSON(geoJSONObj);
                    // @ts-expect-error This is a check such that only this type of layer is removed
                    geoJSONPlane.questionKey = question.key;
                    geoJSONPlane.addTo(map);
                },
            );

            // The hider can move within their hiding zone, so an answer only
            // truly eliminates the area beyond that reach. Anything between the
            // two is shaded lighter: ruled out only if the hider never moved.
            const allowance = movementAllowance.get();
            let relaxedGeoData = strictGeoData;

            if (allowance > 0 && $questions.length > 0) {
                try {
                    relaxedGeoData =
                        (await applyQuestionsToMapGeoDataWithAllowance(
                            $questions,
                            playArea,
                            allowance,
                            hidingRadiusUnits.get(),
                            planningModeEnabled.get(),
                        )) ?? strictGeoData;
                } catch (error) {
                    console.log("Movement allowance calculation failed", error);
                    relaxedGeoData = strictGeoData;
                }
            }

            const toMask = (
                surviving: any,
            ): FeatureCollection<Polygon | MultiPolygon> => ({
                type: "FeatureCollection",
                features: [holedMask(surviving!)!],
            });

            const strictMask = toMask(strictGeoData);
            const eliminationMask =
                relaxedGeoData === strictGeoData
                    ? strictMask
                    : toMask(relaxedGeoData);

            const allowanceBand =
                relaxedGeoData === strictGeoData
                    ? null
                    : turf.difference(
                          turf.featureCollection([
                              safeUnion(relaxedGeoData) as any,
                              safeUnion(strictGeoData) as any,
                          ]),
                      );

            map.eachLayer((layer: any) => {
                if (
                    layer.eliminationGeoJSON ||
                    layer.movementAllowanceGeoJSON ||
                    layer.playAreaBoundaryGeoJSON
                ) {
                    // Hopefully only geoJSON layers
                    map.removeLayer(layer);
                }
            });

            const g = L.geoJSON(eliminationMask, {
                style: {
                    stroke: false,
                    fillColor: "#1e293b",
                    fillOpacity: 0.55,
                },
            });
            // @ts-expect-error This is a check such that only this type of layer is removed
            g.eliminationGeoJSON = true;
            g.addTo(map);

            if (allowanceBand) {
                const band = L.geoJSON(allowanceBand, {
                    style: {
                        stroke: false,
                        fillColor: "#1e293b",
                        fillOpacity: 0.22,
                    },
                });
                // @ts-expect-error This is a check such that only this type of layer is removed
                band.movementAllowanceGeoJSON = true;
                band.addTo(map);
            }

            // Outline of the original play area, drawn on top of the
            // elimination mask so it stays visually distinct from the
            // (unstroked) impossible-zone fill above.
            const boundary = L.geoJSON(playAreaBoundary, {
                style: {
                    fill: false,
                    color: "#facc15",
                    weight: 3,
                    dashArray: "8 6",
                    opacity: 0.9,
                },
            });
            // @ts-expect-error This is a check such that only this type of layer is removed
            boundary.playAreaBoundaryGeoJSON = true;
            boundary.addTo(map);

            // Hiding-zone filtering downstream stays on the strict area; the
            // allowance is a display aid, not a change to which zones survive.
            questionFinishedMapData.set(strictMask);

            if (autoZoom.get() && focus) {
                // Frame the relaxed area so the allowance band isn't cropped.
                const bbox = turf.bbox(relaxedGeoData as any);
                const bounds = [
                    [bbox[1], bbox[0]],
                    [bbox[3], bbox[2]],
                ];

                if (animateMapMovements.get()) {
                    map.flyToBounds(bounds as any);
                } else {
                    map.fitBounds(bounds as any);
                }
            }
        } catch (error) {
            console.log(error);

            if (document.querySelectorAll(".Toastify__toast").length === 0) {
                return toast.error("No solutions found / error occurred");
            }
        } finally {
            isLoading.set(false);
        }
    };

    const displayMap = useMemo(
        () => (
            <MapContainer
                center={$mapGeoLocation.geometry.coordinates}
                zoom={11}
                className={cn("w-[500px] h-[500px]", className)}
                ref={leafletMapContext.set}
                // @ts-expect-error Typing doesn't update from react-contextmenu
                contextmenu={true}
                contextmenuWidth={170}
                contextmenuItems={[
                    {
                        text: "Add Radius",
                        callback: (e: any) =>
                            addQuestion({
                                id: "radius",
                                data: {
                                    lat: e.latlng.lat,
                                    lng: e.latlng.lng,
                                },
                            }),
                    },
                    {
                        text: "Add Thermometer",
                        callback: (e: any) => {
                            const destination = turf.destination(
                                [e.latlng.lng, e.latlng.lat],
                                5,
                                90,
                                {
                                    units: "miles",
                                },
                            );

                            addQuestion({
                                id: "thermometer",
                                data: {
                                    latA: e.latlng.lat,
                                    lngA: e.latlng.lng,
                                    latB: destination.geometry.coordinates[1],
                                    lngB: destination.geometry.coordinates[0],
                                },
                            });
                        },
                    },
                    {
                        text: "Add Matching",
                        callback: (e: any) => {
                            addQuestion({
                                id: "matching",
                                data: {
                                    lat: e.latlng.lat,
                                    lng: e.latlng.lng,
                                },
                            });
                        },
                    },
                    {
                        text: "Add Measuring",
                        callback: (e: any) => {
                            addQuestion({
                                id: "measuring",
                                data: {
                                    lat: e.latlng.lat,
                                    lng: e.latlng.lng,
                                },
                            });
                        },
                    },
                    {
                        text: "Set Debug Location",
                        callback: (e: any) => {
                            debugLocationOverride.set({
                                latitude: e.latlng.lat,
                                longitude: e.latlng.lng,
                            });
                            toast.info(
                                "Debug location set — the app will treat this as your GPS position",
                                { autoClose: 2500 },
                            );
                        },
                    },
                    {
                        text: "Copy Coordinates",
                        callback: (e: any) => {
                            if (!navigator || !navigator.clipboard) {
                                toast.error(
                                    "Clipboard API not supported in your browser",
                                );
                                return;
                            }

                            const latitude = e.latlng.lat;
                            const longitude = e.latlng.lng;

                            toast.promise(
                                navigator.clipboard.writeText(
                                    `${Math.abs(latitude)}°${latitude > 0 ? "N" : "S"}, ${Math.abs(
                                        longitude,
                                    )}°${longitude > 0 ? "E" : "W"}`,
                                ),
                                {
                                    pending: "Writing to clipboard...",
                                    success: "Coordinates copied!",
                                    error: "An error occurred while copying",
                                },
                                { autoClose: 1000 },
                            );
                        },
                    },
                ]}
            >
                {getTileLayer($baseTileLayer, $thunderforestApiKey)}
                <ElevationOverlay />
                <TransitStopMarkers />
                <MapOverlayMarkers />
                <DraggableMarkers />
                <ScaleControl position="bottomleft" />
            </MapContainer>
        ),
        [map, $baseTileLayer, $thunderforestApiKey],
    );

    useEffect(() => {
        if (!map) return;

        refreshQuestions(true);
    }, [$questions, map, $hiderMode]);

    useEffect(() => {
        const intervalId = setInterval(async () => {
            if (!map) return;
            let layerCount = 0;
            map.eachLayer((layer: any) => {
                if (layer.eliminationGeoJSON) {
                    // Hopefully only geoJSON layers
                    layerCount++;
                }
            });
            if (layerCount > 1) {
                console.log("Too many layers, refreshing...");
                refreshQuestions(false);
            }
        }, 1000);

        return () => clearInterval(intervalId);
    }, [map]);

    useEffect(() => {
        const handleFullscreenChange = () => {
            const mainElement: HTMLElement | null =
                document.querySelector("main");

            if (mainElement) {
                if (document.fullscreenElement) {
                    mainElement.classList.add("fullscreen");
                } else {
                    mainElement.classList.remove("fullscreen");
                }
            }
        };

        document.addEventListener("fullscreenchange", handleFullscreenChange);

        return () => {
            document.removeEventListener(
                "fullscreenchange",
                handleFullscreenChange,
            );
        };
    }, []);

    useEffect(() => {
        if (!map) return;
        // A debug location override stands in for the device's real position,
        // so don't start (or keep) a GPS watch that would fight with it — the
        // draggable debug marker is drawn by DraggableMarkers instead.
        if (!$followMe || $debugLocationOverride !== false) {
            followMeLocation.set(null);
            if (followMeMarkerRef.current) {
                map.removeLayer(followMeMarkerRef.current);
                followMeMarkerRef.current = null;
            }
            if (geoWatchIdRef.current !== null) {
                navigator.geolocation.clearWatch(geoWatchIdRef.current);
                geoWatchIdRef.current = null;
            }
            return;
        }

        geoWatchIdRef.current = navigator.geolocation.watchPosition(
            (pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                if (followMeMarkerRef.current) {
                    followMeMarkerRef.current.setLatLng([lat, lng]);
                } else {
                    const marker = L.marker([lat, lng], {
                        icon: L.divIcon({
                            html: `<div class="text-blue-700 bg-white rounded-full border-2 border-blue-700 shadow w-5 h-5 flex items-center justify-center"><svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="#2A81CB" opacity="0.5"/><circle cx="8" cy="8" r="3" fill="#2A81CB"/></svg></div>`,
                            className: "",
                        }),
                        zIndexOffset: 1000,
                    });
                    marker.addTo(map);
                    followMeMarkerRef.current = marker;
                }

                followMeLocation.set({ latitude: lat, longitude: lng });
            },
            () => {
                toast.error("Unable to access your location.");
                followMe.set(false);
            },
            { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
        );
        return () => {
            followMeLocation.set(null);
            if (followMeMarkerRef.current) {
                map.removeLayer(followMeMarkerRef.current);
                followMeMarkerRef.current = null;
            }
            if (geoWatchIdRef.current !== null) {
                navigator.geolocation.clearWatch(geoWatchIdRef.current);
                geoWatchIdRef.current = null;
            }
        };
    }, [$followMe, $debugLocationOverride, map]);

    useEffect(() => {
        if (!map) return;

        map.eachLayer((layer: any) => {
            if (layer.permanentGeoJSON) map.removeLayer(layer);
        });

        if ($permanentOverlay === null) return;

        try {
            const overlay = L.geoJSON($permanentOverlay, {
                interactive: false,

                // @ts-expect-error Type hints force a Layer to be returned, but Leaflet accepts null as well
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                pointToLayer(geoJsonPoint, latlng) {
                    return null;
                },

                style(feature) {
                    return {
                        color: feature?.properties?.stroke,
                        weight: feature?.properties?.["stroke-width"],
                        opacity: feature?.properties?.["stroke-opacity"],
                        fillColor: feature?.properties?.fill,
                        fillOpacity: feature?.properties?.["fill-opacity"],
                    };
                },
            });
            // @ts-expect-error This is a check such that only this type of layer is removed
            overlay.permanentGeoJSON = true;
            overlay.addTo(map);
            overlay.bringToBack();
        } catch (e) {
            toast.error(`Failed to display GeoJSON overlay: ${e}`);
        }
    }, [$permanentOverlay, map]);

    return displayMap;
};
