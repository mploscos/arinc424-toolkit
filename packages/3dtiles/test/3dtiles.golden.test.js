import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { build3DTilesFromFeatures } from "../src/index.js";

function summarizeTileset(tileset) {
  return {
    assetVersion: tileset.asset?.version ?? null,
    geometricError: tileset.geometricError ?? null,
    rootHasContent: Boolean(tileset.root?.content?.uri),
    rootChildren: Array.isArray(tileset.root?.children) ? tileset.root.children.length : 0,
    hasBoundingVolume: Boolean(tileset.root?.boundingVolume)
  };
}

test("3dtiles tileset summary matches golden", () => {
  const root = path.resolve(process.cwd(), "../../");
  const featureModel = JSON.parse(fs.readFileSync(path.join(root, "test/golden/airspace/features.golden.json"), "utf8"));
  const golden = JSON.parse(fs.readFileSync(path.join(root, "test/golden/3dtiles/tileset.summary.golden.json"), "utf8"));

  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "arinc-3d-golden-"));
  build3DTilesFromFeatures(featureModel, { outDir, mode: "tileset" });
  const tileset = JSON.parse(fs.readFileSync(path.join(outDir, "tileset.json"), "utf8"));
  assert.deepEqual(summarizeTileset(tileset), golden);
  fs.rmSync(outDir, { recursive: true, force: true });
});
