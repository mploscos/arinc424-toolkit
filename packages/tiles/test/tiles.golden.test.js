import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildGeoJSONLayers, generateTiles } from "../src/index.js";

const FIXTURES = ["minimal-airport", "airway-network", "airspace", "procedure"];

for (const name of FIXTURES) {
  test(`tiles golden manifest/sample matches for ${name}`, () => {
    const root = path.resolve(process.cwd(), "../../");
    const featureModel = JSON.parse(fs.readFileSync(path.join(root, "test/golden", name, "features.golden.json"), "utf8"));
    const goldenManifest = JSON.parse(fs.readFileSync(path.join(root, "test/golden", name, "tiles.manifest.golden.json"), "utf8"));
    const goldenTile = JSON.parse(fs.readFileSync(path.join(root, "test/golden", name, "tile.sample.golden.json"), "utf8"));
    const goldenTileIndex = JSON.parse(fs.readFileSync(path.join(root, "test/golden", name, "tile.sample.index.json"), "utf8"));
    const goldenLayer = JSON.parse(fs.readFileSync(path.join(root, "test/golden", name, "layer.sample.golden.json"), "utf8"));
    const goldenLayerIndex = JSON.parse(fs.readFileSync(path.join(root, "test/golden", name, "layer.sample.index.json"), "utf8"));

    const outLayers = fs.mkdtempSync(path.join(os.tmpdir(), `arinc-layers-${name}-`));
    const outTiles = fs.mkdtempSync(path.join(os.tmpdir(), `arinc-tiles-${name}-`));

    buildGeoJSONLayers(featureModel, { outDir: outLayers });
    const { manifest } = generateTiles(featureModel, { outDir: outTiles, minZoom: 4, maxZoom: 10, generatedAt: null });

    assert.deepEqual(manifest, goldenManifest);
    const layerOut = JSON.parse(fs.readFileSync(path.join(outLayers, goldenLayerIndex.file), "utf8"));
    const tileOut = JSON.parse(fs.readFileSync(path.join(outTiles, goldenTileIndex.file), "utf8"));
    assert.deepEqual(layerOut, goldenLayer);
    assert.deepEqual(tileOut, goldenTile);

    fs.rmSync(outLayers, { recursive: true, force: true });
    fs.rmSync(outTiles, { recursive: true, force: true });
  });
}
