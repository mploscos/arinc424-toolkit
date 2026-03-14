#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { parseArincFile, parseArincText, readCanonicalModel, writeCanonicalModel } from "@arinc424/core";
import { buildFeaturesFromCanonical, validateFeatureModel } from "@arinc424/features";
import { buildGeoJSONLayers, generateTiles, writeTileManifest } from "@arinc424/tiles";
import { build3DTilesFromFeatures } from "@arinc424/3dtiles";
import {
  summarizeDataset,
  summarizeFeatures,
  inspectAirspace,
  inspectAirport,
  inspectWaypoint,
  queryEntities,
  formatSummary
} from "@arinc424/analysis";

function usage() {
  console.log(`Usage:
  arinc parse <input.dat> <canonical.json>
  arinc features <canonical.json> <features.json>
  arinc tiles <features.json> <outDir> [--min-zoom N --max-zoom N]
  arinc 3dtiles <features.json> <outDir>

  arinc stats <canonical-or-features.json> [--json]
  arinc inspect-airspace <canonical.json> <id|token> [--json]
  arinc inspect-airport <canonical.json> <id|ident> [--json]
  arinc inspect-waypoint <canonical.json> <id|ident> [--json]
  arinc query <canonical-or-features.json> [--layer L] [--type T] [--id X] [--bbox minX,minY,maxX,maxY] [--prop k=v] [--limit N] [--json]

Notes:
  - The CLI is orchestration-only; domain logic lives in workspace packages.
  - Legacy monolithic runtime code is archived under legacy/src-monolith and unsupported.`);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function hasFlag(args, name) {
  return args.includes(name);
}

function getFlagValue(args, name, fallback = undefined) {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] : fallback;
}

function parseBbox(value) {
  if (!value) return undefined;
  const parts = String(value).split(",").map((n) => Number(n.trim()));
  if (parts.length !== 4 || !parts.every(Number.isFinite)) {
    throw new Error(`Invalid --bbox value: ${value}. Expected minX,minY,maxX,maxY`);
  }
  return parts;
}

function parseProp(value) {
  if (!value) return undefined;
  const idx = value.indexOf("=");
  if (idx <= 0 || idx >= value.length - 1) {
    throw new Error(`Invalid --prop value: ${value}. Expected key=value`);
  }
  return { [value.slice(0, idx)]: value.slice(idx + 1) };
}

function outputResult(payload, asJson) {
  if (asJson) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  console.log(formatSummary(payload));
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
    const minZoom = Number(getFlagValue(rest, "--min-zoom", 4));
    const maxZoom = Number(getFlagValue(rest, "--max-zoom", 10));

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

  if (cmd === "stats") {
    const [input, ...rest] = args;
    if (!input) { usage(); process.exit(1); }
    const jsonOut = hasFlag(rest, "--json");
    const model = readJson(path.resolve(input));
    const payload = model?.schema === "navdata-canonical"
      ? summarizeDataset(model)
      : summarizeFeatures(model);
    outputResult(payload, jsonOut);
    return;
  }

  if (cmd === "inspect-airspace") {
    const [input, idOrToken, ...rest] = args;
    if (!input || !idOrToken) { usage(); process.exit(1); }
    const canonical = readCanonicalModel(path.resolve(input));
    const payload = inspectAirspace(canonical, idOrToken);
    outputResult(payload, hasFlag(rest, "--json"));
    return;
  }

  if (cmd === "inspect-airport") {
    const [input, idOrIdent, ...rest] = args;
    if (!input || !idOrIdent) { usage(); process.exit(1); }
    const canonical = readCanonicalModel(path.resolve(input));
    const payload = inspectAirport(canonical, idOrIdent);
    outputResult(payload, hasFlag(rest, "--json"));
    return;
  }

  if (cmd === "inspect-waypoint") {
    const [input, idOrIdent, ...rest] = args;
    if (!input || !idOrIdent) { usage(); process.exit(1); }
    const canonical = readCanonicalModel(path.resolve(input));
    const payload = inspectWaypoint(canonical, idOrIdent);
    outputResult(payload, hasFlag(rest, "--json"));
    return;
  }

  if (cmd === "query") {
    const [input, ...rest] = args;
    if (!input) { usage(); process.exit(1); }
    const model = readJson(path.resolve(input));
    const limitRaw = getFlagValue(rest, "--limit");
    const payload = queryEntities(model, {
      layer: getFlagValue(rest, "--layer"),
      type: getFlagValue(rest, "--type"),
      id: getFlagValue(rest, "--id"),
      bbox: parseBbox(getFlagValue(rest, "--bbox")),
      property: parseProp(getFlagValue(rest, "--prop")),
      limit: limitRaw !== undefined ? Number(limitRaw) : undefined
    });
    outputResult(payload, hasFlag(rest, "--json"));
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
