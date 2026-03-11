import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { validateAirspaceGeometry, parseArincText } from "../src/index.js";

test("validateAirspaceGeometry accepts valid closed airspace", () => {
  const airspace = {
    lowerLimitM: 0,
    upperLimitM: 3000,
    coordinates: [
      [-3.0, 40.0],
      [-2.9, 40.0],
      [-2.9, 40.1],
      [-3.0, 40.0]
    ],
    segments: [
      { seq: 1, lon: -3.0, lat: 40.0, boundaryVia: "G" },
      { seq: 2, lon: -2.9, lat: 40.0, boundaryVia: "G" },
      { seq: 3, lon: -2.9, lat: 40.1, boundaryVia: "E" }
    ]
  };
  const result = validateAirspaceGeometry(airspace);
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
});

test("validateAirspaceGeometry detects missing arc center", () => {
  const airspace = {
    lowerLimitM: 0,
    upperLimitM: 1000,
    coordinates: [
      [-3.0, 40.0],
      [-2.9, 40.0],
      [-2.9, 40.1],
      [-3.0, 40.0]
    ],
    segments: [
      { seq: 1, lon: -3.0, lat: 40.0, boundaryVia: "R", arcDistance: 5 },
      { seq: 2, lon: -2.9, lat: 40.0, boundaryVia: "G" },
      { seq: 3, lon: -2.9, lat: 40.1, boundaryVia: "G" }
    ]
  };
  const result = validateAirspaceGeometry(airspace);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("Arc segment missing center fix")));
});

test("validateAirspaceGeometry detects invalid sequence", () => {
  const airspace = {
    lowerLimitM: 0,
    upperLimitM: 1000,
    coordinates: [
      [-3.0, 40.0],
      [-2.9, 40.0],
      [-2.9, 40.1],
      [-3.0, 40.0]
    ],
    segments: [
      { seq: 1, lon: -3.0, lat: 40.0, boundaryVia: "G" },
      { seq: 4, lon: -2.9, lat: 40.0, boundaryVia: "G" },
      { seq: 5, lon: -2.9, lat: 40.1, boundaryVia: "G" }
    ]
  };
  const result = validateAirspaceGeometry(airspace);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("Segment continuity break at seq=1")));
});

test("validateAirspaceGeometry detects open polygon", () => {
  const airspace = {
    lowerLimitM: 0,
    upperLimitM: 1000,
    coordinates: [
      [-3.0, 40.0],
      [-2.9, 40.0],
      [-2.9, 40.1]
    ],
    segments: [
      { seq: 1, lon: -3.0, lat: 40.0, boundaryVia: "G" },
      { seq: 2, lon: -2.9, lat: 40.0, boundaryVia: "G" },
      { seq: 3, lon: -2.9, lat: 40.1, boundaryVia: "G" }
    ]
  };
  const result = validateAirspaceGeometry(airspace);
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => e.includes("Open polygon"))
      || result.errors.some((e) => e.includes("Insufficient coordinates to form closed polygon"))
  );
});

test("parseArincText optional airspace geometry validation callback receives UC/UR results", async () => {
  const fixturePath = path.resolve(process.cwd(), "../../test/fixtures/airspace.arinc");
  const text = fs.readFileSync(fixturePath, "utf8");

  const hits = [];
  await parseArincText(text, {
    validateAirspaceGeometry: true,
    onAirspaceValidationResult: (x) => hits.push(x)
  });
  assert.ok(hits.length >= 1);
  assert.ok(hits.every((h) => h.kind === "UC" || h.kind === "UR"));
});

test("validateAirspaceGeometry emits warning for partially supported A segments", () => {
  const airspace = {
    lowerLimitM: 0,
    upperLimitM: 1000,
    coordinates: [
      [-3.0, 40.0],
      [-2.9, 40.0],
      [-2.9, 40.1],
      [-3.0, 40.0]
    ],
    segments: [
      { seq: 1, lon: -3.0, lat: 40.0, boundaryVia: "A", arcDistance: 2, arcLon: -3.1, arcLat: 40.1 },
      { seq: 2, lon: -2.9, lat: 40.0, boundaryVia: "E" }
    ]
  };
  const result = validateAirspaceGeometry(airspace);
  assert.ok(result.warnings.some((w) => w.includes("BoundaryVia A partially supported")));
});
