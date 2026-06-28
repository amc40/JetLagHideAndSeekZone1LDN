import { useStore } from "@nanostores/react";
import * as L from "leaflet";
import { useEffect, useRef, useState } from "react";

import {
    leafletMapContext,
    mapGeoLocation,
    showTransitStops,
} from "@/lib/context";
import { findPlacesInZone } from "@/maps/api";

type TransitStop = {
    id: string;
    name: string;
    lat: number;
    lng: number;
    type: "tube" | "rail";
};

const TUBE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="26" height="26" style="display:block;filter:drop-shadow(0 1px 2px rgba(0,0,0,.55))">
  <rect x="6" y="36" width="88" height="28" fill="#003087"/>
  <path fill-rule="evenodd" fill="#E32017" d="M4,50 A46,46 0 1,0 96,50 A46,46 0 1,0 4,50 Z M24,50 A26,26 0 1,0 76,50 A26,26 0 1,0 24,50 Z"/>
  <circle cx="50" cy="50" r="46" fill="none" stroke="white" stroke-width="3"/>
</svg>`;

const RAIL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="26" height="26" style="display:block;filter:drop-shadow(0 1px 2px rgba(0,0,0,.55))">
  <rect x="0" y="0" width="100" height="100" rx="18" ry="18" fill="#003466" stroke="white" stroke-width="3"/>
  <path fill="white" transform="rotate(-45,50,50)" d="M18,44 L56,44 L56,30 L84,50 L56,70 L56,56 L18,56 Z"/>
  <path fill="white" transform="rotate(135,50,50)" d="M18,44 L56,44 L56,30 L84,50 L56,70 L56,56 L18,56 Z"/>
</svg>`;

function makeIcon(svg: string): L.DivIcon {
    return L.divIcon({
        html: svg,
        className: "",
        iconSize: [26, 26],
        iconAnchor: [13, 13],
    });
}

const TUBE_ICON = makeIcon(TUBE_SVG);
const RAIL_ICON = makeIcon(RAIL_SVG);

function makeMarker(stop: TransitStop): L.Marker {
    const icon = stop.type === "tube" ? TUBE_ICON : RAIL_ICON;
    const label = stop.type === "tube" ? "London Underground" : "National Rail";
    const colour = stop.type === "tube" ? "#E32017" : "#003466";

    const marker = L.marker([stop.lat, stop.lng], { icon, zIndexOffset: 200 });

    marker.bindTooltip(
        `<b>${stop.name}</b><br/>` +
            `<span style="color:${colour};font-size:11px">${label}</span>`,
        { direction: "top", offset: [0, -10] },
    );

    return marker;
}

type OverpassElement = {
    type: string;
    id: number;
    lat?: number;
    lon?: number;
    center?: { lat: number; lon: number };
    tags?: Record<string, string>;
};

function parseElements(
    elements: OverpassElement[],
    type: "tube" | "rail",
): TransitStop[] {
    const seen = new Set<string>();
    const stops: TransitStop[] = [];

    for (const el of elements) {
        const lat = el.center ? el.center.lat : el.lat;
        const lng = el.center ? el.center.lon : el.lon;
        if (typeof lat !== "number" || typeof lng !== "number") continue;

        const name = el.tags?.["name:en"] || el.tags?.name || "Unknown Station";
        const key = `${name}|${lat.toFixed(4)}|${lng.toFixed(4)}`;
        if (seen.has(key)) continue;
        seen.add(key);

        stops.push({ id: `${el.type}/${el.id}`, name, lat, lng, type });
    }

    return stops;
}

export const TransitStopMarkers = () => {
    const map = useStore(leafletMapContext);
    const $showTransitStops = useStore(showTransitStops);
    const $mapGeoLocation = useStore(mapGeoLocation);
    const [stops, setStops] = useState<TransitStop[]>([]);
    const layerGroupRef = useRef<L.LayerGroup | null>(null);

    useEffect(() => {
        let cancelled = false;

        const fetchStops = async () => {
            try {
                const [tubeData, railData] = await Promise.all([
                    findPlacesInZone(
                        "[railway=station][subway=yes]",
                        "Loading tube stations...",
                        "nwr",
                        "center",
                    ),
                    findPlacesInZone(
                        "[railway=station][subway!=yes]",
                        "Loading national rail stations...",
                        "nwr",
                        "center",
                    ),
                ]);

                if (cancelled) return;

                const tubeStops = parseElements(
                    tubeData.elements ?? [],
                    "tube",
                );
                const railStops = parseElements(
                    railData.elements ?? [],
                    "rail",
                );
                setStops([...tubeStops, ...railStops]);
            } catch (err) {
                if (!cancelled)
                    console.error("TransitStopMarkers: fetch error", err);
            }
        };

        fetchStops();
        return () => {
            cancelled = true;
        };
    }, [$mapGeoLocation]);

    useEffect(() => {
        if (!map) return;

        if (layerGroupRef.current) {
            layerGroupRef.current.remove();
            layerGroupRef.current = null;
        }

        if (!$showTransitStops || stops.length === 0) return;

        const group = L.layerGroup();
        for (const stop of stops) group.addLayer(makeMarker(stop));

        layerGroupRef.current = group;
        group.addTo(map);

        return () => {
            group.remove();
            layerGroupRef.current = null;
        };
    }, [map, stops, $showTransitStops]);

    return null;
};
