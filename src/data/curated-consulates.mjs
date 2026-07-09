// Hand-curated list of foreign consulates for this game.
//
// Each entry identifies a consulate by its OpenStreetMap node/way/relation ID
// (found by browsing openstreetmap.org and copying the ID from the feature's
// URL, e.g. https://www.openstreetmap.org/way/123456 -> { osmType: "way", osmId: 123456 }).
// The comment above each entry is just for readability; it isn't parsed.
//
// Sourced from an Overpass query for [diplomatic=consulate] over the London
// fare zone 1 bounding box. Two candidates were dropped as duplicates of
// entries already listed here: the Chinese Embassy's "Visa Office" way
// (667077863), ~14m from the Chinese consular section node at the same
// Portland Place building, and a "Consulate of Turkiye" node (10847750345)
// at 44 Belgrave Square, a sparsely-tagged entry ~1km from the well
// documented Turkish Consulate General below, judged a stale duplicate. A
// "Chinese visa service" node (5069181558) was also dropped as an
// approximate-location outsourced visa application center rather than an
// actual consulate.
//
// Run `pnpm generate:pois` after editing this file to resolve coordinates
// and regenerate public/curated-consulates.geojson.

export default [
    // Consular Section of the Embassy of the People's Republic of China
    { osmType: "node", osmId: 577179316 },
    // Colombian Consulate
    { osmType: "node", osmId: 577179328 },
    // Embassy of The Republic of Latvia (Consular Section)
    { osmType: "node", osmId: 1623427129 },
    // Consulate General of Brazil
    { osmType: "node", osmId: 4833559722 },
    // Italian Consulate General
    { osmType: "node", osmId: 6425493668 },
    // Bulgarian Consulate
    { osmType: "node", osmId: 6602656103 },
    // Consulate of Romania
    { osmType: "node", osmId: 7401591159 },
    // Consular Section of Embassy of Iraq
    { osmType: "node", osmId: 7574255842 },
    // Consulate General of Peru
    { osmType: "node", osmId: 9463681465 },
    // Consulate-General of Albania
    { osmType: "node", osmId: 13432148521 },
    // Consulate of Ecuador
    { osmType: "node", osmId: 13990403325 },
    // Embassy of the Russian Federation (Consular Department)
    { osmType: "way", osmId: 33202582 },
    // Spanish Consulate
    { osmType: "way", osmId: 112261875 },
    // Consular Section of Iranian Embassy
    { osmType: "way", osmId: 128290569 },
    // Consulate General Of The Kingdom Of Morocco
    { osmType: "way", osmId: 155494946 },
    // Embassy of the United Arab Emirates — Consulate Section
    { osmType: "way", osmId: 158555475 },
    // Consulate-General of Portugal
    { osmType: "way", osmId: 242160713 },
    // Venezuela Consular Section in London
    { osmType: "way", osmId: 294886281 },
    // Consulate of Ukraine
    { osmType: "way", osmId: 356788438 },
    // Consular Section of the Embassy of the Republic of Poland
    { osmType: "way", osmId: 372474647 },
    // Consulate General of the Republic of Angola
    { osmType: "way", osmId: 423506752 },
    // Consulate General of France
    { osmType: "way", osmId: 485840627 },
    // Consulate of Pakistan
    { osmType: "way", osmId: 530784906 },
    // Consulate General Of Egypt
    { osmType: "way", osmId: 553732921 },
    // Consulate General of Turkey
    { osmType: "way", osmId: 638432089 },
    // The Lebanese Consulate
    { osmType: "way", osmId: 807711245 },
];
