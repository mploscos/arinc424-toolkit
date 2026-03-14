import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArincText } from "@arinc424/core";
import { buildFeaturesFromCanonical } from "@arinc424/features";
import { buildGeoJSONLayers, generateTiles } from "@arinc424/tiles";
import { build3DTilesFromFeatures } from "@arinc424/3dtiles";
import { hdr, pa, pg, ea, d, uc, pd, er, writeFixture } from "../test/helpers/arinc-line-builder.js";

const root = process.cwd();
const fixturesDir = path.join(root, "test/fixtures");
const goldenDir = path.join(root, "test/golden");

fs.mkdirSync(fixturesDir, { recursive: true });

function stableStringify(value) {
  return JSON.stringify(value, null, 2) + "\n";
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, stableStringify(value), "utf8");
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function buildFixtures() {
  const fixtures = {};

  fixtures["minimal-airport"] = [
    hdr("HDR FAACIFP MINIMAL-AIRPORT"),
    pa({
      id: "KMIN",
      icao: "US",
      name: "Minimal Intl",
      lat: "N40450000",
      lon: "W073460000",
      elevationFt: "00010"
    }),
    pg({
      airportId: "KMIN",
      icao: "US",
      runwayId: "04L  ",
      lat: "N40445000",
      lon: "W073455000",
      lengthFt: "08000",
      bearing: "044",
      elevationFt: "00009",
      widthFt: "150",
      name: "RWY 04L"
    }),
    ea({
      id: "MIN1 ",
      region: "K2  ",
      icao: "US",
      type: "WPT",
      usage: "E",
      lat: "N40400000",
      lon: "W073300000",
      name: "MIN FIX 1"
    })
  ];

  fixtures["airway-network"] = [
    hdr("HDR FAACIFP AIRWAY-NETWORK"),
    ea({ id: "DIXIE", region: "K2  ", icao: "US", type: "WPT", usage: "E", lat: "N40400000", lon: "W073100000", name: "DIXIE" }),
    ea({ id: "MERIT", region: "K2  ", icao: "US", type: "WPT", usage: "E", lat: "N41000000", lon: "W072000000", name: "MERIT" }),
    ea({ id: "HFD  ", region: "K2  ", icao: "US", type: "WPT", usage: "E", lat: "N41350000", lon: "W072400000", name: "HFD" }),
    d({ id: "DPK ", icao: "US", lat: "N40470000", lon: "W073280000", frequency: "11790", klass: "V ", classDetail: "TAC", magVar: "W0100", name: "DEER PARK" }),
    er({ cont: "1", route: "J75  ", seq: "0001", fixId: "DIXIE", icao: "US", fixSection: "EA", routeType: "J", level: "L", minAlt: "05000", maxAlt: "18000" }),
    er({ cont: "1", route: "J75  ", seq: "0002", fixId: "MERIT", icao: "US", fixSection: "EA", routeType: "J", level: "L", minAlt: "05000", maxAlt: "18000" }),
    er({ cont: "1", route: "J75  ", seq: "0003", fixId: "HFD  ", icao: "US", fixSection: "EA", routeType: "J", level: "L", minAlt: "05000", maxAlt: "18000" })
  ];

  fixtures["airspace"] = [
    hdr("HDR FAACIFP AIRSPACE"),
    uc({ cont: "1", icao: "US", airspaceType: "C", airspaceCenter: "NYC  ", classification: "C", multipleCode: "A", seq: "0001", boundaryVia: "G ", lat: "N40400000", lon: "W074000000", lowerLimit: "00000", lowerUnit: "A", upperLimit: "10000", upperUnit: "A", name: "TEST CLASS C" }),
    uc({ cont: "1", icao: "US", airspaceType: "C", airspaceCenter: "NYC  ", classification: "C", multipleCode: "A", seq: "0002", boundaryVia: "G ", lat: "N40400000", lon: "W073400000", lowerLimit: "00000", lowerUnit: "A", upperLimit: "10000", upperUnit: "A", name: "TEST CLASS C" }),
    uc({ cont: "1", icao: "US", airspaceType: "C", airspaceCenter: "NYC  ", classification: "C", multipleCode: "A", seq: "0003", boundaryVia: "G ", lat: "N41000000", lon: "W073400000", lowerLimit: "00000", lowerUnit: "A", upperLimit: "10000", upperUnit: "A", name: "TEST CLASS C" })
  ];

  fixtures["procedure"] = [
    hdr("HDR FAACIFP PROCEDURE"),
    pa({ id: "KPRC", icao: "US", name: "Procedure Intl", lat: "N40300000", lon: "W073000000", elevationFt: "00020" }),
    ea({ id: "PRC1 ", region: "K2  ", icao: "US", type: "WPT", usage: "E", lat: "N40350000", lon: "W072500000", name: "PROC FIX 1" }),
    ea({ id: "PRC2 ", region: "K2  ", icao: "US", type: "WPT", usage: "E", lat: "N40400000", lon: "W072000000", name: "PROC FIX 2" }),
    pd({ cont: "1", airportId: "KPRC", icao: "US", procId: "PRC1  ", routeType: "1", transitionId: "RW04 ", seq: "001", fixId: "PRC1 ", fixIcao: "US", fixSection: "EA", pathTerm: "TF", turnDir: "R", altDesc: " ", alt1: "05000", alt2: "09000", speed: "250" }),
    pd({ cont: "1", airportId: "KPRC", icao: "US", procId: "PRC1  ", routeType: "1", transitionId: "RW04 ", seq: "002", fixId: "PRC2 ", fixIcao: "US", fixSection: "EA", pathTerm: "TF", turnDir: "R", altDesc: " ", alt1: "05000", alt2: "09000", speed: "250" })
  ];

  return fixtures;
}

