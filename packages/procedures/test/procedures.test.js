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

function pickRenderModel(leg) {
  return {
    geometryKind: leg.geometryKind,
    renderClass: leg.renderClass,
    approximationLevel: leg.approximationLevel,
    bounded: leg.bounded
  };
}

function pickSemanticGeometry(leg) {
  return {
    semanticClass: leg.semanticGeometry?.semanticClass ?? null,
    geometryKind: leg.semanticGeometry?.geometryKind ?? null,
    approximationLevel: leg.semanticGeometry?.approximationLevel ?? null,
    bounded: leg.semanticGeometry?.bounded ?? null
  };
}

function pickChartGeometry(leg) {
  const geometry = leg.depictionGeometry?.geometry ?? leg.chartGeometry?.geometry ?? null;
  const curve = leg.depictionGeometry?.curve ?? leg.chartGeometry?.curve ?? null;
  const depictionClass = leg.depictionGeometry?.depictionClass ?? leg.chartGeometry?.depictionClass ?? null;
  return {
    depictionClass,
    chartObjectClass: leg.chartObjectClass ?? null,
    geometryType: geometry?.type ?? null,
    curveType: curve?.type ?? null
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
  assert.deepEqual(pickSemanticGeometry(built.legs[0]), {
    semanticClass: "if",
    geometryKind: "point",
    approximationLevel: "exact",
    bounded: true
  });
  assert.deepEqual(pickRenderModel(built.legs[1]), {
    geometryKind: "track",
    renderClass: "tf",
    approximationLevel: "exact",
    bounded: true
  });
  assert.deepEqual(pickRenderModel(built.legs[2]), {
    geometryKind: "course",
    renderClass: "cf",
    approximationLevel: "approximate",
    bounded: true
  });
  assert.deepEqual(pickChartGeometry(built.legs[0]), {
    depictionClass: "chart-point",
    chartObjectClass: "fix",
    geometryType: "Point",
    curveType: null
  });
  assert.deepEqual(pickChartGeometry(built.legs[1]), {
    depictionClass: "chart-line",
    chartObjectClass: "route-leg",
    geometryType: "LineString",
    curveType: null
  });
  assert.deepEqual(pickChartGeometry(built.legs[2]), {
    depictionClass: "chart-line",
    chartObjectClass: "route-leg",
    geometryType: "LineString",
    curveType: null
  });
  assert.ok(built.warnings.some((item) => /CF leg approximated/.test(item)));
  assert.ok(!built.warnings.some((item) => /Geometry discontinuity detected/.test(item)));
  const tfEnd = built.legs[1].geometry.coordinates.at(-1);
  const cfStart = built.legs[2].geometry.coordinates[0];
  assert.deepEqual(tfEnd, cfStart);
  assert.equal(built.legs[0].legacyGeometry.type, "Point");
  assert.equal(built.legs[1].legacyGeometry.type, "LineString");
  assert.deepEqual(built.legs[0].applicability, {
    aircraftCategories: null,
    aircraftTypes: null,
    operationTypes: null
  });
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
  assert.deepEqual(pickRenderModel(built.legs[1]), {
    geometryKind: "direct",
    renderClass: "df",
    approximationLevel: "practical",
    bounded: true
  });
  assert.deepEqual(pickSemanticGeometry(built.legs[1]), {
    semanticClass: "df",
    geometryKind: "direct",
    approximationLevel: "practical",
    bounded: true
  });
  assert.deepEqual(pickChartGeometry(built.legs[1]), {
    depictionClass: "chart-line",
    chartObjectClass: "route-leg",
    geometryType: "LineString",
    curveType: null
  });
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
  assert.deepEqual(pickRenderModel(built.legs[1]), {
    geometryKind: "arc",
    renderClass: "rf",
    approximationLevel: "visual",
    bounded: true
  });
  assert.deepEqual(pickSemanticGeometry(built.legs[1]), {
    semanticClass: "rf",
    geometryKind: "arc",
    approximationLevel: "visual",
    bounded: true
  });
  assert.deepEqual(pickChartGeometry(built.legs[1]), {
    depictionClass: "chart-arc",
    chartObjectClass: "arc-leg",
    geometryType: "LineString",
    curveType: "circular-arc"
  });
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
  assert.equal(rf.depictionGeometry.curve.type, "circular-arc");
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
  assert.deepEqual(pickRenderModel(built.legs[1]), {
    geometryKind: "arc",
    renderClass: "af",
    approximationLevel: "visual",
    bounded: true
  });
  assert.deepEqual(pickSemanticGeometry(built.legs[1]), {
    semanticClass: "af",
    geometryKind: "arc",
    approximationLevel: "visual",
    bounded: true
  });
  assert.deepEqual(pickChartGeometry(built.legs[1]), {
    depictionClass: "chart-arc",
    chartObjectClass: "arc-leg",
    geometryType: "LineString",
    curveType: "circular-arc"
  });
});

