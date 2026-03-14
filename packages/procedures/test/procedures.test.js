import test from "node:test";
import assert from "node:assert/strict";
import { buildProcedureGeometry, decodeProcedureLegs } from "../src/index.js";

function canonicalWithProcedure(legs, fixes) {
  return {
    schema: "navdata-canonical",
    schemaVersion: "1.0.0",
    metadata: { source: "TEST", generatedAt: null },
    entities: {
      airports: [],
      heliports: [],
      runways: [],
      navaids: [],
      airways: [],
      airspaces: [],
      holds: [],
      waypoints: fixes.map((fix) => ({ id: fix.id, coord: fix.coord })),
      procedures: [{
        id: "procedure:test:1",
        type: "procedure",
        procedureType: "PD",
        airportId: "airport:test",
        transitionId: "RW01",
        legs
      }]
    }
  };
}

test("decodeProcedureLegs preserves supported and unsupported legs", () => {
  const canonical = canonicalWithProcedure(
    [
      { seq: 1, pathTerm: "IF", fixId: "fix:1", fixRawId: "FIX1" },
      { seq: 2, pathTerm: "ZZ", fixId: "fix:2", fixRawId: "FIX2" }
    ],
    [
      { id: "fix:1", coord: [1, 2] },
      { id: "fix:2", coord: [3, 4] }
    ]
  );

  const decoded = decodeProcedureLegs(canonical, "procedure:test:1");
  assert.equal(decoded.legs[0].supported, true);
  assert.equal(decoded.legs[1].supported, false);
  assert.match(decoded.warnings[0], /Unsupported path terminator ZZ/);
});

test("buildProcedureGeometry supports IF + TF + CF chain", () => {
  const canonical = canonicalWithProcedure(
    [
      { seq: 1, pathTerm: "IF", fixId: "fix:1", fixRawId: "FIX1" },
      { seq: 2, pathTerm: "TF", fixId: "fix:2", fixRawId: "FIX2" },
      { seq: 3, pathTerm: "CF", fixId: "fix:3", fixRawId: "FIX3" }
    ],
    [
      { id: "fix:1", coord: [1, 2] },
      { id: "fix:2", coord: [3, 4] },
      { id: "fix:3", coord: [5, 6] }
    ]
  );

  const built = buildProcedureGeometry(canonical, "procedure:test:1");
  assert.equal(built.legs.length, 3);
  assert.equal(built.geometry.type, "MultiLineString");
  assert.equal(built.legs[0].geometry.type, "Point");
  assert.equal(built.legs[1].geometry.type, "LineString");
  assert.equal(built.legs[2].geometry.type, "LineString");
  assert.ok(built.warnings.some((item) => /CF leg approximated/.test(item)));
  assert.ok(!built.warnings.some((item) => /Geometry discontinuity detected/.test(item)));
  const tfEnd = built.legs[1].geometry.coordinates.at(-1);
  const cfStart = built.legs[2].geometry.coordinates[0];
  assert.deepEqual(tfEnd, cfStart);
});

test("buildProcedureGeometry supports direct-to-fix", () => {
  const canonical = canonicalWithProcedure(
    [
      { seq: 1, pathTerm: "IF", fixId: "fix:1", fixRawId: "FIX1" },
      { seq: 2, pathTerm: "DF", fixId: "fix:2", fixRawId: "FIX2" }
    ],
    [
      { id: "fix:1", coord: [1, 2] },
      { id: "fix:2", coord: [4, 8] }
    ]
  );

  const built = buildProcedureGeometry(canonical, "procedure:test:1");
  assert.equal(built.geometry.type, "LineString");
  assert.deepEqual(built.geometry.coordinates, [[1, 2], [4, 8]]);
  assert.ok(!built.warnings.some((item) => /Geometry discontinuity detected/.test(item)));
});

test("buildProcedureGeometry supports IF + TF + DF continuity", () => {
  const canonical = canonicalWithProcedure(
    [
      { seq: 1, pathTerm: "IF", fixId: "fix:1", fixRawId: "FIX1" },
      { seq: 2, pathTerm: "TF", fixId: "fix:2", fixRawId: "FIX2" },
      { seq: 3, pathTerm: "DF", fixId: "fix:3", fixRawId: "FIX3" }
    ],
    [
      { id: "fix:1", coord: [1, 2] },
      { id: "fix:2", coord: [3, 4] },
      { id: "fix:3", coord: [6, 9] }
    ]
  );

  const built = buildProcedureGeometry(canonical, "procedure:test:1");
  assert.equal(built.geometry.type, "MultiLineString");
  assert.ok(!built.warnings.some((item) => /Geometry discontinuity detected/.test(item)));
  assert.deepEqual(built.legs[1].geometry.coordinates.at(-1), built.legs[2].geometry.coordinates[0]);
  assert.deepEqual(built.legs[1].geometry.coordinates, [[1, 2], [3, 4]]);
  assert.deepEqual(built.legs[2].geometry.coordinates, [[3, 4], [6, 9]]);
});

test("buildProcedureGeometry supports IF + TF + CF + DF continuity", () => {
  const canonical = canonicalWithProcedure(
    [
      { seq: 1, pathTerm: "IF", fixId: "fix:1", fixRawId: "FIX1" },
      { seq: 2, pathTerm: "TF", fixId: "fix:2", fixRawId: "FIX2" },
      { seq: 3, pathTerm: "CF", fixId: "fix:3", fixRawId: "FIX3" },
      { seq: 4, pathTerm: "DF", fixId: "fix:4", fixRawId: "FIX4" }
    ],
    [
      { id: "fix:1", coord: [1, 2] },
      { id: "fix:2", coord: [3, 4] },
      { id: "fix:3", coord: [5, 6] },
      { id: "fix:4", coord: [7, 8] }
    ]
  );

  const built = buildProcedureGeometry(canonical, "procedure:test:1");
  assert.equal(built.geometry.type, "MultiLineString");
  assert.ok(!built.warnings.some((item) => /Geometry discontinuity detected/.test(item)));
  assert.deepEqual(built.legs[1].geometry.coordinates.at(-1), built.legs[2].geometry.coordinates[0]);
  assert.deepEqual(built.legs[2].geometry.coordinates.at(-1), built.legs[3].geometry.coordinates[0]);
});
