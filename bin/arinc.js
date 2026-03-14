#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { parseArincFile, parseArincText, readCanonicalModel, writeCanonicalModel } from "@arinc424/core";
import { buildFeaturesFromCanonical, validateFeatureModel } from "@arinc424/features";
import { buildGeoJSONLayers, generateTiles, writeTileManifest } from "@arinc424/tiles";
import { build3DTilesFromFeatures } from "@arinc424/3dtiles";

function usage() {
  console.log(`Usage:
  arinc parse <input.dat> <canonical.json>
  arinc features <canonical.json> <features.json>
  arinc tiles <features.json> <outDir> [--min-zoom N --max-zoom N]
  arinc 3dtiles <features.json> <outDir>

Notes:
  - The CLI is orchestration-only; domain logic lives in workspace packages.
  - Legacy monolithic runtime code is archived under legacy/src-monolith and unsupported.`);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

async function main() {
  const [,, cmd, ...args] = process.argv;
  if (!cmd) {
    usage();
    process.exit(1);
  }

  if (cmd === "parse") {
    const [input, output] = args;
    if (!input || !output) { usage(); process.exit(1); }
    const canonical = input.endsWith(".json")
      ? readCanonicalModel(path.resolve(input))
      : await parseArincFile(path.resolve(input));
    writeCanonicalModel(canonical, path.resolve(output));
    console.log(`canonical written: ${output}`);
    return;
  }

  if (cmd === "features") {
    const [inputCanonical, outputFeatures] = args;
    if (!inputCanonical || !outputFeatures) { usage(); process.exit(1); }
    const canonical = readCanonicalModel(path.resolve(inputCanonical));
    const features = buildFeaturesFromCanonical(canonical);
    fs.writeFileSync(path.resolve(outputFeatures), `${JSON.stringify(features, null, 2)}\n`, "utf8");
    console.log(`features written: ${outputFeatures}`);
    return;
  }

  if (cmd === "tiles") {
    const [inputFeatures, outDir, ...rest] = args;
    if (!inputFeatures || !outDir) { usage(); process.exit(1); }
    const minZoomIdx = rest.indexOf("--min-zoom");
    const maxZoomIdx = rest.indexOf("--max-zoom");
    const minZoom = minZoomIdx >= 0 ? Number(rest[minZoomIdx + 1]) : 4;
    const maxZoom = maxZoomIdx >= 0 ? Number(rest[maxZoomIdx + 1]) : 10;

    const model = readJson(path.resolve(inputFeatures));
    validateFeatureModel(model);
    const layersDir = path.join(path.resolve(outDir), "layers");
    const tilesDir = path.join(path.resolve(outDir), "tiles");
    buildGeoJSONLayers(model, { outDir: layersDir });
    const { manifest } = generateTiles(model, { outDir: tilesDir, minZoom, maxZoom });
    writeTileManifest(manifest, path.join(path.resolve(outDir), "manifest.json"));
    console.log(`tiles written: ${outDir}`);
    return;
  }

  if (cmd === "3dtiles") {
    const [featuresFile, outDir] = args;
    if (!featuresFile || !outDir) { usage(); process.exit(1); }
    const featureModel = readJson(path.resolve(featuresFile));
    validateFeatureModel(featureModel);
    build3DTilesFromFeatures(featureModel, { outDir: path.resolve(outDir), mode: "tileset" });
    console.log(`3d tiles written: ${outDir}`);
    return;
  }

  if (cmd === "parse-text") {
    const [inFile, output] = args;
    const text = fs.readFileSync(path.resolve(inFile), "utf8");
    const canonical = await parseArincText(text);
    writeCanonicalModel(canonical, path.resolve(output));
    return;
  }

  usage();
  process.exit(1);
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});
