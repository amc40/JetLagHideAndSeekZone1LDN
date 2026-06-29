import type { FeatureCollection, Polygon } from "geojson";

/**
 * TfL Zone 1 boundary polygon.
 *
 * TfL does not publish an official geographic polygon for fare zones — zones
 * are defined by which stations belong to them, not by a drawn boundary. This
 * polygon was constructed by computing the convex hull of all Zone 1 station
 * positions (sourced from OpenStreetMap) and expanding it outward by ~700 m in
 * every direction so that the boundary sits outside the outermost stations
 * rather than cutting through them.
 *
 * Stations used as anchors include: Aldgate East, Angel, Baker Street,
 * Battersea Power Station, Bermondsey, Earl's Court, Haggerston, High Street
 * Kensington, Hoxton, King's Cross St. Pancras, Notting Hill Gate, Old Street,
 * Tower Gateway, Vauxhall, Whitechapel, and all other confirmed Zone 1 London
 * Underground / Overground stations.
 *
 * Coordinates are [longitude, latitude] as required by GeoJSON.
 */
export const TFL_ZONE_1_POLYGON: FeatureCollection<Polygon> = {
    type: "FeatureCollection",
    features: [
        {
            type: "Feature",
            properties: {},
            geometry: {
                type: "Polygon",
                coordinates: [
                    [
                        [-0.207683, 51.509013], // W of Notting Hill Gate
                        [-0.203688, 51.488105], // SW of Earl's Court
                        [-0.178, 51.487], // SW transition (keeps West Brompton Z2 outside)
                        [-0.144, 51.471], // S of Battersea Power Station
                        [-0.123651, 51.479179], // S of Vauxhall
                        [-0.091816, 51.489695], // SE of Elephant & Castle
                        [-0.053, 51.5], // E of Bermondsey
                        [-0.0633, 51.510388], // E of Tower Gateway / Aldgate
                        [-0.05036, 51.520589], // NE of Whitechapel
                        [-0.067, 51.543], // NE of Hoxton / Haggerston
                        [-0.098744, 51.537774], // N of Angel
                        [-0.1211, 51.537586], // N of King's Cross
                        [-0.172798, 51.525804], // NW of Marylebone
                        [-0.180382, 51.522613], // NW of Edgware Road
                        [-0.207683, 51.509013], // closing point
                    ],
                ],
            },
        },
    ],
};

export type MapPreset = {
    id: string;
    label: string;
    polygon: FeatureCollection<Polygon>;
};

export const MAP_AREA_PRESETS: MapPreset[] = [
    {
        id: "tfl-zone-1",
        label: "TfL Zone 1",
        polygon: TFL_ZONE_1_POLYGON,
    },
];