test("buildProcedureGeometry emits hold racetrack objects for HA HF and HM", () => {
  for (const pathTerm of ["HA", "HF", "HM"]) {
    const canonical = canonicalWithProcedure(
      [
        { seq: 1, pathTerm: "IF", fixId: "fix:start", fixRawId: "STRT" },
        {
          seq: 2,
          pathTerm,
          fixId: "fix:hold",
          fixRawId: "HOLD",
          turnDir: "R",
          navBlockRaw: "33950040",
          alt1: "03000",
          alt2: "06000",
          speed: "210"
        }
      ],
      [
        { id: "fix:start", coord: [0, -0.05] },
        { id: "fix:hold", coord: [0, 0] }
      ]
    );

    const built = buildProcedureGeometry(canonical, "procedure:test:1");
    const holdLeg = built.legs[1];
    assert.equal(holdLeg.depictionClass, "hold");
    assert.equal(holdLeg.chartObjectClass, "hold-racetrack");
    assert.equal(holdLeg.depictionGeometry.curve.type, "hold-racetrack");
    assert.equal(holdLeg.chartAnnotations.holdRole.startsWith("hold-"), true);
    assert.equal(holdLeg.chartAnnotations.inboundCourse, 339.5);
    assert.equal(holdLeg.chartAnnotations.turnDirection, "R");
    assert.equal(holdLeg.chartAnnotations.legLengthNm, 4);
    assert.deepEqual(holdLeg.chartAnnotations.altitudeRestrictions, {
      lower: "03000",
      upper: "06000"
    });
    assert.equal(holdLeg.chartAnnotations.speedRestriction, 210);
    assert.equal(holdLeg.geometry.type, "LineString");
    assert.ok(holdLeg.geometry.coordinates.length > 6);
    assert.equal(holdLeg.legacyGeometry.type, "LineString");
    assert.equal(typeof holdLeg.semanticGeometry.geometry.type, "string");
    assert.equal(holdLeg.semanticGeometry.geometry.type, "hold-pattern");
    assert.equal(holdLeg.bounded, pathTerm === "HF");
  }
});

