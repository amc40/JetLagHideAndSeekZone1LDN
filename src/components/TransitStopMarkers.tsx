import { useStore } from "@nanostores/react";
import * as L from "leaflet";
import { useEffect, useRef, useState } from "react";

import { leafletMapContext, showTransitStops } from "@/lib/context";
import { getStationModesIcon, STATION_MODE_LABEL } from "@/lib/stationIcons";
import { fetchCuratedStations } from "@/maps/api";
import type { StationMode } from "@/maps/geo-utils";

type TransitStop = {
    id: string;
    name: string;
    lat: number;
    lng: number;
    modes: StationMode[];
};

function makeMarker(stop: TransitStop, zoom: number): L.Marker {
    const marker = L.marker([stop.lat, stop.lng], {
        icon: getStationModesIcon(stop.modes, zoom),
        zIndexOffset: 200,
    });

    const modeLabels = stop.modes
        .map((mode) => STATION_MODE_LABEL[mode])
        .join(", ");
    marker.bindTooltip(
        `<b>${stop.name}</b><br/>` +
            `<span style="font-size:11px">${modeLabels}</span>`,
        { direction: "top", offset: [0, -10] },
    );

    return marker;
}

export const TransitStopMarkers = () => {
    const map = useStore(leafletMapContext);
    const $showTransitStops = useStore(showTransitStops);
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
                const curated = await fetchCuratedStations();
                if (cancelled) return;

                const parsed: TransitStop[] = (curated.features ?? [])
                    .filter((f: any) => f.geometry?.type === "Point")
                    .map((f: any) => ({
                        id: f.properties?.id,
                        name: f.properties?.name ?? "Unknown Station",
                        lat: f.geometry.coordinates[1],
                        lng: f.geometry.coordinates[0],
                        modes: (f.properties?.modes ?? []) as StationMode[],
                    }));
                setStops(parsed);
            } catch (err) {
                if (!cancelled)
                    console.error("TransitStopMarkers: fetch error", err);
            }
        };

        fetchStops();
        return () => {
            cancelled = true;
        };
    }, []);

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
                ?.setIcon(getStationModesIcon(stop.modes, zoom));
        }
    }, [zoom, stops]);

    return null;
};
