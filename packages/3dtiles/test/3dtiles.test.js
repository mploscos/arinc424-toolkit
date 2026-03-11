import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { build3DTilesFromFeatures } from "../src/index.js";

test("build3DTilesFromFeatures rejects models without airspaces", () => {
  assert.throws(() => build3DTilesFromFeatures({
    schema: "arinc-feature-model",
    features: []
  }, { outDir: "/tmp/never" }));
});

test("build3DTilesFromFeatures consumes feature model input", () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "arinc-3d-out-"));
  const featureModel = {
    schema: "arinc-feature-model",
    schemaVersion: "1.0.0",
    metadata: {},
    features: [
      {
        id: "asp:1",
        layer: "airspaces",
        geometry: {
          type: "Polygon",
          coordinates: [[[-73.9, 40.5], [-73.8, 40.5], [-73.8, 40.6], [-73.9, 40.6], [-73.9, 40.5]]]
        },
        bbox: [-73.9, 40.5, -73.8, 40.6],
        minZoom: 4,
        maxZoom: 12,
        sourceRefs: [],
        properties: {
          id: "asp:1",
          type: "airspace",
          source: "TEST",
          sourceRefs: [{}],
          createdFrom: { canonicalSchema: "navdata-canonical", canonicalVersion: "1.0.0", entityType: "airspace", entityId: "asp:1" },
          airspaceClass: "C",
          lowerLimit: 0,
          upperLimit: 1000
        }
      }
    ]
  };

  const result = build3DTilesFromFeatures(featureModel, { outDir, mode: "geojson" });
  assert.equal(result.outDir, outDir);
  assert.ok(fs.existsSync(path.join(outDir, "airspace-extrusion.geojson")));
});
