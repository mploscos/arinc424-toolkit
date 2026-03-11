import test from "node:test";
import assert from "node:assert/strict";
import { buildFeaturesFromCanonical } from "@arinc/features";

test("workspace package resolution works", () => {
  const canonical = {
    schema: "navdata-canonical",
    schemaVersion: "1.0.0",
    metadata: { source: "TEST", generatedAt: new Date().toISOString() },
    entities: { airports: [], heliports: [], runways: [], waypoints: [], navaids: [], airways: [], airspaces: [], procedures: [], holds: [] }
  };
  const model = buildFeaturesFromCanonical(canonical);
  assert.equal(model.schema, "arinc-feature-model");
});
