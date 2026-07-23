// Builds the offline elevation dataset used by the "Sea Level" Measuring
// question. Downloads OS Terrain 50 (Ordnance Survey, Open Government
// Licence v3.0) from the OS Data Hub, keeps only the 100km-square "TQ" tiles
// covering Greater London, combines them into a single grid, downsamples
// 50m -> 100m (2x2 block average) to keep the bundle small and the runtime
// isoband computation fast, and writes the result as a compact binary grid
// plus a small JSON metadata file.
//
// Run manually with `pnpm generate:elevation` whenever the data needs
// refreshing; the generated files are committed so `pnpm build` never
// depends on network access to the OS Data Hub.
//
// Data source: OS Terrain 50, (c) Crown copyright and database right.
// Licensed under the Open Government Licence v3.0:
// https://www.ordnancesurvey.co.uk/opendata/licence

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import AdmZip from "adm-zip";

const PRODUCT_DOWNLOADS_URL =
    "https://api.os.uk/downloads/v1/products/Terrain50/downloads?area=GB&format=ASCII+Grid+and+GML+%28Grid%29&redirect";

// 100km grid square "TQ" covers Greater London. Within it, tiles are named
// tq{easting10km}{northing10km}; this 4x4 block (40km x 40km) comfortably
// covers London Underground Zone 1 plus a wide safety margin.
const EASTING_TILE_RANGE = [1, 4];
const NORTHING_TILE_RANGE = [6, 9];
const GRID_SQUARE = "tq";
const GRID_SQUARE_ORIGIN_EASTING = 500000;
const GRID_SQUARE_ORIGIN_NORTHING = 100000;

const TILE_CELLS = 200; // OS Terrain 50 ASCII grid cells per 10km tile side
const SOURCE_CELLSIZE = 50; // metres
const OUTPUT_CELLSIZE = 100; // metres, after 2x2 downsampling
const DOWNSAMPLE_FACTOR = OUTPUT_CELLSIZE / SOURCE_CELLSIZE;

const OUTPUT_BIN = fileURLToPath(
    new URL("../public/elevation-london.bin", import.meta.url),
);
const OUTPUT_META = fileURLToPath(
    new URL("../src/maps/geo-utils/elevation-grid.json", import.meta.url),
);

const tileNames = () => {
    const names = [];
    for (let e = EASTING_TILE_RANGE[0]; e <= EASTING_TILE_RANGE[1]; e++) {
        for (let n = NORTHING_TILE_RANGE[0]; n <= NORTHING_TILE_RANGE[1]; n++) {
            names.push({ e, n, name: `${GRID_SQUARE}${e}${n}` });
        }
    }
    return names;
};

const parseAsciiGrid = (text) => {
    const lines = text.trim().split("\n");
    const header = {};
    let i = 0;
    for (; i < 5; i++) {
        const [key, value] = lines[i].trim().split(/\s+/);
        header[key.toLowerCase()] = value;
    }
    const ncols = parseInt(header.ncols);
    const nrows = parseInt(header.nrows);
    const cellsize = parseFloat(header.cellsize);
    const xllcorner = parseFloat(header.xllcorner);
    const yllcorner = parseFloat(header.yllcorner);

    const rows = lines.slice(5, 5 + nrows).map((line) =>
        line
            .trim()
            .split(/\s+/)
            .map((value) => parseFloat(value)),
    );

    return { ncols, nrows, cellsize, xllcorner, yllcorner, rows };
};