test("buildProcedureGeometry emits explicit open-leg objects for CA", () => {
  const canonical = canonicalWithProcedure(
    [
      { seq: 1, pathTerm: "IF", fixId: "fix:start", fixRawId: "STRT" },
      { seq: 2, pathTerm: "CA", navBlockRaw: "1594", alt1: "02445", speed: "200" }
    ],
    [
      { id: "fix:start", coord: [0, 0] }
    ]
  );

  const built = buildProcedureGeometry(canonical, "procedure:test:1");
  const openLeg = built.legs[1];
  assert.equal(openLeg.depictionClass, "open-leg");
  assert.equal(openLeg.chartObjectClass, "open-leg");
  assert.equal(openLeg.bounded, false);
  assert.equal(openLeg.geometry.type, "LineString");
  assert.equal(openLeg.depictionGeometry.curve.type, "open-leg-ray");
  assert.equal(openLeg.chartAnnotations.openEnded, true);
  assert.equal(openLeg.chartAnnotations.courseDegrees, 159.4);
  assert.equal(openLeg.chartAnnotations.truncationMarker, "open-end");
  assert.deepEqual(openLeg.chartAnnotations.altitudeRestrictions, {
    lower: "02445",
    upper: null
  });
  assert.equal(openLeg.chartAnnotations.speedRestriction, 200);
  assert.equal(openLeg.semanticGeometry.geometry.type, "open-leg-ray");
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
  assert.equal(byLegType.get("TF").properties.depictionClass, "chart-line");
  assert.equal(byLegType.get("CF").properties.semanticClass, "cf");
  assert.equal(byLegType.get("DF").properties.semanticClass, "df");
  assert.equal(byLegType.get("CF").properties.geometryKind, "course");
  assert.equal(byLegType.get("CF").properties.approximationLevel, "approximate");
  assert.equal(byLegType.get("DF").properties.geometryKind, "direct");
  assert.equal(byLegType.get("DF").properties.approximationLevel, "practical");
  assert.equal(byLegType.get("RF").properties.geometryKind, "arc");
  assert.equal(byLegType.get("RF").properties.depictionClass, "chart-arc");
  assert.equal(byLegType.get("RF").properties.chartObjectClass, "arc-leg");
  assert.deepEqual(byLegType.get("TF").properties.applicability, {
    aircraftCategories: null,
    aircraftTypes: null,
    operationTypes: null
  });
  assert.equal(byLegType.get("RF").geometry.type, "LineString");
  assert.ok(byLegType.get("RF").geometry.coordinates.length > 2);
  assert.equal(byLegType.get("AF").properties.renderClass, "af");
  assert.equal(byLegType.get("AF").properties.depictionClass, "chart-arc");
  assert.equal(byLegType.get("AF").geometry.type, "LineString");
  assert.ok(byLegType.get("AF").geometry.coordinates.length > 2);
  assert.equal(byLegType.get("AF").properties.layer, "procedure");
  assert.equal(byLegType.get("AF").properties.debugProcedureLeg, true);
});

test("buildProcedureLegFeatureCollection preserves hold and open-leg chart object metadata", () => {
  const canonical = canonicalWithProcedure(
    [
      { seq: 1, pathTerm: "IF", fixId: "fix:start", fixRawId: "STRT" },
      { seq: 2, pathTerm: "HF", fixId: "fix:hold", fixRawId: "HOLD", turnDir: "L", navBlockRaw: "09000050", alt1: "04000", speed: "220" },
      { seq: 3, pathTerm: "CA", navBlockRaw: "1800", alt1: "05000" }
    ],
    [
      { id: "fix:start", coord: [0, -0.05] },
      { id: "fix:hold", coord: [0, 0] }
    ]
  );

  const collection = buildProcedureLegFeatureCollection(canonical);
  const byLegType = new Map(collection.features.map((feature) => [feature.properties.legType, feature]));
  assert.equal(byLegType.get("HF").properties.layer, "hold");
  assert.equal(byLegType.get("HF").properties.depictionClass, "hold");
  assert.equal(byLegType.get("HF").properties.chartObjectClass, "hold-racetrack");
  assert.equal(byLegType.get("HF").properties.chartAnnotations.turnDirection, "L");
  assert.equal(byLegType.get("CA").properties.depictionClass, "open-leg");
  assert.equal(byLegType.get("CA").properties.chartObjectClass, "open-leg");
  assert.equal(byLegType.get("CA").properties.chartAnnotations.openEnded, true);
});

