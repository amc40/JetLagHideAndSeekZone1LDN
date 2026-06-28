import { useStore } from "@nanostores/react";
import * as L from "leaflet";
import { useEffect, useRef, useState } from "react";

import { leafletMapContext, mapGeoLocation, mapOverlays } from "@/lib/context";
import { findPlacesInZone } from "@/maps/api";

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

type OverpassElement = {
    type: string;
    id: number;
    lat?: number;
    lon?: number;
    center?: { lat: number; lon: number };
    tags?: Record<string, string>;
};

function parsePlaces(
    elements: OverpassElement[],
    type: string,
): OverlayPlace[] {
    const seen = new Set<string>();
    const places: OverlayPlace[] = [];
    for (const el of elements) {
        const lat = el.center ? el.center.lat : el.lat;
        const lng = el.center ? el.center.lon : el.lon;
        if (typeof lat !== "number" || typeof lng !== "number") continue;
        const name =
            el.tags?.["name:en"] || el.tags?.name || el.tags?.iata || "Unknown";
        const key = `${name}|${lat.toFixed(4)}|${lng.toFixed(4)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        places.push({ id: `${el.type}/${el.id}`, name, lat, lng, type });
    }
    return places;
}

export const MapOverlayMarkers = () => {
    const map = useStore(leafletMapContext);
    const $mapOverlays = useStore(mapOverlays);
    const $mapGeoLocation = useStore(mapGeoLocation);
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
                    const cfg = OVERLAY_CONFIG[type];
                    if (!cfg) return;
                    try {
                        const data = await findPlacesInZone(
                            cfg.filter,
                            `Loading ${cfg.label}...`,
                            cfg.searchType ?? "nwr",
                            "center",
                        );
                        if (!cancelled) {
                            results[type] = parsePlaces(
                                data.elements ?? [],
                                type,
                            );
                        }
                    } catch (err) {
                        if (!cancelled)
                            console.error(
                                `MapOverlayMarkers: failed to fetch ${type}`,
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
    }, [$mapOverlays, $mapGeoLocation]);

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
