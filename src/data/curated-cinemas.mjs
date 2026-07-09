// Hand-curated list of cinemas for this game.
//
// Each entry identifies a cinema by its OpenStreetMap node/way/relation ID
// (found by browsing openstreetmap.org and copying the ID from the feature's
// URL, e.g. https://www.openstreetmap.org/way/123456 -> { osmType: "way", osmId: 123456 }).
// The comment above each entry is just for readability; it isn't parsed.
//
// Sourced from an Overpass query for `amenity=cinema` within the London
// Zone 1 play area. Excludes: duplicate nodes for the same physical venue
// (e.g. a mezzanine level or extra screen tagged as a separate point),
// London Dock - Residents Cinema (explicitly private, residents-only), and
// a couple of seasonal/pop-up or hotel-operated screening rooms that were
// judged out of scope for a standard public cinema list.
//
// Run `pnpm generate:pois` after editing this file to resolve coordinates
// and regenerate public/curated-cinemas.geojson.

export default [
    // Barbican Centre (Cinema)
    { osmType: "node", osmId: 25474641 },
    // Cineworld Leicester Square
    { osmType: "node", osmId: 26573168 },
    // Vue Leicester Square
    { osmType: "node", osmId: 26573173 },
    // Odeon Luxe Haymarket
    { osmType: "node", osmId: 26671967 },
    // Curzon Soho
    { osmType: "node", osmId: 26699541 },
    // Vue Islington (Angel Central)
    { osmType: "node", osmId: 306042840 },
    // Rich Mix Cinema
    { osmType: "node", osmId: 371525331 },
    // Vue (Shepherd's Bush, West 12 Shopping Centre)
    { osmType: "node", osmId: 452948294 },
    // Everyman Chelsea
    { osmType: "node", osmId: 498694180 },
    // Odeon (Camden)
    { osmType: "node", osmId: 931624349 },
    // The Nickel Cinema (Clerkenwell)
    { osmType: "node", osmId: 1236834452 },
    // Regent Street Cinema
    { osmType: "node", osmId: 1710144548 },
    // Imperial Cinema (Imperial College Union, South Kensington)
    { osmType: "node", osmId: 1716046769 },
    // Curzon Victoria
    { osmType: "node", osmId: 2785097711 },
    // Vue (Piccadilly area)
    { osmType: "node", osmId: 3357929234 },
    // Electric Cinema (Shoreditch, Redchurch Street)
    { osmType: "node", osmId: 3767748685 },
    // Picturehouse Central
    { osmType: "node", osmId: 3921178316 },
    // Close-Up Film Centre (Shoreditch)
    { osmType: "node", osmId: 4145029892 },
    // Curzon Aldgate
    { osmType: "node", osmId: 4617424209 },
    // Everyman (Broadgate, Finsbury Avenue)
    { osmType: "node", osmId: 5218118730 },
    // Everyman King's Cross
    { osmType: "node", osmId: 5376964904 },
    // Everyman (Baker Street)
    { osmType: "node", osmId: 6338253691 },
    // The Cinema in the Arches (Battersea Power Station)
    { osmType: "node", osmId: 6345003067 },
    // Ciné Lumière (French Institute, South Kensington)
    { osmType: "node", osmId: 7930695624 },
    // Odeon Luxe & Dine (Islington)
    { osmType: "node", osmId: 8819117410 },
    // Curzon Hoxton
    { osmType: "node", osmId: 9120392029 },
    // Odeon Luxe West End (Leicester Square)
    { osmType: "node", osmId: 9405724041 },
    // Everyman (Borough Yards)
    { osmType: "node", osmId: 9960451065 },
    // ICA Cinema
    { osmType: "node", osmId: 10554856531 },
    // The Ronson Theatre (Science Museum IMAX)
    { osmType: "node", osmId: 11709415903 },
    // Vue (Fulham Broadway)
    { osmType: "node", osmId: 13525260759 },
    // Screen on the Green (Islington)
    { osmType: "way", osmId: 31305418 },
    // Curzon Mayfair
    { osmType: "way", osmId: 77002327 },
    // Peckhamplex
    { osmType: "way", osmId: 78230879 },
    // The Garden Cinema
    { osmType: "way", osmId: 97237929 },
    // BFI IMAX
    { osmType: "way", osmId: 123444154 },
    // BFI Southbank
    { osmType: "way", osmId: 150702283 },
    // Odeon Luxe Leicester Square
    { osmType: "way", osmId: 180571964 },
    // Prince Charles Cinema
    { osmType: "way", osmId: 180594287 },
    // Everyman (Maida Vale)
    { osmType: "way", osmId: 208422244 },
    // Curzon Bloomsbury
    { osmType: "way", osmId: 291651296 },
    // Picturehouse Notting Hill (Coronet) — no name tag in OSM, name given explicitly
    { osmType: "way", osmId: 356675364, name: "Picturehouse Notting Hill" },
    // Electric Cinema (Notting Hill, Portobello Road)
    { osmType: "way", osmId: 357556094 },
    // Odeon (Tottenham Court Road)
    { osmType: "way", osmId: 425222125 },
];