test("buildProcedureGeometry keeps TF CF and DF semantically distinct while all depict as chart lines", () => {
  const canonical = canonicalWithProcedure(
    [
      { seq: 1, pathTerm: "IF", fixId: "fix:start", fixRawId: "STRT" },
      { seq: 2, pathTerm: "TF", fixId: "fix:tf", fixRawId: "TF01" },
      { seq: 3, pathTerm: "CF", fixId: "fix:cf", fixRawId: "CF01" },
      { seq: 4, pathTerm: "DF", fixId: "fix:df", fixRawId: "DF01" }
    ],
    [
      { id: "fix:start", coord: [0, 0] },
      { id: "fix:tf", coord: [1, 0] },
      { id: "fix:cf", coord: [2, 0] },
      { id: "fix:df", coord: [3, 0] }
    ]
  );

  const built = buildProcedureGeometry(canonical, "procedure:test:1");
  assert.equal(built.geometry.type, "MultiLineString");
  assert.equal(built.geometry.coordinates.length, 3);
  assert.deepEqual(built.legs.slice(1).map((leg) => leg.semanticGeometry.semanticClass), ["tf", "cf", "df"]);
  assert.deepEqual(built.legs.slice(1).map((leg) => leg.depictionGeometry.depictionClass), ["chart-line", "chart-line", "chart-line"]);
  assert.deepEqual(built.legs.slice(1).map((leg) => leg.depictionGeometry.geometry.type), ["LineString", "LineString", "LineString"]);
});

test("buildProcedureGeometry keeps aggregate geometry while exposing arc depictions", () => {
  const canonical = canonicalWithProcedure(
    [
      { seq: 1, pathTerm: "IF", fixId: "fix:start", fixRawId: "STRT" },
      { seq: 2, pathTerm: "TF", fixId: "fix:tf", fixRawId: "TF01" },
      { seq: 3, pathTerm: "RF", fixId: "fix:rf", fixRawId: "RF01", centerFixId: "fix:center", centerFixRawId: "CTR", arcRadiusNm: 60, turnDir: "R" },
      { seq: 4, pathTerm: "AF", fixId: "fix:af", fixRawId: "AF01", centerFixId: "fix:center2", centerFixRawId: "DME1", arcRadiusNm: 60, turnDir: "L" }
    ],
    [
      { id: "fix:start", coord: [0, 0] },
      { id: "fix:tf", coord: [1, 0] },
      { id: "fix:rf", coord: [2, 1] },
      { id: "fix:center", coord: [1, 1] },
      { id: "fix:af", coord: [1, 2] },
      { id: "fix:center2", coord: [2, 2] }
    ]
  );

  const built = buildProcedureGeometry(canonical, "procedure:test:1");
  assert.equal(built.geometry.type, "MultiLineString");
  assert.equal(built.geometry.coordinates.length, 3);
  assert.deepEqual(pickChartGeometry(built.legs[2]), {
    depictionClass: "chart-arc",
    chartObjectClass: "arc-leg",
    geometryType: "LineString",
    curveType: "circular-arc"
  });
  assert.deepEqual(pickChartGeometry(built.legs[3]), {
    depictionClass: "chart-arc",
    chartObjectClass: "arc-leg",
    geometryType: "LineString",
    curveType: "circular-arc"
  });
  assert.equal(built.legs[2].legacyGeometry.type, "LineString");
  assert.equal(built.legs[3].legacyGeometry.type, "LineString");
});

test("buildProcedureGeometry preserves category applicability on legs", () => {
  const canonical = canonicalWithProcedure(
    [
      { seq: 1, pathTerm: "IF", fixId: "fix:start", fixRawId: "STRT" },
      {
        seq: 2,
        pathTerm: "TF",
        fixId: "fix:end",
        fixRawId: "END",
        aircraftCategories: ["A", "B"],
        aircraftTypes: ["Jet"],
        operationTypes: ["RNAV"]
      }
    ],
    [
      { id: "fix:start", coord: [0, 0] },
      { id: "fix:end", coord: [1, 0] }
    ]
  );

  const built = buildProcedureGeometry(canonical, "procedure:test:1");
  assert.deepEqual(built.legs[1].applicability, {
    aircraftCategories: ["A", "B"],
    aircraftTypes: ["Jet"],
    operationTypes: ["RNAV"]
  });
});

