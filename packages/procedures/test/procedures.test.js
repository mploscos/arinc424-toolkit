import test from "node:test";
import assert from "node:assert/strict";
import { buildProcedureGeometry, buildProcedureLegFeatureCollection, decodeProcedureLegs } from "../src/index.js";

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

test("buildProcedureGeometry supports simple RF leg", () => {
  const canonical = canonicalWithProcedure(
    [
      { seq: 1, pathTerm: "IF", fixId: "fix:start", fixRawId: "STRT" },
      { seq: 2, pathTerm: "RF", fixId: "fix:end", fixRawId: "END", centerFixId: "fix:center", centerFixRawId: "CTR", arcRadiusNm: 60, turnDir: "R" }
    ],
    [
      { id: "fix:start", coord: [0, 0] },
      { id: "fix:end", coord: [1, 1] },
      { id: "fix:center", coord: [0, 1] }
    ]
  );

  const built = buildProcedureGeometry(canonical, "procedure:test:1");
  assert.equal(built.legs[1].geometry.type, "LineString");
  assert.ok(built.legs[1].geometry.coordinates.length > 2);
  assert.equal(built.legs[1].metadata.legType, "RF");
});

test("buildProcedureGeometry decodes RF raw radius field as suppressed thousandths", () => {
  const radiusNm = 2.07;
  const delta = radiusNm / 60;
  const canonical = canonicalWithProcedure(
    [
      { seq: 1, pathTerm: "IF", fixId: "fix:start", fixRawId: "STRT" },
      { seq: 2, pathTerm: "RF", fixId: "fix:end", fixRawId: "END", centerFixId: "fix:center", centerFixRawId: "CTR", arcRadiusRaw: "002070", turnDir: "L" }
    ],
    [
      { id: "fix:start", coord: [0, -delta] },
      { id: "fix:end", coord: [delta, 0] },
      { id: "fix:center", coord: [0, 0] }
    ]
  );

  const built = buildProcedureGeometry(canonical, "procedure:test:1");
  const rf = built.legs[1];
  assert.equal(rf.metadata.legType, "RF");
  assert.equal(rf.metadata.radiusNm, 2.07);
  assert.equal(rf.metadata.radiusDebug.rawRadiusField, "002070");
  assert.ok(Math.abs(rf.metadata.radiusDebug.distanceCenterStartNm - 2.07) < 0.05);
  assert.ok(Math.abs(rf.metadata.radiusDebug.distanceCenterEndNm - 2.07) < 0.05);
  assert.ok(!built.warnings.some((item) => /RF leg 1 start does not match expected radius/.test(item)));
  assert.ok(!built.warnings.some((item) => /RF leg 1 end does not match expected radius/.test(item)));
  assert.ok(rf.geometry.coordinates.length > 2);
});

test("buildProcedureGeometry supports simple AF leg", () => {
  const canonical = canonicalWithProcedure(
    [
      { seq: 1, pathTerm: "IF", fixId: "fix:start", fixRawId: "STRT" },
      { seq: 2, pathTerm: "AF", fixId: "fix:end", fixRawId: "END", centerFixId: "fix:center", centerFixRawId: "DME1", arcRadiusNm: 60, turnDir: "L" }
    ],
    [
      { id: "fix:start", coord: [0, 0] },
      { id: "fix:end", coord: [-1, 1] },
      { id: "fix:center", coord: [0, 1] }
    ]
  );

  const built = buildProcedureGeometry(canonical, "procedure:test:1");
  assert.equal(built.legs[1].geometry.type, "LineString");
  assert.ok(built.legs[1].geometry.coordinates.length > 2);
  assert.equal(built.legs[1].metadata.legType, "AF");
});

test("buildProcedureLegFeatureCollection preserves leg metadata for viewer debug", () => {
  const canonical = canonicalWithProcedure(
    [
      { seq: 1, pathTerm: "IF", fixId: "fix:start", fixRawId: "STRT" },
      { seq: 2, pathTerm: "TF", fixId: "fix:tf", fixRawId: "TF01" },
      { seq: 3, pathTerm: "CF", fixId: "fix:cf", fixRawId: "CF01" },
      { seq: 4, pathTerm: "DF", fixId: "fix:df", fixRawId: "DF01" },
      { seq: 5, pathTerm: "RF", fixId: "fix:rf", fixRawId: "RF01", centerFixId: "fix:center", centerFixRawId: "CTR", arcRadiusNm: 60, turnDir: "R" },
      { seq: 6, pathTerm: "AF", fixId: "fix:af", fixRawId: "AF01", centerFixId: "fix:center2", centerFixRawId: "DME1", arcRadiusNm: 60, turnDir: "L" }
    ],
    [
      { id: "fix:start", coord: [0, 0] },
      { id: "fix:tf", coord: [1, 0] },
      { id: "fix:cf", coord: [2, 0] },
      { id: "fix:df", coord: [3, 0] },
      { id: "fix:rf", coord: [4, 1] },
      { id: "fix:center", coord: [3, 1] },
      { id: "fix:af", coord: [3, 2] },
      { id: "fix:center2", coord: [4, 2] }
    ]
  );

  const collection = buildProcedureLegFeatureCollection(canonical);
  const byLegType = new Map(collection.features.map((feature) => [feature.properties.legType, feature]));
  assert.equal(byLegType.get("TF").properties.legIndex, 1);
  assert.equal(byLegType.get("CF").properties.legIndex, 2);
  assert.equal(byLegType.get("DF").properties.legIndex, 3);
  assert.equal(byLegType.get("RF").geometry.type, "LineString");
  assert.ok(byLegType.get("RF").geometry.coordinates.length > 2);
  assert.equal(byLegType.get("AF").geometry.type, "LineString");
  assert.ok(byLegType.get("AF").geometry.coordinates.length > 2);
  assert.equal(byLegType.get("AF").properties.layer, "procedure");
  assert.equal(byLegType.get("AF").properties.debugProcedureLeg, true);
});

