import type { Feature, Point, Polygon } from "geojson";
import type { LatLngTuple } from "leaflet";

import type { StationMode } from "@/maps/geo-utils/stationModes";
import type { Question } from "@/maps/schema";

export interface OpenStreetMap {
    type: string;
    geometry: OpenStreetMapGeometry;
    properties: OpenStreetMapProperties;
}

export interface OpenStreetMapGeometry {
    type: string;
    coordinates: LatLngTuple;
}

export interface OpenStreetMapProperties {
    osm_type: "W" | "R" | "N";
    osm_id: number;
    extent?: number[];
    country?: string;
    state?: string;
    osm_key: string;
    countrycode: string;
    osm_value: string;
    name: string;
    type: string;
    isHidingZone?: boolean;
    questions?: Question[];
}

export interface AdditionalMapGeoLocations {
    added: boolean;
    location: OpenStreetMap;
    base: boolean;
}

export enum QuestionSpecificLocation {
    McDonalds = '["brand:wikidata"="Q38076"]',
    Seven11 = '["brand:wikidata"="Q259340"]',
}

export enum CacheType {
    CACHE = "jlhs-map-generator-cache",
    ZONE_CACHE = "jlhs-map-generator-zone-cache",
    PERMANENT_CACHE = "jlhs-map-generator-permanent-cache",
}

export interface StationPlaceProperties {
    id: string;
    name?: string;
    "name:en"?: string;
    // Baked into the curated station data: the transport modes served (drives
    // the icons shown), the lines calling here (drives "same train line"), and
    // every underlying OSM member id.
    modes?: StationMode[];
    lines?: string[];
    memberIds?: string[];
    [key: string]: unknown;
}

export type StationPlace = Feature<Point, StationPlaceProperties>;
export type StationCircle = Feature<Polygon, StationPlace>;

export type {
    APILocations,
    EncompassingTentacleQuestionSchema,
    HomeGameMatchingQuestions,
    HomeGameMeasuringQuestions,
} from "@/maps/schema";