async function main() {
    console.log("Downloading OS Terrain 50 (GB, ASCII Grid)...");
    const response = await fetch(PRODUCT_DOWNLOADS_URL, {
        headers: { "User-Agent": "jetlaghideandseekzone1ldn/1.0" },
    });
    if (!response.ok) {
        throw new Error(
            `Failed to download OS Terrain 50: ${response.status} ${response.statusText}`,
        );
    }
    const zipBuffer = Buffer.from(await response.arrayBuffer());

    const tmpDir = await mkdtemp(join(tmpdir(), "os-terrain50-"));
    try {
        const zip = new AdmZip(zipBuffer);

        const tiles = tileNames();
        const originEasting =
            GRID_SQUARE_ORIGIN_EASTING + EASTING_TILE_RANGE[0] * 10000;
        const originNorthing =
            GRID_SQUARE_ORIGIN_NORTHING + NORTHING_TILE_RANGE[0] * 10000;
        const gridWidthTiles =
            EASTING_TILE_RANGE[1] - EASTING_TILE_RANGE[0] + 1;
        const gridHeightTiles =
            NORTHING_TILE_RANGE[1] - NORTHING_TILE_RANGE[0] + 1;
        const sourceWidth = gridWidthTiles * TILE_CELLS;
        const sourceHeight = gridHeightTiles * TILE_CELLS;

        const sourceGrid = new Float32Array(sourceWidth * sourceHeight).fill(
            NaN,
        );

        for (const tile of tiles) {
            const upperTile = tile.name.toUpperCase();
            const entryName = `data/${GRID_SQUARE}/${tile.name}_OST50GRID_`;
            const entry = zip
                .getEntries()
                .find((e) => e.entryName.startsWith(entryName));
            if (!entry) {
                throw new Error(`Could not find tile zip for ${tile.name}`);
            }

            const innerZip = new AdmZip(entry.getData());
            const ascEntry = innerZip.getEntry(`${upperTile}.asc`);
            if (!ascEntry) {
                throw new Error(`Could not find ${upperTile}.asc`);
            }

            const grid = parseAsciiGrid(innerZip.readAsText(ascEntry));
            if (
                grid.cellsize !== SOURCE_CELLSIZE ||
                grid.ncols !== TILE_CELLS ||
                grid.nrows !== TILE_CELLS
            ) {
                throw new Error(
                    `Unexpected grid header for ${tile.name}: ${JSON.stringify(grid)}`,
                );
            }

            const colOffset = Math.round(
                (grid.xllcorner - originEasting) / SOURCE_CELLSIZE,
            );
            // .asc rows run from the top (max northing) down; convert to an
            // offset from the top of the combined grid.
            const combinedTopNorthing =
                originNorthing + sourceHeight * SOURCE_CELLSIZE;
            const tileTopNorthing =
                grid.yllcorner + grid.nrows * SOURCE_CELLSIZE;
            const rowOffset = Math.round(
                (combinedTopNorthing - tileTopNorthing) / SOURCE_CELLSIZE,
            );

            for (let r = 0; r < grid.nrows; r++) {
                const combinedRow = rowOffset + r;
                for (let c = 0; c < grid.ncols; c++) {
                    sourceGrid[combinedRow * sourceWidth + colOffset + c] =
                        grid.rows[r][c];
                }
            }
            console.log(`  merged ${tile.name}`);
        }

        for (let i = 0; i < sourceGrid.length; i++) {
            if (Number.isNaN(sourceGrid[i])) {
                throw new Error("Combined grid has gaps - check tile coverage");
            }
        }

        // Downsample via simple block averaging.
        const outWidth = Math.floor(sourceWidth / DOWNSAMPLE_FACTOR);
        const outHeight = Math.floor(sourceHeight / DOWNSAMPLE_FACTOR);
        const outGrid = new Int16Array(outWidth * outHeight);
        let min = Infinity;
        let max = -Infinity;

        for (let row = 0; row < outHeight; row++) {
            for (let col = 0; col < outWidth; col++) {
                let sum = 0;
                let count = 0;
                for (let dr = 0; dr < DOWNSAMPLE_FACTOR; dr++) {
                    for (let dc = 0; dc < DOWNSAMPLE_FACTOR; dc++) {
                        const sr = row * DOWNSAMPLE_FACTOR + dr;
                        const sc = col * DOWNSAMPLE_FACTOR + dc;
                        sum += sourceGrid[sr * sourceWidth + sc];
                        count++;
                    }
                }
                const meanMetres = sum / count;
                // Store in decimetres to preserve one decimal place of
                // precision within a compact 16-bit integer.
                const decimetres = Math.round(meanMetres * 10);
                outGrid[row * outWidth + col] = decimetres;
                min = Math.min(min, meanMetres);
                max = Math.max(max, meanMetres);
            }
        }

        await writeFile(OUTPUT_BIN, Buffer.from(outGrid.buffer));

        const metadata = {
            $comment:
                "Generated by scripts/generate-elevation-data.mjs. Do not edit by hand.",
            source: "OS Terrain 50",
            sourceUrl:
                "https://docs.os.uk/os-downloads/products/land-and-terrain-portfolio/os-terrain-50",
            license: "Open Government Licence v3.0",
            licenseUrl: "https://www.ordnancesurvey.co.uk/opendata/licence",
            attribution:
                "Contains OS data (c) Crown copyright and database right",
            verticalDatum: "Ordnance Datum Newlyn (EPSG:5701)",
            horizontalCrs: "OSGB36 / British National Grid (EPSG:27700)",
            generatedAt: new Date().toISOString(),
            tiles: tiles.map((t) => t.name),
            originEasting,
            originNorthing,
            cellSize: OUTPUT_CELLSIZE,
            width: outWidth,
            height: outHeight,
            minElevationMetres: Math.round(min * 10) / 10,
            maxElevationMetres: Math.round(max * 10) / 10,
            valueUnits: "decimetres (elevation_metres = value / 10)",
        };
        await writeFile(OUTPUT_META, JSON.stringify(metadata, null, 4) + "\n");

        console.log(
            `Wrote ${OUTPUT_BIN} (${outWidth}x${outHeight}, ${outGrid.byteLength} bytes)`,
        );
        console.log(`Wrote ${OUTPUT_META}`);
        console.log(
            `Elevation range: ${metadata.minElevationMetres}m to ${metadata.maxElevationMetres}m`,
        );
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
