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

// Official London Underground roundel, from
// https://commons.wikimedia.org/wiki/File:Underground.svg (public domain)
const TUBE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 615.3 500" width="32" height="26" style="display:block;filter:drop-shadow(0 1px 2px rgba(0,0,0,.55))">
  <path d="m469.5 250c0 89.1-72.3 161.3-161.3 161.3-89.1 0-161.3-72.2-161.3-161.3s72.1-161.3 161.2-161.3 161.4 72.2 161.4 161.3m-161.4-250c-138.1 0-250 111.9-250 250s111.9 250 250 250 250-111.9 250-250-111.9-250-250-250" fill="#e1251f" fill-rule="nonzero"/>
  <rect y="199.5" width="615.3" height="101.1" fill="#000f9f"/>
  <g fill="#fff" fill-rule="nonzero">
    <path d="m71.9 268.6c-4.2 5.2-10.5 8.5-18.3 8.5s-14-3.2-18.4-8.6c-3.4-4.1-4.9-9-4.9-16v-28.5h10.2v28.6c0 8.9 5.1 14.7 13.1 14.7 8.2 0 13.2-5.9 13.2-14.7v-28.6h10.1v28.2c0 7.2-1.3 11.9-5 16.4"/>
    <path d="m122.6 276.1-27.7-35.9v35.9h-10.2v-52.1h10.2l27.7 36.1v-36.1h10.2v52.1z"/>
    <path d="m155.4 276.1h-14.5v-52.1h17.8c18 0 27.7 11.9 27.7 25.4-0.1 14-10.3 26.7-31 26.7m1.4-43.3h-5.8v34.2h5c12.1 0 20.1-6.8 20.1-17.2-0.1-10.5-7.3-17-19.3-17"/>
    <path d="m192.7 276.1v-52.1h32.3v9.1h-22.2v10.8h18.3v9.2h-18.3v13.7h24.1v9.3z"/>
    <path d="m261.6 276.1-14.4-20.8h-4.7v20.8h-10.1v-52.1h16.9c10.7 0 17.7 5.6 17.7 15.2 0 6.4-3.6 11.5-9.8 13.7l16.4 23.1h-12zm-13.2-43.3h-5.8v13.7h4.8c5.9 0 9.4-2.6 9.4-7.2 0.1-4-3.1-6.5-8.4-6.5"/>
    <path d="m301.4 277.1c-16.3 0-28.3-11.4-28.3-27.1 0-15.3 12-27 28.2-27 6.1 0 12.3 1.6 18.1 4.6v10.6c-4.9-3.5-11.2-5.9-17.4-5.9-11.3 0-18.6 8.1-18.6 17.9 0 10 7.4 17.8 18.3 17.8 2.7 0 5.3-0.2 8-1.2v-11.2h-8.5v-8.9h18.7v24.8c-6.3 3.8-11.8 5.6-18.5 5.6"/>
    <path d="m356.8 276.1-14.4-20.8h-4.7v20.8h-10.1v-52.1h16.9c10.7 0 17.7 5.6 17.7 15.2 0 6.4-3.6 11.5-9.8 13.7l16.4 23.1h-12zm-13.3-43.3h-5.8v13.7h4.8c5.9 0 9.4-2.6 9.4-7.2 0.1-4-3.1-6.5-8.4-6.5"/>
    <path d="m395.5 277.1c-15 0-27.3-11.3-27.3-27.1 0-15.7 12.4-27 27.3-27s27.3 11.3 27.3 27.1c0.1 15.7-12.4 27-27.3 27m0-44.1c-9.8 0-17 7.4-17 17.1 0 9.6 7.2 17 17 17s17-7.4 17-17c0.1-9.7-7.2-17.1-17-17.1"/>
    <path d="m470.5 268.6c-4.2 5.2-10.5 8.5-18.3 8.5s-14-3.2-18.4-8.6c-3.4-4.1-4.9-9-4.9-16v-28.5h10.1v28.6c0 8.9 5.2 14.7 13.1 14.7 8.2 0 13.2-5.9 13.2-14.7v-28.6h10.1v28.2c0.1 7.2-1.2 11.9-4.9 16.4"/>
    <path d="m521.3 276.1-27.8-35.9v35.9h-10.2v-52.1h10.2l27.8 36.1v-36.1h10.1v52.1z"/>
    <path d="m554 276.1h-14.5v-52.1h17.8c18 0 27.7 11.9 27.7 25.4 0 14-10.3 26.7-31 26.7m1.5-43.3h-5.9v34.2h5c12.1 0 20.1-6.8 20.1-17.2 0-10.5-7.3-17-19.2-17"/>
  </g>
