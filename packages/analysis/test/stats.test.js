import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { parseArincText } from "@arinc424/core";
import { buildFeaturesFromCanonical } from "@arinc424/features";
import { summarizeDataset, summarizeFeatures } from "../src/index.js";

import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

test("summarizeDataset returns deterministic canonical counts", async () => {
  const fixture = fs.readFileSync(path.join(root, "test/fixtures/minimal-airport.arinc"), "utf8");
  const canonical = await parseArincText(fixture, { generatedAt: null });

  const summary = summarizeDataset(canonical);
  assert.equal(summary.kind, "canonical");
  assert.deepEqual(summary.entityCounts, {
    airports: 1,
    heliports: 0,
    runways: 1,
    waypoints: 1,
    navaids: 0,
    airways: 0,
    airspaces: 0,
    procedures: 0,
    holds: 0
  });
});

test("summarizeFeatures reports layers and geometry types", async () => {
  const fixture = fs.readFileSync(path.join(root, "test/fixtures/airway-network.arinc"), "utf8");
  const canonical = await parseArincText(fixture, { generatedAt: null });
  const featureModel = buildFeaturesFromCanonical(canonical, { generatedAt: null });

  const summary = summarizeFeatures(featureModel);
  assert.equal(summary.kind, "features");
  assert.equal(summary.totalFeatures, featureModel.features.length);
  assert.equal(summary.layerCounts.airways, 1);
  assert.ok(summary.geometryCounts.Point >= 1);
  assert.ok(summary.geometryCounts.LineString >= 1);
  assert.ok(Array.isArray(summary.bounds));
  assert.equal(summary.bounds.length, 4);
});
