import test from "node:test";
import assert from "node:assert/strict";
import { buildFeaturesFromCanonical, validateFeatureModel } from "../src/index.js";

const sourceRef = { recordType: "EA", lineNumber: 1, entityType: "waypoints", entityId: "x" };

const canonical = {
  schema: "navdata-canonical",
  schemaVersion: "1.0.0",
  metadata: { source: "FAA-CIFP", generatedAt: null },
  entities: {
    airports: [{ id: "airport:US:KJFK", type: "airport", ident: "KJFK", icao: "US", coord: [-73.77, 40.64], sourceRefs: [{ ...sourceRef, entityType: "airports", entityId: "airport:US:KJFK" }] }],
    heliports: [],
    runways: [],
    waypoints: [{ id: "waypoint:EA:US:K2:DIXIE", type: "waypoint", ident: "DIXIE", coord: [-73.1, 40.2], sourceRefs: [{ ...sourceRef, entityType: "waypoints", entityId: "waypoint:EA:US:K2:DIXIE" }] }],
    navaids: [],
    airways: [],
    airspaces: [],
    procedures: [],
    holds: []
  }
};

test("buildFeaturesFromCanonical emits normalized features", () => {
  const model = buildFeaturesFromCanonical(canonical);
  validateFeatureModel(model);
  assert.equal(model.schema, "arinc-feature-model");
  assert.equal(model.features.length, 2);
  assert.ok(model.features.some((f) => f.layer === "airports"));
  assert.ok(model.features.some((f) => f.layer === "waypoints"));
  assert.equal(model.metadata.generatedAt, null);
});

test("validateFeatureModel fails on layer/type mismatch", () => {
  assert.throws(() => validateFeatureModel({
    schema: "arinc-feature-model",
    features: [{
      id: "x",
      layer: "runways",
      geometry: { type: "Point", coordinates: [0, 0] },
      properties: { id: "x", type: "waypoint", source: "S", sourceRefs: [{}], createdFrom: { canonicalSchema: "navdata-canonical" }, airportId: "a", runwayDesignator: "01" },
      bbox: [0, 0, 0, 0]
    }]
  }));
});
