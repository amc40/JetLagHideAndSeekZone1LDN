import { useStore } from "@nanostores/react";
import * as L from "leaflet";
import { useEffect, useRef, useState } from "react";

import { leafletMapContext, mapOverlays } from "@/lib/context";
import {
    fetchCuratedAquariums,
    fetchCuratedCinemas,
    fetchCuratedConsulates,
    fetchCuratedHospitals,
    fetchCuratedLibraries,
    fetchCuratedMuseums,
    fetchCuratedParks,
} from "@/maps/api";

import {
    OVERLAY_CONFIG,
    type OverlayConfig,
    type OverlayKey,
} from "./overlayConfig";

type OverlayPlace = {
    id: string;
    name: string;
    lat: number;
    lng: number;
    type: string;
};

const CURATED_FETCHERS: Record<OverlayKey, () => Promise<any>> = {
    hospital: fetchCuratedHospitals,
    museum: fetchCuratedMuseums,
    aquarium: fetchCuratedAquariums,
    cinema: fetchCuratedCinemas,
    library: fetchCuratedLibraries,
    consulate: fetchCuratedConsulates,
    park: fetchCuratedParks,
};

function makeOverlayIcon(color: string, letter: string): L.DivIcon {
    const isTwo = letter.length === 2;
    const fontSize = isTwo ? 9 : 11;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 26 26" width="26" height="26" style="display:block;filter:drop-shadow(0 1px 2px rgba(0,0,0,.55))">
  <circle cx="13" cy="13" r="12" fill="${color}" stroke="white" stroke-width="2"/>
  <text x="13" y="${isTwo ? 17 : 18}" text-anchor="middle" font-size="${fontSize}" font-family="Arial,sans-serif" font-weight="bold" fill="white">${letter}</text>
</svg>`;
    return L.divIcon({
        html: svg,
        className: "",
        iconSize: [26, 26],
        iconAnchor: [13, 13],
    });
}

const OVERLAY_ICONS: Record<OverlayKey, L.DivIcon> = Object.fromEntries(
    (Object.entries(OVERLAY_CONFIG) as [OverlayKey, OverlayConfig][]).map(
        ([key, cfg]) => [key, makeOverlayIcon(cfg.color, cfg.letter)],
    ),
) as Record<OverlayKey, L.DivIcon>;

function parsePlaces(features: any[], type: string): OverlayPlace[] {
    const places: OverlayPlace[] = [];
    for (const f of features ?? []) {
        if (f.geometry?.type !== "Point") continue;
        const [lng, lat] = f.geometry.coordinates;
        if (typeof lat !== "number" || typeof lng !== "number") continue;
        places.push({
            id: f.properties?.id ?? `${type}|${lat}|${lng}`,
            name: f.properties?.name ?? "Unknown",
            lat,
            lng,
            type,
        });
    }
    return places;
}

export const MapOverlayMarkers = () => {
    const map = useStore(leafletMapContext);
    const $mapOverlays = useStore(mapOverlays);
    const [placesByType, setPlacesByType] = useState<
        Record<string, OverlayPlace[]>
    >({});
    const layerGroupsRef = useRef<Record<string, L.LayerGroup>>({});

    useEffect(() => {
        let cancelled = false;

        const fetchAll = async () => {
            const enabled = $mapOverlays as OverlayKey[];
            const results: Record<string, OverlayPlace[]> = {};

            await Promise.all(
                enabled.map(async (type) => {
                    const fetcher = CURATED_FETCHERS[type];
                    if (!fetcher) return;
                    try {
                        const curated = await fetcher();
                        if (!cancelled) {
                            results[type] = parsePlaces(
                                curated.features ?? [],
                                type,
                            );
                        }
                    } catch (err) {
                        if (!cancelled)
                            console.error(
                                `MapOverlayMarkers: failed to load curated ${type} data`,
                                err,
                            );
                    }
                }),
            );

            if (!cancelled) {
                setPlacesByType(results);
            }
        };

        fetchAll();
        return () => {
            cancelled = true;
        };
    }, [$mapOverlays]);

    useEffect(() => {
        if (!map) return;

        for (const group of Object.values(layerGroupsRef.current)) {
            group.remove();
        }
        layerGroupsRef.current = {};

        const enabled = $mapOverlays as OverlayKey[];

        for (const type of enabled) {
            const places = placesByType[type] ?? [];
            if (places.length === 0) continue;

            const icon = OVERLAY_ICONS[type];
            const cfg = OVERLAY_CONFIG[type];

            const group = L.layerGroup();
            for (const place of places) {
                const marker = L.marker([place.lat, place.lng], {
                    icon,
                    zIndexOffset: 100,
                });
                marker.bindTooltip(
                    `<b>${place.name}</b><br/><span style="color:${cfg.color};font-size:11px">${cfg.label}</span>`,
                    { direction: "top", offset: [0, -10] },
                );
                group.addLayer(marker);
            }

            group.addTo(map);
            layerGroupsRef.current[type] = group;
        }

        return () => {
            for (const group of Object.values(layerGroupsRef.current)) {
                group.remove();
            }
            layerGroupsRef.current = {};
        };
    }, [map, placesByType, $mapOverlays]);

    return null;
};
