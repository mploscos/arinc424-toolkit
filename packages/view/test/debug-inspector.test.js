import test from "node:test";
import assert from "node:assert/strict";
import {
  extractAirspaceInspection,
  renderAirspaceInspectionHtml
} from "../src/debug/airspace-inspector.js";
import {
  extractArcCenters,
  extractSegmentPoints,
  computeGeometryStats
} from "../src/debug/geometry-debug-overlay.js";

function makeFeature(props, coords) {
  return {
    get: (k) => props[k],
    getProperties: () => ({ ...props }),
    getGeometry: () => ({
      getCoordinates: () => coords
    })
  };
}

test("extractAirspaceInspection tolerates partial metadata", () => {
  const feature = makeFeature({
    id: "airspace:test",
    layer: "airspaces",
    type: "airspace",
    airspaceClass: "C",
    lowerLimit: 0,
    upperLimit: 3500,
    sourceRefs: [{ entityType: "airspaces", entityId: "airspace:test" }]
  }, [[[-3, 40], [-2, 40], [-2, 41], [-3, 41], [-3, 40]]]);
  const info = extractAirspaceInspection(feature);
  assert.equal(info.id, "airspace:test");
  assert.equal(info.classification, "C");
  assert.equal(info.sourceRefs.length, 1);
  const html = renderAirspaceInspectionHtml(info);
  assert.match(html, /Airspace ID/);
});

test("geometry debug extractors parse points and centers", () => {
  const feature = makeFeature({
    layer: "airspaces",
    reconstructionMetadata: {
      segmentMetadata: [{ via: "R", center: [-2.5, 40.5] }]
    }
  }, [[[-3, 40], [-2, 40], [-2, 41], [-3, 41], [-3, 40]]]);
  const centers = extractArcCenters(feature);
  const points = extractSegmentPoints(feature);
  const stats = computeGeometryStats(feature);

  assert.equal(centers.length, 1);
  assert.ok(points.length >= 4);
  assert.equal(stats.arcCenterCount, 1);
});
