// Copies Cesium's prebuilt static files into public/ so the 3D view works offline.
import { cpSync, existsSync } from "node:fs";

const src = "node_modules/cesium/Build/Cesium";
if (!existsSync(src)) {
  console.error("cesium not installed — run: npm install cesium@1.146.0");
  process.exit(1);
}
cpSync(src, "public/cesium", { recursive: true });
console.log("Cesium copied to public/cesium");
