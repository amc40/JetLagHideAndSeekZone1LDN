import { useStore } from "@nanostores/react";
import * as L from "leaflet";
import { useEffect, useRef, useState } from "react";

import { leafletMapContext, mapGeoLocation, showTransitStops } from "@/lib/context";
import { findPlacesInZone } from "@/maps/api";

type TransitStop = {
    id: string;
    name: string;
    lat: number;
    lng: number;
    type: "tube" | "rail";
};

// Resolved at runtime so the Astro base path is included (same pattern used
// for /coastline50.geojson elsewhere in the codebase).
const BASE = import.meta.env.BASE_URL;
const TUBE_ICON_URL = `${BASE}tube-roundel.svg`;
const RAIL_ICON_URL = `${BASE}national-rail.svg`;

function makeIcon(url: string): L.DivIcon {
    return L.divIcon({
        html: `<img src="${url}" width="26" height="26" style="display:block;filter:drop-shadow(0 1px 2px rgba(0,0,0,.55))"/>`,
        className: "",
        iconSize: [26, 26],
        iconAnchor: [13, 13],
    });
}

const TUBE_ICON = makeIcon(TUBE_ICON_URL);
const RAIL_ICON = makeIcon(RAIL_ICON_URL);

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

function parseElements(elements: any[], type: "tube" | "rail"): TransitStop[] {
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

                const tubeStops = parseElements(tubeData.elements ?? [], "tube");
                const railStops = parseElements(railData.elements ?? [], "rail");
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
