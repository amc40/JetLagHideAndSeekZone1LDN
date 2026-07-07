// Copies the @arcgis/core geodesic engine WASM asset into public/ so it can be
// served/precached from this origin instead of Esri's CDN (config.assetsPath
// defaults to https://js.arcgis.com/.../assets, which requires network access).
import { cpSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const src = join(
    rootDir,
    "node_modules/@arcgis/core/assets/esri/geometry/support/pe-wasm.wasm",
);
const dest = join(
    rootDir,
    "public/arcgis-assets/esri/geometry/support/pe-wasm.wasm",
);

mkdirSync(dirname(dest), { recursive: true });
cpSync(src, dest);
console.log(`Copied ArcGIS geodesic engine asset to ${dest}`);