</svg>`;

// Official National Rail double-arrow logo, from
// https://commons.wikimedia.org/wiki/File:National_Rail_logo.svg (public domain)
const RAIL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 62 39" width="34" height="22" style="display:block;overflow:hidden;filter:drop-shadow(0 1px 2px rgba(0,0,0,.55))">
  <rect width="62" height="39" rx="6" ry="6" fill="white"/>
  <g stroke="#ED1C24" fill="none">
    <path d="M1,-8.9 46,12.4 16,26.6 61,47.9" stroke-width="6"/>
    <path d="M0,12.4H62m0,14.2H0" stroke-width="6.4"/>
  </g>
</svg>`;

function makeIcon(
    svg: string,
    iconSize: [number, number],
    iconAnchor: [number, number],
): L.DivIcon {
    return L.divIcon({
        html: svg,
        className: "",
        iconSize,
        iconAnchor,
    });
}

const BASE_TUBE_SIZE: [number, number] = [32, 26];
const BASE_RAIL_SIZE: [number, number] = [34, 22];

// Full size is only used from this zoom level upward - below it icons shrink
// in proportion to the map scale so they stop overlapping when zoomed out.
const ICON_FULL_SIZE_ZOOM = 15;
// Icons never shrink past this fraction of full size, so they stay visible
// and tappable even when the whole zone is in view.
const ICON_MIN_SCALE = 0.35;

function getIconScale(zoom: number): number {
    const scale = Math.pow(2, zoom - ICON_FULL_SIZE_ZOOM);
    return Math.min(1, Math.max(ICON_MIN_SCALE, scale));
}

const iconCache = new Map<string, L.DivIcon>();

function getIcon(type: "tube" | "rail", zoom: number): L.DivIcon {
    const scale = getIconScale(zoom);
    const key = `${type}:${scale.toFixed(3)}`;
    const cached = iconCache.get(key);
    if (cached) return cached;

    const [baseWidth, baseHeight] =
        type === "tube" ? BASE_TUBE_SIZE : BASE_RAIL_SIZE;
    const width = baseWidth * scale;
    const height = baseHeight * scale;
    const svg = type === "tube" ? TUBE_SVG : RAIL_SVG;

    const icon = makeIcon(svg, [width, height], [width / 2, height / 2]);
    iconCache.set(key, icon);
    return icon;
}

function makeMarker(stop: TransitStop, zoom: number): L.Marker {
    const icon = getIcon(stop.type, zoom);
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
    const [zoom, setZoom] = useState<number>(() => map?.getZoom() ?? 5);
    const layerGroupRef = useRef<L.LayerGroup | null>(null);
    const markersRef = useRef<Map<string, L.Marker>>(new Map());

    useEffect(() => {
        if (!map) return;

        setZoom(map.getZoom());
        const onZoom = () => setZoom(map.getZoom());
        map.on("zoomend", onZoom);
        return () => {
            map.off("zoomend", onZoom);
        };
    }, [map]);

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
        markersRef.current.clear();

        if (!$showTransitStops || stops.length === 0) return;

        const group = L.layerGroup();
        for (const stop of stops) {
            const marker = makeMarker(stop, map.getZoom());
            markersRef.current.set(stop.id, marker);
            group.addLayer(marker);
        }

        layerGroupRef.current = group;
        group.addTo(map);

        return () => {
            group.remove();
            layerGroupRef.current = null;
            markersRef.current.clear();
        };
    }, [map, stops, $showTransitStops]);

    useEffect(() => {
        for (const stop of stops) {
            markersRef.current.get(stop.id)?.setIcon(getIcon(stop.type, zoom));
        }
    }, [zoom, stops]);

    return null;
};
