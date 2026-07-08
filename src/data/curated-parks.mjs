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
    // Alexandra Road Park
    { osmType: "way", osmId: 982728997 },
    // Archbishop's Park
    { osmType: "way", osmId: 4260009 },
    // Avondale Park
    { osmType: "way", osmId: 19748095 },
    // Barnard Park
    { osmType: "relation", osmId: 19117130 },
    // Battersea Park
    { osmType: "way", osmId: 840130236 },
    // Bermondsey Spa Gardens
    { osmType: "way", osmId: 26163279 },
    // Bishop's Meadow
    { osmType: "way", osmId: 292716717 },
    // Bishop's Park
    { osmType: "way", osmId: 4380345 },
    // Brook Green
    { osmType: "way", osmId: 25605582 },
    // Brunswick Park
    { osmType: "way", osmId: 26595608 },
    // Burgess Park
    { osmType: "relation", osmId: 18347320 },
    // Coram's Fields
    { osmType: "way", osmId: 55737057 },
    // Dickens' Fields
    { osmType: "way", osmId: 44593191 },
    // Eel Brook Common
    { osmType: "way", osmId: 5131192 },
    // Elephant Park
    { osmType: "way", osmId: 691296799 },
    // Eythorne Park
    { osmType: "way", osmId: 898542206 },
    // Falcon Park
    { osmType: "way", osmId: 4416362 },
    // Fred Wells Gardens
    { osmType: "way", osmId: 4701535 },
    // Geraldine Mary Harmsworth Park
    { osmType: "way", osmId: 8614502 },
    // Haggerston Park
    { osmType: "way", osmId: 8501796 },
    // Heathbrook Park
    { osmType: "way", osmId: 27363252 },
    // Holland Park
    { osmType: "way", osmId: 8137262 },
    // Hurlingham Park
    { osmType: "way", osmId: 4252522 },
    // Hyde Park
    { osmType: "way", osmId: 372975520 },
    // Imperial Park
    { osmType: "way", osmId: 97503323 },
    // Kennington Park
    { osmType: "relation", osmId: 13461887 },
    // Kensington Gardens
    { osmType: "way", osmId: 3986346 },
    // Kensington Memorial Park
    { osmType: "way", osmId: 23526046 },
    // Lambeth Walk Doorstep Green
    { osmType: "way", osmId: 79308654 },
    // Larkhall Park
    { osmType: "way", osmId: 4982149 },
    // Lincoln's Inn Fields
    { osmType: "way", osmId: 30613392 },
    // London Fields
    { osmType: "way", osmId: 4406359 },
    // Lucas Gardens
    { osmType: "way", osmId: 5551993 },
    // Max Roach Park
    { osmType: "relation", osmId: 14069923 },
    // Meanwhile Gardens
    { osmType: "way", osmId: 23600634 },
    // Myatt's Fields
    { osmType: "way", osmId: 4357123 },
    // New River Walk
    { osmType: "relation", osmId: 7768846 },
    // Newington Gardens
    { osmType: "way", osmId: 44425766 },
    // Normand Park
    { osmType: "way", osmId: 94221095 },
    // Nursery Row Park
    { osmType: "way", osmId: 22895152 },
    // Paddington Recreation Ground
    { osmType: "way", osmId: 156510046 },
    // Pasley Park
    { osmType: "way", osmId: 29360805 },
    // Potters Fields Park
    { osmType: "way", osmId: 367694522 },
    // Primrose Hill
    { osmType: "way", osmId: 4082666 },
    // Queens Park
    { osmType: "way", osmId: 4072806 },
    // Ranelagh Gardens
    { osmType: "way", osmId: 851136558 },
    // Rosemary Gardens
    { osmType: "way", osmId: 5122303 },
    // Russell Square
    { osmType: "way", osmId: 3241371 },
    // Salisbury Row
    { osmType: "way", osmId: 22604638 },
    // Shepherds Bush Green
    { osmType: "way", osmId: 4244829 },
    // Shillington Park
    { osmType: "way", osmId: 4416363 },
    // Shoreditch Park
    { osmType: "way", osmId: 100610481 },
    // Slade Gardens
    { osmType: "relation", osmId: 14880311 },
    // South Kilburn Open Space
    { osmType: "way", osmId: 93308046 },
    // South Park
    { osmType: "way", osmId: 4252532 },
    // Spa Fields
    { osmType: "relation", osmId: 2191175 },
    // St George's Gardens
    { osmType: "way", osmId: 23231897 },
    // St. George's Square
    { osmType: "way", osmId: 23946211 },
    // St. James's Park
    { osmType: "way", osmId: 374960368 },
    // St. John's Wood Church Grounds
    { osmType: "way", osmId: 398337148 },
    // Surrey Square Park
    { osmType: "way", osmId: 156931394 },
    // Tabard Gardens
    { osmType: "way", osmId: 26248229 },
    // The Green Park
    { osmType: "way", osmId: 863554956 },
    // The Regent's Park
    { osmType: "relation", osmId: 1384127 },
    // Vauxhall Park
    { osmType: "relation", osmId: 14755741 },
    // Vauxhall Pleasure Gardens
    { osmType: "way", osmId: 4256264 },
    // Victoria Embankment Gardens
    { osmType: "way", osmId: 4254099 },
    // Victoria Tower Gardens
    { osmType: "way", osmId: 4259687 },
    // Warwick Gardens
    { osmType: "relation", osmId: 77740 },
    // Weaver's Fields
    { osmType: "way", osmId: 506841261 },
    // Westbourne Green Open Space
    { osmType: "relation", osmId: 10090476 },
    // Westfield Park
    { osmType: "way", osmId: 4488669 },
];