async function generatePipelineGoldens(name, text) {
  const canonical = await parseArincText(text, { generatedAt: null });
  const features = buildFeaturesFromCanonical(canonical, { generatedAt: null });

  const out = path.join(goldenDir, name);
  fs.mkdirSync(out, { recursive: true });

  writeJson(path.join(out, "canonical.golden.json"), canonical);
  writeJson(path.join(out, "features.golden.json"), features);

  const layerDir = fs.mkdtempSync(path.join(os.tmpdir(), `arinc-golden-layers-${name}-`));
  const tileDir = fs.mkdtempSync(path.join(os.tmpdir(), `arinc-golden-tiles-${name}-`));

  const layers = buildGeoJSONLayers(features, { outDir: layerDir });
  const { manifest } = generateTiles(features, { outDir: tileDir, minZoom: 4, maxZoom: 10, generatedAt: null });

  writeJson(path.join(out, "tiles.manifest.golden.json"), manifest);

  const relTiles = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (entry.name.endsWith(".json")) relTiles.push(path.relative(dir, abs));
    }
  };
  const gather = (dir) => {
    const files = [];
    const rec = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) rec(p);
        else if (e.name.endsWith(".json")) files.push(path.relative(dir, p));
      }
    };
    rec(dir);
    return files.sort();
  };
  const tileFiles = gather(tileDir);
  if (tileFiles.length > 0) {
    const first = tileFiles[0];
    writeJson(path.join(out, "tile.sample.golden.json"), readJson(path.join(tileDir, first)));
    writeJson(path.join(out, "tile.sample.index.json"), { file: first });
  }

  const layerFiles = layers.map((f) => path.basename(f)).sort();
  if (layerFiles.length > 0) {
    writeJson(path.join(out, "layer.sample.golden.json"), readJson(path.join(layerDir, layerFiles[0])));
    writeJson(path.join(out, "layer.sample.index.json"), { file: layerFiles[0] });
  }

  fs.rmSync(layerDir, { recursive: true, force: true });
  fs.rmSync(tileDir, { recursive: true, force: true });

  return { canonical, features };
}

async function generate3dGoldenFromAirspace(features) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "arinc-golden-3d-"));
  build3DTilesFromFeatures(features, { outDir: out, mode: "tileset" });
  const tileset = readJson(path.join(out, "tileset.json"));
  const summary = {
    assetVersion: tileset.asset?.version ?? null,
    geometricError: tileset.geometricError ?? null,
    rootHasContent: Boolean(tileset.root?.content?.uri),
    rootChildren: Array.isArray(tileset.root?.children) ? tileset.root.children.length : 0,
    hasBoundingVolume: Boolean(tileset.root?.boundingVolume)
  };
  writeJson(path.join(goldenDir, "3dtiles", "tileset.summary.golden.json"), summary);
  fs.rmSync(out, { recursive: true, force: true });
}

async function main() {
  const fixtures = buildFixtures();

  for (const [name, lines] of Object.entries(fixtures)) {
    const fixturePath = path.join(fixturesDir, `${name}.arinc`);
    writeFixture(fixturePath, lines);
    const text = fs.readFileSync(fixturePath, "utf8");
    const { features } = await generatePipelineGoldens(name, text);
    if (name === "airspace") await generate3dGoldenFromAirspace(features);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
