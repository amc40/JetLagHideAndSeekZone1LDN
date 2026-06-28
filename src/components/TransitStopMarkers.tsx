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

// ─── TfL roundel ──────────────────────────────────────────────────────────────
// Red annulus built with fill-rule="evenodd" (two full-circle arcs), plus a
// blue bar whose left/right edges follow the circle boundary via SVG arcs.
// No <mask> or <clipPath> — avoids ID collisions when many markers exist.
//
// Circle: cx=12, cy=12, r=11.  Bar occupies y∈[9,15] (3 px above/below centre).
// Intersection of that band with the circle:  x = 12 ± √(11²−3²) ≈ 1.42 / 22.58
const TUBE_SVG = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="26" height="26" style="filter:drop-shadow(0 1px 2px rgba(0,0,0,.55))">
  <!-- red ring (annulus via even-odd) -->
  <path fill="#E32017" fill-rule="evenodd"
    d="M12,1 A11,11 0 0,1 12,23 A11,11 0 0,1 12,1 Z
       M12,6  A6,6   0 0,1 12,18 A6,6   0 0,1 12,6  Z"/>
  <!-- blue bar bounded by the circle arcs -->
  <path fill="#003087"
    d="M1.42,9 L22.58,9
       A11,11 0 0,1 22.58,15
       L1.42,15
       A11,11 0 0,1 1.42,9 Z"/>
  <!-- thin white outer border for legibility -->
  <circle cx="12" cy="12" r="11" fill="none" stroke="white" stroke-width="0.8"/>
</svg>`;

// ─── National Rail double-arrow ────────────────────────────────────────────────
// Two copies of the same right-pointing arrow, one rotated −45° (→ ↗) and one
// rotated 135° (→ ↙), combining to form the NR double-arrow symbol.
// White arrows on the standard NR dark-blue (#003466) background.
const RAIL_SVG = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="26" height="26" style="filter:drop-shadow(0 1px 2px rgba(0,0,0,.55))">
  <rect x="0" y="0" width="24" height="24" rx="4" fill="#003466" stroke="white" stroke-width="0.8"/>
  <!-- arrow pointing ↗ -->
  <path fill="white" transform="rotate(-45,12,12)"
    d="M5,11 L13,11 L13,8 L19,12 L13,16 L13,13 L5,13 Z"/>
  <!-- arrow pointing ↙ -->
  <path fill="white" transform="rotate(135,12,12)"
    d="M5,11 L13,11 L13,8 L19,12 L13,16 L13,13 L5,13 Z"/>
</svg>`;

function makeMarker(stop: TransitStop): L.Marker {
    const svg = stop.type === "tube" ? TUBE_SVG : RAIL_SVG;
    const label =
        stop.type === "tube" ? "London Underground" : "National Rail";
    const labelColour = stop.type === "tube" ? "#E32017" : "#003466";

    const icon = L.divIcon({
        html: svg,
        className: "",
        iconSize: [26, 26],
        iconAnchor: [13, 13],
    });

    const marker = L.marker([stop.lat, stop.lng], { icon, zIndexOffset: 200 });

    marker.bindTooltip(
        `<b>${stop.name}</b><br/>` +
            `<span style="color:${labelColour};font-size:11px">${label}</span>`,
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
