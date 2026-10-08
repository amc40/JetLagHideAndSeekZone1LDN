import { useStore } from "@nanostores/react";
import type { FeatureCollection } from "geojson";
import * as L from "leaflet";
import { useEffect, useState } from "react";

import { leafletMapContext, showBoroughBoundaries } from "@/lib/context";
import { fetchLondonBoroughs } from "@/maps/api";

export const BoroughBoundariesOverlay = () => {
    const map = useStore(leafletMapContext);
    const $showBoroughBoundaries = useStore(showBoroughBoundaries);
    const [boroughs, setBoroughs] = useState<FeatureCollection | null>(null);

    useEffect(() => {
        if (!$showBoroughBoundaries || boroughs) return;

        let cancelled = false;
        fetchLondonBoroughs()
            .then((data) => {
                if (!cancelled) setBoroughs(data as FeatureCollection);
            })
            .catch((err) => {
                console.error(
                    "BoroughBoundariesOverlay: failed to load boroughs",
                    err,
                );
            });

        return () => {
            cancelled = true;
        };
    }, [$showBoroughBoundaries, boroughs]);

    useEffect(() => {
        if (!map || !$showBoroughBoundaries || !boroughs) return;

        const layer = L.geoJSON(boroughs, {
            interactive: false,
            style: {
                color: "#7c3aed",
                weight: 2,
                opacity: 0.8,
                dashArray: "6 4",
                fill: false,
            },
            onEachFeature: (feature, featureLayer) => {
                const name = feature.properties?.name;
                if (!name) return;
                featureLayer.bindTooltip(name, {
                    permanent: true,
                    direction: "center",
                    className: "borough-label",
                });
            },
        });
        layer.addTo(map);

        return () => {
            layer.remove();
        };
    }, [map, boroughs, $showBoroughBoundaries]);

    return null;
};