test("buildProcedureGeometry supports IF + RF + TF chain", () => {
  const canonical = canonicalWithProcedure(
    [
      { seq: 1, pathTerm: "IF", fixId: "fix:start", fixRawId: "STRT" },
      { seq: 2, pathTerm: "RF", fixId: "fix:mid", fixRawId: "MID", centerFixId: "fix:center", centerFixRawId: "CTR", arcRadiusNm: 60, turnDir: "R" },
      { seq: 3, pathTerm: "TF", fixId: "fix:end", fixRawId: "END" }
    ],
    [
      { id: "fix:start", coord: [0, 0] },
      { id: "fix:mid", coord: [1, 1] },
      { id: "fix:end", coord: [2, 1] },
      { id: "fix:center", coord: [0, 1] }
    ]
  );

  const built = buildProcedureGeometry(canonical, "procedure:test:1");
  assert.equal(built.geometry.type, "MultiLineString");
  assert.ok(!built.warnings.some((item) => /Geometry discontinuity detected/.test(item)));
  assert.deepEqual(built.legs[1].geometry.coordinates.at(-1), built.legs[2].geometry.coordinates[0]);
});

test("buildProcedureGeometry supports IF + AF + TF chain", () => {
  const canonical = canonicalWithProcedure(
    [
      { seq: 1, pathTerm: "IF", fixId: "fix:start", fixRawId: "STRT" },
      { seq: 2, pathTerm: "AF", fixId: "fix:mid", fixRawId: "MID", centerFixId: "fix:center", centerFixRawId: "DME1", arcRadiusNm: 60, turnDir: "L" },
      { seq: 3, pathTerm: "TF", fixId: "fix:end", fixRawId: "END" }
    ],
    [
      { id: "fix:start", coord: [0, 0] },
      { id: "fix:mid", coord: [-1, 1] },
      { id: "fix:end", coord: [-2, 1] },
      { id: "fix:center", coord: [0, 1] }
    ]
  );

  const built = buildProcedureGeometry(canonical, "procedure:test:1");
  assert.equal(built.geometry.type, "MultiLineString");
  assert.ok(!built.warnings.some((item) => /Geometry discontinuity detected/.test(item)));
  assert.deepEqual(built.legs[1].geometry.coordinates.at(-1), built.legs[2].geometry.coordinates[0]);
});

test("buildProcedureGeometry warns when RF center or radius metadata is missing", () => {
  const canonical = canonicalWithProcedure(
    [
      { seq: 1, pathTerm: "IF", fixId: "fix:start", fixRawId: "STRT" },
      { seq: 2, pathTerm: "RF", fixId: "fix:end", fixRawId: "END" }
    ],
    [
      { id: "fix:start", coord: [0, 0] },
      { id: "fix:end", coord: [1, 1] }
    ]
  );

  const built = buildProcedureGeometry(canonical, "procedure:test:1");
  assert.ok(built.warnings.some((item) => /RF leg 1 could not be built/.test(item)));
});

test("buildProcedureGeometry warns when AF radius is inconsistent with geometry", () => {
  const canonical = canonicalWithProcedure(
    [
      { seq: 1, pathTerm: "IF", fixId: "fix:start", fixRawId: "STRT" },
      { seq: 2, pathTerm: "AF", fixId: "fix:end", fixRawId: "END", centerFixId: "fix:center", centerFixRawId: "DME1", arcRadiusNm: 5, turnDir: "L" }
    ],
    [
      { id: "fix:start", coord: [0, 0] },
      { id: "fix:end", coord: [-1, 1] },
      { id: "fix:center", coord: [0, 1] }
    ]
  );

  const built = buildProcedureGeometry(canonical, "procedure:test:1");
  assert.ok(built.warnings.some((item) => /AF leg 1 start does not match expected radius/.test(item)));
});
