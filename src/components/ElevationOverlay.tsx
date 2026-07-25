import { useStore } from "@nanostores/react";
import type {
    Feature,
    FeatureCollection,
    MultiPolygon,
    Polygon,
} from "geojson";
import * as L from "leaflet";
import { useEffect, useRef, useState } from "react";

import { leafletMapContext, showElevationOverlay } from "@/lib/context";
import {
    computeElevationBands,
    ELEVATION_BAND_BREAKS,
    ELEVATION_BAND_COLORS,
    ELEVATION_DATA_ATTRIBUTION,
} from "@/maps/geo-utils";

const FILL_OPACITY = 0.45;

type ElevationBandFeature = Feature<
    Polygon | MultiPolygon,
    { fillColor: string }
>;

export const ElevationOverlay = () => {
    const map = useStore(leafletMapContext);
    const $showElevationOverlay = useStore(showElevationOverlay);
    const [bands, setBands] = useState<ElevationBandFeature[] | null>(null);
    const layerRef = useRef<L.GeoJSON | null>(null);
    const legendRef = useRef<L.Control | null>(null);

    useEffect(() => {
        if (!$showElevationOverlay || bands) return;

        let cancelled = false;
        computeElevationBands(ELEVATION_BAND_BREAKS)
            .then((result) => {
                if (cancelled) return;
                setBands(
                    result.map((band, i) => ({
                        ...band,
                        properties: { fillColor: ELEVATION_BAND_COLORS[i] },
                    })),
                );
            })
            .catch((err) => {
                console.error("ElevationOverlay: failed to compute bands", err);
            });

        return () => {
            cancelled = true;
        };
    }, [$showElevationOverlay, bands]);

    useEffect(() => {
        if (!map) return;

        layerRef.current?.remove();
        layerRef.current = null;
        legendRef.current?.remove();
        legendRef.current = null;

        if (!$showElevationOverlay || !bands) return;

        const featureCollection: FeatureCollection = {
            type: "FeatureCollection",
            features: bands,
        };

        const layer = L.geoJSON(featureCollection, {
            interactive: false,
            style: (feature) => ({
                stroke: false,
                fillColor: feature?.properties?.fillColor,
                fillOpacity: FILL_OPACITY,
            }),
        });
        layer.addTo(map);
        layer.bringToBack();
        layerRef.current = layer;

        const legend = new L.Control({ position: "bottomleft" });
        legend.onAdd = () => {
            const div = L.DomUtil.create("div", "elevation-legend");
            div.style.background = "rgba(255,255,255,0.92)";
            div.style.color = "#1a1a1a";
            div.style.padding = "6px 8px";
            div.style.borderRadius = "6px";
            div.style.fontSize = "11px";
            div.style.lineHeight = "1.5";
            div.style.boxShadow = "0 1px 4px rgba(0,0,0,0.3)";
            div.title = ELEVATION_DATA_ATTRIBUTION;

            const rows = ELEVATION_BAND_COLORS.map((color, i) => {
                const low = ELEVATION_BAND_BREAKS[i];
                const high = ELEVATION_BAND_BREAKS[i + 1];
                return (
                    `<div style="display:flex;align-items:center;gap:6px;">` +
                    `<span style="width:12px;height:12px;flex:none;background:${color};` +
                    `display:inline-block;border-radius:2px;"></span>` +
                    `<span>${low}–${high}m</span></div>`
                );
            }).join("");

            div.innerHTML = `<div style="font-weight:600;margin-bottom:4px;">Elevation (above sea level)</div>${rows}`;
            return div;
        };
        legend.addTo(map);
        legendRef.current = legend;

        return () => {
            layer.remove();
            legend.remove();
            layerRef.current = null;
            legendRef.current = null;
        };
    }, [map, bands, $showElevationOverlay]);

    return null;
};