test("buildProcedureGeometry supports common legs plus category-specific branches without duplicating shared geometry", () => {
  const canonical = {
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
      waypoints: [
        { id: "fix:start", coord: [0, 0] },
        { id: "fix:common", coord: [1, 0] },
        { id: "fix:a", coord: [2, 0] },
        { id: "fix:b", coord: [2, 1] }
      ],
      procedures: [{
        id: "procedure:test:1",
        type: "procedure",
        procedureType: "PD",
        airportId: "airport:test",
        transitionId: "RW01",
        legs: [
          { seq: 1, pathTerm: "IF", fixId: "fix:start", fixRawId: "STRT" },
          { seq: 2, pathTerm: "TF", fixId: "fix:common", fixRawId: "COMM" }
        ],
        branches: [
          {
            id: "cat-a-b",
            applicability: { aircraftCategories: ["A", "B"] },
            legs: [
              { seq: 3, pathTerm: "TF", fixId: "fix:a", fixRawId: "AB01" }
            ]
          },
          {
            id: "cat-c-d-e",
            applicability: { aircraftCategories: ["C", "D", "E"] },
            legs: [
              { seq: 3, pathTerm: "TF", fixId: "fix:b", fixRawId: "CDE1" }
            ]
          }
        ]
      }]
    }
  };

  const built = buildProcedureGeometry(canonical, "procedure:test:1");
  assert.equal(built.legs.length, 2);
  assert.equal(built.commonLegs.length, 2);
  assert.equal(built.branches.length, 2);
  assert.deepEqual(built.branches[0].applicability, {
    aircraftCategories: ["A", "B"],
    aircraftTypes: null,
    operationTypes: null
  });
  assert.deepEqual(built.branches[1].applicability, {
    aircraftCategories: ["C", "D", "E"],
    aircraftTypes: null,
    operationTypes: null
  });
  assert.equal(built.branches[0].legs[0].branchId, "cat-a-b");
  assert.equal(built.branches[1].legs[0].branchId, "cat-c-d-e");
  assert.deepEqual(built.branches[0].legs[0].applicability, {
    aircraftCategories: ["A", "B"],
    aircraftTypes: null,
    operationTypes: null
  });
  assert.deepEqual(built.branches[1].legs[0].applicability, {
    aircraftCategories: ["C", "D", "E"],
    aircraftTypes: null,
    operationTypes: null
  });
  assert.equal(built.geometry.type, "MultiLineString");
  assert.equal(built.geometry.coordinates.length, 3);

  const collection = buildProcedureLegFeatureCollection(canonical);
  const branchIds = new Set(collection.features.map((feature) => feature.properties.branchId));
  assert.ok(branchIds.has(null));
  assert.ok(branchIds.has("cat-a-b"));
  assert.ok(branchIds.has("cat-c-d-e"));
  const catABFeature = collection.features.find((feature) => feature.properties.branchId === "cat-a-b");
  assert.deepEqual(catABFeature.properties.applicability, {
    aircraftCategories: ["A", "B"],
    aircraftTypes: null,
    operationTypes: null
  });
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

test("buildProcedureGeometry uses a practical default continuity tolerance for display geometry", () => {
  const decoded = {
    procedureId: "procedure:test:continuity",
    routeType: "PD",
    transitionId: "RW01",
    warnings: [],
    legs: [
      { index: 0, seq: 1, pathTerminator: "IF", supported: true, fixId: "fix:1", fixCoord: [0, 0], metadata: {} },
      { index: 1, seq: 2, pathTerminator: "TF", supported: true, fixId: "fix:2", fixCoord: [1, 0], metadata: {} },
      { index: 2, seq: 3, pathTerminator: "DF", supported: true, fixId: "fix:3", fixCoord: [2, 0], startCoord: [1.00005, 0], metadata: {} }
    ]
  };

  const built = buildProcedureGeometry(decoded);
  assert.ok(!built.warnings.some((item) => /Geometry discontinuity detected/.test(item)));

  const strictBuilt = buildProcedureGeometry(decoded, { continuityToleranceDegrees: 1e-6 });
  assert.ok(strictBuilt.warnings.some((item) => /Geometry discontinuity detected/.test(item)));
});
