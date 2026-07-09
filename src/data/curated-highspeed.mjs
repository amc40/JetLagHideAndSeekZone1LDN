// Hand-curated list of high-speed rail (HS1) stations for this game.
//
// St Pancras International is HS1's only station within London fare zone 1,
// so this list has a single entry, sourced the same way as
// curated-stations.mjs (a readable name plus known coordinates, no Overpass
// lookup needed).
//
// Run `pnpm generate:pois` after editing this file to regenerate
// public/curated-highspeed.geojson.

export default [
    { name: "St Pancras railway station", lat: 51.53, lon: -0.12527778 },
];
