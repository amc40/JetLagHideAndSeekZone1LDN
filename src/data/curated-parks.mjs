// Hand-curated list of Zone 1 London parks/gardens for this game.
//
// Each entry identifies a park by its OpenStreetMap way/relation ID
// (found by browsing openstreetmap.org and copying the ID from the feature's
// URL, e.g. https://www.openstreetmap.org/way/123456 -> { osmType: "way", osmId: 123456 }).
// The comment above each entry is just for readability; it isn't parsed.
//
// Candidates were pulled from Overpass ([leisure=park] in the Zone 1 bbox)
// and filtered to named, publicly-accessible green spaces of roughly
// >=25,000 sq m (by bounding-box area) or larger, excluding: private-access
// sites (e.g. Burton Court, Lincoln's Inn, Gray's Inn Gardens), a park
// temporarily closed for redevelopment (Grosvenor Square), churchyards/burial
// grounds (St Mary's x2, St Paul's, Bunhill Fields), unnamed/unidentifiable
// features, and duplicate multipolygon member ways already covered by their
// parent relation (Pedlar's Park, Bernie Spain Gardens).
//
// Run `pnpm generate:pois` after editing this file to resolve coordinates
// and regenerate public/curated-parks.geojson.

export default [
    // Archbishop's Park
    { osmType: "way", osmId: 4260009 },
    // Barnard Park
    { osmType: "relation", osmId: 19117130 },
    // Battersea Park
    { osmType: "way", osmId: 840130236 },
    // Bermondsey Spa Gardens
    { osmType: "way", osmId: 26163279 },
    // Coram's Fields
    { osmType: "way", osmId: 55737057 },
    // Dickens' Fields
    { osmType: "way", osmId: 44593191 },
    // Elephant Park
    { osmType: "way", osmId: 691296799 },
    // Geraldine Mary Harmsworth Park
    { osmType: "way", osmId: 8614502 },
    // Haggerston Park
    { osmType: "way", osmId: 8501796 },
    // Holland Park
    { osmType: "way", osmId: 8137262 },
    // Hyde Park
    { osmType: "way", osmId: 372975520 },
    // Kensington Gardens
    { osmType: "way", osmId: 3986346 },
    // Lambeth Walk Doorstep Green
    { osmType: "way", osmId: 79308654 },
    // Lincoln's Inn Fields
    { osmType: "way", osmId: 30613392 },
    // Newington Gardens
    { osmType: "way", osmId: 44425766 },
    // Nursery Row Park
    { osmType: "way", osmId: 22895152 },
    // Potters Fields Park
    { osmType: "way", osmId: 367694522 },
    // Ranelagh Gardens
    { osmType: "way", osmId: 851136558 },
    // Rosemary Gardens
    { osmType: "way", osmId: 5122303 },
    // Russell Square
    { osmType: "way", osmId: 3241371 },
    // Salisbury Row
    { osmType: "way", osmId: 22604638 },
    // Shoreditch Park
    { osmType: "way", osmId: 100610481 },
    // Spa Fields
    { osmType: "relation", osmId: 2191175 },
    // St George's Gardens
    { osmType: "way", osmId: 23231897 },
    // St. George's Square
    { osmType: "way", osmId: 23946211 },
    // St. James's Park
    { osmType: "way", osmId: 374960368 },
    // Tabard Gardens
    { osmType: "way", osmId: 26248229 },
    // The Green Park
    { osmType: "way", osmId: 863554956 },
    // Vauxhall Park
    { osmType: "relation", osmId: 14755741 },
    // Vauxhall Pleasure Gardens
    { osmType: "way", osmId: 4256264 },
    // Victoria Embankment Gardens
    { osmType: "way", osmId: 4254099 },
    // Victoria Tower Gardens
    { osmType: "way", osmId: 4259687 },
    // Weaver's Fields
    { osmType: "way", osmId: 506841261 },
];
