// Hand-curated list of aquariums for this game.
//
// Each entry identifies an aquarium by its OpenStreetMap node/way/relation ID
// (found by browsing openstreetmap.org and copying the ID from the feature's
// URL, e.g. https://www.openstreetmap.org/way/123456 -> { osmType: "way", osmId: 123456 }).
// The comment above each entry is just for readability; it isn't parsed.
//
// Sourced from an Overpass query for [tourism=aquarium] within the London
// Zone 1 play area. There is only one aquarium in the zone (London
// Aquarium at County Hall); a second OSM node ("SEA LIFE Aquarium London",
// 9777763616) ~150m away was excluded as a duplicate mapping of the same
// venue.
//
// Run `pnpm generate:pois` after editing this file to resolve coordinates
// and regenerate public/curated-aquariums.geojson.

export default [
    // London Aquarium (Sea Life)
    { osmType: "node", osmId: 266843474 },
];
