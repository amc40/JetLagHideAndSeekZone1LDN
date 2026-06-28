import { useStore } from "@nanostores/react";
import { useEffect, useRef, useState } from "react";

import { leafletMapContext, mapGeoLocation, showTransitStops } from "@/lib/context";
import { findPlacesInZone } from "@/maps/api";

import * as L from "leaflet";

type TransitStop = {
    id: string;
    name: string;
    lat: number;
    lng: number;
    type: "tube" | "rail";
};

const TUBE_COLOR = "#E32017";   // TfL red
const RAIL_COLOR = "#003466";   // National Rail blue

function makeStopMarker(stop: TransitStop): L.CircleMarker {
    const color = stop.type === "tube" ? TUBE_COLOR : RAIL_COLOR;
    const radius = stop.type === "tube" ? 7 : 6;

    const marker = L.circleMarker([stop.lat, stop.lng], {
        radius,
        fillColor: color,
        color: "#ffffff",
        weight: 2,
        opacity: 1,
        fillOpacity: 0.9,
        // Ensure markers render above map tiles but below popups
        pane: "markerPane",
    });

    marker.bindTooltip(
        `<b>${stop.name}</b><br/><span style="color:${color};font-size:11px">${
            stop.type === "tube" ? "London Underground" : "National Rail"
        }</span>`,
        { direction: "top", offset: [0, -6] },
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

        const name =
            el.tags?.["name:en"] || el.tags?.name || "Unknown Station";

        // deduplicate by name + rounded coords
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

    // Fetch stops when the map region changes
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
                if (!cancelled) {
                    console.error("TransitStopMarkers: fetch error", err);
                }
            }
        };

        fetchStops();
        return () => {
            cancelled = true;
        };
    }, [$mapGeoLocation]);

    // Add / remove the layer group whenever stops or visibility changes
    useEffect(() => {
        if (!map) return;

        // Remove previous layer group
        if (layerGroupRef.current) {
            layerGroupRef.current.remove();
            layerGroupRef.current = null;
        }

        if (!$showTransitStops || stops.length === 0) return;

        const group = L.layerGroup();
        for (const stop of stops) {
            group.addLayer(makeStopMarker(stop));
        }

        layerGroupRef.current = group;
        group.addTo(map);

        return () => {
            group.remove();
            layerGroupRef.current = null;
        };
    }, [map, stops, $showTransitStops]);

    return null;
};
