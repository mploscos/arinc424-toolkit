import test from "node:test";
import assert from "node:assert/strict";
import { reconstructAirspaceBoundary } from "../src/parsing/airspace-boundary.js";

function baseSegment(seq, lon, lat, via = "G") {
  return { seq, lon, lat, boundaryVia: via };
}

test("reconstructAirspaceBoundary builds valid simple polygon (G)", () => {
  const segs = [
    baseSegment(1, -3.0, 40.0, "G"),
    baseSegment(2, -2.9, 40.0, "G"),
    baseSegment(3, -2.9, 40.1, "E")
  ];
  const out = reconstructAirspaceBoundary(segs);
  assert.equal(out.errors.length, 0);
  assert.ok(out.coordinates.length >= 4);
  const first = out.coordinates[0];
  const last = out.coordinates[out.coordinates.length - 1];
  assert.deepEqual(first, last);
});

test("reconstructAirspaceBoundary builds clockwise arc (R) with interpolation", () => {
  const segs = [
    { ...baseSegment(1, 0.0, 0.0, "R"), arcLon: 0.0, arcLat: 1.0, arcDistance: 60 },
    baseSegment(2, 1.0, 1.0, "E")
  ];
  const out = reconstructAirspaceBoundary(segs, { maxArcStepDeg: 5 });
  assert.equal(out.errors.length, 0);
  const arcMeta = out.segmentMetadata.find((m) => m.via === "R");
  assert.ok(arcMeta);
  assert.ok(arcMeta.vertexCount > 2);
});

test("reconstructAirspaceBoundary builds counter-clockwise arc (L) with interpolation", () => {
  const segs = [
    { ...baseSegment(1, 1.0, 1.0, "L"), arcLon: 0.0, arcLat: 1.0, arcDistance: 60 },
    baseSegment(2, 0.0, 0.0, "E")
  ];
  const out = reconstructAirspaceBoundary(segs, { maxArcStepDeg: 5 });
  assert.equal(out.errors.length, 0);
  const arcMeta = out.segmentMetadata.find((m) => m.via === "L");
  assert.ok(arcMeta);
  assert.ok(arcMeta.vertexCount > 2);
});

test("reconstructAirspaceBoundary reports missing arc origin", () => {
  const segs = [
    { ...baseSegment(1, 0.0, 0.0, "R"), arcDistance: 20 },
    baseSegment(2, 0.5, 0.2, "E")
  ];
  const out = reconstructAirspaceBoundary(segs);
  assert.ok(out.errors.some((e) => e.includes("missing center fix")));
});

test("reconstructAirspaceBoundary supports E closing to origin", () => {
  const segs = [
    baseSegment(1, -1.0, 1.0, "G"),
    baseSegment(2, -0.5, 1.0, "E")
  ];
  const out = reconstructAirspaceBoundary(segs);
  assert.equal(out.errors.length, 0);
  const first = out.coordinates[0];
  const last = out.coordinates[out.coordinates.length - 1];
  assert.deepEqual(first, last);
});
