import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { generateTiles } from "../src/index.js";

test("generateTiles writes z/x/y tiles", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "arinc-tiles-"));
  const model = {
    schema: "arinc-feature-model",
    schemaVersion: "1.0.0",
    metadata: {},
    features: [
      {
        id: "wpt:DIXIE",
        layer: "waypoints",
        geometry: { type: "Point", coordinates: [-73.1, 40.2] },
        properties: { id: "wpt:DIXIE", type: "waypoint" },
        bbox: [-73.1, 40.2, -73.1, 40.2],
        minZoom: 4,
        maxZoom: 6,
        sourceRefs: []
      }
    ]
  };
  const { tileCount, manifest } = generateTiles(model, { outDir: tmp, minZoom: 4, maxZoom: 4 });
  assert.ok(tileCount > 0);
  assert.equal(manifest.minZoom, 4);
  assert.equal(manifest.generatedAt, null);
  assert.equal(manifest.simplify, false);
});

test("generateTiles clips line geometries to tile bounds", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "arinc-tiles-clip-"));
  const model = {
    schema: "arinc-feature-model",
    schemaVersion: "1.0.0",
    metadata: {},
    features: [
      {
        id: "line:1",
        layer: "airways",
        geometry: { type: "LineString", coordinates: [[-170, 0], [170, 0]] },
        properties: { id: "line:1", type: "airway", source: "T", sourceRefs: [{}], createdFrom: { canonicalSchema: "navdata-canonical" }, airwayName: "L1" },
        bbox: [-170, 0, 170, 0],
        minZoom: 1,
        maxZoom: 1,
        sourceRefs: []
      }
    ]
  };

  generateTiles(model, { outDir: tmp, minZoom: 1, maxZoom: 1 });
  const tileFile = path.join(tmp, "1/0/1.json");
  const fc = JSON.parse(fs.readFileSync(tileFile, "utf8"));
  const coords = fc.features[0].geometry.coordinates;
  assert.ok(coords[0][0] <= 0 && coords[coords.length - 1][0] <= 0);
});

test("generateTiles applies zoom simplification when enabled", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "arinc-tiles-simplify-"));
  const line = [];
  for (let i = 0; i <= 80; i++) {
    line.push([-20 + i * 0.5, Math.sin(i / 2) * 0.4]);
  }
  const model = {
    schema: "arinc-feature-model",
    schemaVersion: "1.0.0",
    metadata: {},
    features: [
      {
        id: "line:simplify",
        layer: "airways",
        geometry: { type: "LineString", coordinates: line },
        properties: { id: "line:simplify", type: "airway", source: "T", sourceRefs: [{}], createdFrom: { canonicalSchema: "navdata-canonical" }, airwayName: "S1" },
        bbox: [-20, -1, 20, 1],
        minZoom: 4,
        maxZoom: 4,
        sourceRefs: []
      }
    ]
  };

  generateTiles(model, {
    outDir: tmp,
    minZoom: 4,
    maxZoom: 4,
    simplify: true,
    simplifyToleranceByZoom: { 4: 0.2 }
  });
  const zDir = path.join(tmp, "4");
  const xDirs = fs.readdirSync(zDir).sort();
  const firstX = xDirs[0];
  const yFile = fs.readdirSync(path.join(zDir, firstX)).find((f) => f.endsWith(".json"));
  const tileFile = path.join(zDir, firstX, yFile);
  const fc = JSON.parse(fs.readFileSync(tileFile, "utf8"));
  assert.ok(fc.features[0].geometry.coordinates.length < line.length);
});

test("generateTiles accepts legacy simplifyTolerance alias", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "arinc-tiles-simplify-alias-"));
  const model = {
    schema: "arinc-feature-model",
    schemaVersion: "1.0.0",
    metadata: {},
    features: [
      {
        id: "line:alias",
        layer: "airways",
        geometry: { type: "LineString", coordinates: [[-5, 0], [-4, 0.1], [-3, -0.1], [-2, 0.1], [-1, 0]] },
        properties: { id: "line:alias", type: "airway", source: "T", sourceRefs: [{}], createdFrom: { canonicalSchema: "navdata-canonical" }, airwayName: "A1" },
        bbox: [-5, -1, -1, 1],
        minZoom: 4,
        maxZoom: 4,
        sourceRefs: []
      }
    ]
  };

  const { manifest } = generateTiles(model, {
    outDir: tmp,
    minZoom: 4,
    maxZoom: 4,
    simplify: true,
    simplifyTolerance: { 4: 0.2 }
  });
  assert.deepEqual(manifest.simplifyTolerance, { 4: 0.2 });
});
