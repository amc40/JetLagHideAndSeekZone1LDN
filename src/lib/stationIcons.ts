// Shared London transport-mode icon assets, used both by the decorative
// TransitStopMarkers overlay and by the hiding-zone station markers in
// ZoneSidebar. Co-located interchange stations render one icon per mode they
// serve, side by side.
//
// The Underground roundel and National Rail double-arrow are the official
// public-domain artworks from Wikimedia Commons. The DLR / Overground /
// Elizabeth line / Tram roundels are drawn here in the same roundel style
// (mode-coloured ring + navy #000F9F bar), matching the official Elizabeth line
// roundel (https://commons.wikimedia.org/wiki/File:Elizabeth_line_roundel.svg),
// using each mode's TfL brand colour for the ring.

import * as L from "leaflet";

import type { StationMode } from "@/maps/geo-utils";

import {
    DLR_ROUNDEL_SVG,
    ELIZABETH_ROUNDEL_SVG,
    OVERGROUND_ROUNDEL_SVG,
    TRAM_ROUNDEL_SVG,
} from "./stationRoundels";

// Official London Underground roundel, from
// https://commons.wikimedia.org/wiki/File:Underground.svg (public domain)
const TUBE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 615.3 500" preserveAspectRatio="xMidYMid meet" style="display:block;width:100%;height:100%;filter:drop-shadow(0 1px 2px rgba(0,0,0,.55))">
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
const RAIL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 62 39" preserveAspectRatio="xMidYMid meet" style="display:block;width:100%;height:100%;overflow:hidden;filter:drop-shadow(0 1px 2px rgba(0,0,0,.55))">
  <rect width="62" height="39" rx="6" ry="6" fill="white"/>
  <g stroke="#ED1C24" fill="none">
    <path d="M1,-8.9 46,12.4 16,26.6 61,47.9" stroke-width="6"/>
    <path d="M0,12.4H62m0,14.2H0" stroke-width="6.4"/>
  </g>
</svg>`;

// DLR / Overground / Elizabeth line / Tram use the official Wikimedia Commons
// roundels verbatim (see stationRoundels.ts).
export const STATION_MODE_SVG: Record<StationMode, string> = {
    tube: TUBE_SVG,
    rail: RAIL_SVG,
    dlr: DLR_ROUNDEL_SVG,
    overground: OVERGROUND_ROUNDEL_SVG,
    elizabeth: ELIZABETH_ROUNDEL_SVG,
    tram: TRAM_ROUNDEL_SVG,
};

export const STATION_MODE_LABEL: Record<StationMode, string> = {
    tube: "London Underground",
    rail: "National Rail",
    dlr: "Docklands Light Railway",
    overground: "London Overground",
    elizabeth: "Elizabeth line",
    tram: "London Trams",
};

// Text colour used in tooltips (the mode's brand colour).
export const STATION_MODE_COLOUR: Record<StationMode, string> = {
    tube: "#E32017",
    rail: "#003466",
    dlr: "#00AFAA",
    overground: "#EE7623",
    elizabeth: "#773DBD",
    tram: "#76BC21",
};

// Base on-screen size (at full zoom) per mode, [width, height] in px.
const BASE_SIZE: Record<StationMode, [number, number]> = {
    tube: [32, 26],
    rail: [34, 22],
    dlr: [32, 26],
    overground: [32, 26],
    elizabeth: [32, 26],
    tram: [32, 26],
};

// Full size is only used from this zoom level upward - below it icons shrink
// in proportion to the map scale so they stop overlapping when zoomed out.
const ICON_FULL_SIZE_ZOOM = 15;
// Icons never shrink past this fraction of full size, so they stay visible
// and tappable even when the whole zone is in view.
const ICON_MIN_SCALE = 0.35;

export function getIconScale(zoom: number): number {
    const scale = Math.pow(2, zoom - ICON_FULL_SIZE_ZOOM);
    return Math.min(1, Math.max(ICON_MIN_SCALE, scale));
}

const singleIconCache = new Map<string, L.DivIcon>();

/** A single mode's marker icon, scaled for the current zoom. Cached. */
export function getStationModeIcon(mode: StationMode, zoom: number): L.DivIcon {
    const scale = getIconScale(zoom);
    const key = `${mode}:${scale.toFixed(3)}`;
    const cached = singleIconCache.get(key);
    if (cached) return cached;

    const [baseWidth, baseHeight] = BASE_SIZE[mode];
    const width = baseWidth * scale;
    const height = baseHeight * scale;

    const icon = L.divIcon({
        html: `<div style="width:${width}px;height:${height}px">${STATION_MODE_SVG[mode]}</div>`,
        className: "",
        iconSize: [width, height],
        iconAnchor: [width / 2, height / 2],
    });
    singleIconCache.set(key, icon);
    return icon;
}

// Common height for icons rendered in a multi-mode row, so mixed modes align.
const ROW_BASE_HEIGHT = 26;
const ROW_GAP = 3;

const multiIconCache = new Map<string, L.DivIcon>();

/**
 * A horizontal row of mode icons for a (possibly merged) station, scaled for
 * the current zoom. Falls back to the National Rail icon when no mode is known.
 */
export function getStationModesIcon(
    modes: StationMode[] | undefined,
    zoom: number,
): L.DivIcon {
    const list =
        modes && modes.length > 0 ? modes : (["rail"] as StationMode[]);
    const scale = getIconScale(zoom);
    const key = `${list.join(",")}:${scale.toFixed(3)}`;
    const cached = multiIconCache.get(key);
    if (cached) return cached;

    const height = ROW_BASE_HEIGHT * scale;
    const gap = ROW_GAP * scale;

    const cells = list.map((mode) => {
        const [baseWidth, baseHeight] = BASE_SIZE[mode];
        const width = height * (baseWidth / baseHeight);
        return {
            width,
            html: `<div style="width:${width}px;height:${height}px;flex:0 0 auto">${STATION_MODE_SVG[mode]}</div>`,
        };
    });

    const totalWidth =
        cells.reduce((sum, cell) => sum + cell.width, 0) +
        gap * (cells.length - 1);

    const icon = L.divIcon({
        html: `<div style="display:flex;align-items:center;gap:${gap}px">${cells
            .map((cell) => cell.html)
            .join("")}</div>`,
        className: "",
        iconSize: [totalWidth, height],
        iconAnchor: [totalWidth / 2, height / 2],
    });
    multiIconCache.set(key, icon);
    return icon;
}
