import { useStore } from "@nanostores/react";
import * as L from "leaflet";
import { useEffect, useRef, useState } from "react";

import {
    leafletMapContext,
    mapGeoLocation,
    showTransitStops,
} from "@/lib/context";
import {
    getStationModeIcon,
    STATION_MODE_COLOUR,
    STATION_MODE_LABEL,
} from "@/lib/stationIcons";
import { findPlacesInZone } from "@/maps/api";
import { classifyStationModes, type StationMode } from "@/maps/geo-utils";

type TransitStop = {
    id: string;
    name: string;
    lat: number;
    lng: number;
    mode: StationMode;
};

function makeMarker(stop: TransitStop, zoom: number): L.Marker {
    const icon = getStationModeIcon(stop.mode, zoom);
    const label = STATION_MODE_LABEL[stop.mode];
    const colour = STATION_MODE_COLOUR[stop.mode];

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

function parseElements(elements: OverpassElement[]): TransitStop[] {
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

        // A single node usually serves one mode; take the primary classification.
        const mode = classifyStationModes(el.tags)[0];

        stops.push({ id: `${el.type}/${el.id}`, name, lat, lng, mode });
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

                const tubeStops = parseElements(tubeData.elements ?? []);
                const railStops = parseElements(railData.elements ?? []);
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
            markersRef.current
                .get(stop.id)
                ?.setIcon(getStationModeIcon(stop.mode, zoom));
        }
    }, [zoom, stops]);

    return null;
};
