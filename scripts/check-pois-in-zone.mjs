// Audit + optional fix: check every curated POI's resolved coordinates
// against TFL_ZONE_1_POLYGON, and (with --fix) remove out-of-zone entries
// from the src/data/curated-*.mjs source files.
//
// Usage:
//   node scripts/check-pois-in-zone.mjs        # report only
//   node scripts/check-pois-in-zone.mjs --fix   # also edit the .mjs sources
import * as turf from "@turf/turf";
import fs from "fs";
import path from "path";

import { TFL_ZONE_1_POLYGON } from "../src/lib/map-presets.ts";

const zonePolygon = TFL_ZONE_1_POLYGON.features[0];
const fix = process.argv.includes("--fix");

const publicDir = path.join(import.meta.dirname, "../public");
const dataDir = path.join(import.meta.dirname, "../src/data");
const files = fs
    .readdirSync(publicDir)
    .filter((f) => f.startsWith("curated-") && f.endsWith(".geojson"));

let totalOutside = 0;
for (const file of files) {
    const category = file.replace(/^curated-/, "").replace(/\.geojson$/, "");
    const fc = JSON.parse(fs.readFileSync(path.join(publicDir, file), "utf8"));

    const outside = fc.features.filter(
        (f) => !turf.booleanPointInPolygon(f, zonePolygon),
    );

    if (outside.length === 0) {
        console.log(`${file}: all ${fc.features.length} entries inside zone`);
        continue;
    }

    totalOutside += outside.length;
    console.log(`\n=== ${file} (${outside.length} outside) ===`);
    for (const f of outside) {
        const [lon, lat] = f.geometry.coordinates;
        console.log(
            `  OUTSIDE: ${f.properties.name ?? f.properties.id} (${lat}, ${lon})`,
        );
    }

    if (!fix) continue;

    const sourcePath = path.join(dataDir, `curated-${category}.mjs`);
    if (!fs.existsSync(sourcePath)) {
        console.log(`  (no source file ${sourcePath}, skipping fix)`);
        continue;
    }
    let src = fs.readFileSync(sourcePath, "utf8");

    for (const f of outside) {
        const id = f.properties.id; // e.g. "way/31636962"
        const name = f.properties.name;
        let entryRegex;
        if (id) {
            const [osmType, osmId] = id.split("/");
            entryRegex = new RegExp(
                `[ \\t]*\\{\\s*osmType:\\s*"${osmType}",\\s*osmId:\\s*${osmId},?\\s*\\},?\\n`,
            );
        } else if (name) {
            const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            entryRegex = new RegExp(
                `[ \\t]*\\{[^}]*name:\\s*"${escaped}"[^}]*\\},?\\n`,
            );
        } else {
            continue;
        }

        // Also strip a directly preceding `// comment` line, if present.
        const combined = new RegExp(
            `([ \\t]*//[^\\n]*\\n)?${entryRegex.source}`,
        );
        if (combined.test(src)) {
            src = src.replace(combined, "");
        } else if (entryRegex.test(src)) {
            src = src.replace(entryRegex, "");
        } else {
            console.log(`  (could not find source entry for ${name ?? id})`);
        }
    }

    fs.writeFileSync(sourcePath, src);
    console.log(`  Updated ${sourcePath}`);
}

console.log(`\nTotal outside: ${totalOutside}`);
