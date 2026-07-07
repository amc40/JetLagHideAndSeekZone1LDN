// Hand-curated list of hospitals for this game.
//
// Each entry identifies a hospital by its OpenStreetMap node/way/relation ID
// (found by browsing openstreetmap.org and copying the ID from the feature's
// URL, e.g. https://www.openstreetmap.org/way/123456 -> { osmType: "way", osmId: 123456 }).
// The comment above each entry is just for readability; it isn't parsed.
//
// Run `pnpm generate:pois` after editing this file to resolve coordinates
// and regenerate public/curated-hospitals.geojson.

export default [
    // St Charles' Hospital
    { osmType: "way", osmId: 31636962 },
    // St. Pancras Hospital
    { osmType: "way", osmId: 43290805 },
    // St Mary's Hospital
    { osmType: "way", osmId: 45388015 },
    // The Princess Grace Hospital
    { osmType: "way", osmId: 80888181 },
    // King Edward VII's Hospital
    { osmType: "way", osmId: 80888190 },
    // The Portland Hospital
    { osmType: "way", osmId: 80888195 },
    // Royal Brompton Hospital
    { osmType: "way", osmId: 85472872 },
    // The Royal Marsden Hospital
    { osmType: "way", osmId: 85472885 },
    // The London Welbeck Hospital
    { osmType: "way", osmId: 110476079 },
    // Lister Hospital
    { osmType: "way", osmId: 111343934 },
    // Gordon Hospital
    { osmType: "way", osmId: 112682015 },
    // Evelina London Children's Hospital
    { osmType: "way", osmId: 116629214 },
    // St Thomas' Hospital
    { osmType: "way", osmId: 122227536 },
    // Cleveland Clinic London
    { osmType: "way", osmId: 122299506 },
    // St Bartholomew's Hospital
    { osmType: "way", osmId: 170732745 },
    // Charing Cross Hospital
    { osmType: "way", osmId: 188617701 },
    // King's College Hospital
    { osmType: "way", osmId: 277432734 },
    // Moorfields Eye Hospital (City Road campus)
    { osmType: "way", osmId: 402012627 },
    // London Bridge Hospital
    { osmType: "way", osmId: 413948227 },
    // University College Hospital
    { osmType: "way", osmId: 440410278 },
    // Mildmay Mission Hospital
    { osmType: "way", osmId: 497718283 },
    // Great Ormond Street Hospital for Children
    { osmType: "way", osmId: 548533106 },
    // Nightingale Hospital
    { osmType: "way", osmId: 688880323 },
    // Hospital of St John and St Elizabeth
    { osmType: "way", osmId: 699934188 },
    // Guy's Hospital
    { osmType: "way", osmId: 707322577 },
    // Cromwell Hospital
    { osmType: "way", osmId: 821710065 },
    // Chelsea and Westminster Hospital
    { osmType: "way", osmId: 881918254 },
    // Royal National ENT and Eastman Dental Hospitals
    { osmType: "way", osmId: 1113340300 },
    // National Hospital for Neurology and Neurosurgery
    { osmType: "way", osmId: 1390491265 },
    // Royal London Hospital for Integrated Medicine
    { osmType: "way", osmId: 1390491266 },
    // Maudsley Hospital
    { osmType: "relation", osmId: 8286235 },
    // London Clinic
    { osmType: "relation", osmId: 10286924 },
];
