import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCartography,
  buildProcedureRenderModel,
  filterProcedureLegs,
  procedureLegToOpenLayersAnnotationFeature,
  procedureLegToOpenLayersEditorialFeatures,
  procedureLegToOpenLayersFeature
} from "../src/index.js";

function makeLeg({
  index,
  pathTerminator,
  semanticClass,
  depictionClass,
  geometryKind,
  chartObjectClass = null,
  approximationLevel,
  bounded,
  depictionGeometry,
  legacyGeometry,
  chartAnnotations = null,
  applicability = null,
  branchId = null
}) {
  return {
    index,
    pathTerminator,
    semanticClass,
    depictionClass,
    geometryKind,
    chartObjectClass,
    approximationLevel,
    bounded,
    depictionGeometry: {
      depictionClass,
      geometry: depictionGeometry,
      bbox: null,
      curve: depictionClass === "chart-arc" ? { type: "circular-arc" } : null
    },
    chartGeometry: {
      depictionClass,
      geometry: depictionGeometry,
      bbox: null,
      curve: depictionClass === "chart-arc" ? { type: "circular-arc" } : null
    },
    semanticGeometry: {
      semanticClass,
      geometryKind,
      bounded,
      approximationLevel,
      geometry: depictionGeometry,
      bbox: null,
      curve: depictionClass === "chart-arc" ? { type: "circular-arc" } : null
    },
    legacyGeometry,
    geometry: legacyGeometry,
    applicability: applicability ?? {
      aircraftCategories: null,
      aircraftTypes: null,
      operationTypes: null
    },
    chartAnnotations,
    branchId,
    metadata: {
      legType: pathTerminator
    }
  };
}

function makeProcedureResult() {
  return {
    procedureId: "procedure:test:1",
    routeType: "PD",
    transitionId: "RW01",
    commonLegs: [
      makeLeg({
        index: 0,
        pathTerminator: "IF",
        semanticClass: "if",
        depictionClass: "chart-point",
        geometryKind: "point",
        chartObjectClass: "fix",
        approximationLevel: "exact",
        bounded: true,
        depictionGeometry: { type: "Point", coordinates: [0, 0] },
        legacyGeometry: { type: "Point", coordinates: [0, 0] }
      }),
      makeLeg({
        index: 1,
        pathTerminator: "TF",
        semanticClass: "tf",
        depictionClass: "chart-line",
        geometryKind: "track",
        chartObjectClass: "route-leg",
        approximationLevel: "exact",
        bounded: true,
        depictionGeometry: { type: "LineString", coordinates: [[0, 0], [1, 0]] },
        legacyGeometry: { type: "LineString", coordinates: [[0, 0], [1, 0]] }
      }),
      makeLeg({
        index: 2,
        pathTerminator: "CF",
        semanticClass: "cf",
        depictionClass: "chart-line",
        geometryKind: "course",
        chartObjectClass: "route-leg",
        approximationLevel: "approximate",
        bounded: true,
        depictionGeometry: { type: "LineString", coordinates: [[1, 0], [2, 0]] },
        legacyGeometry: { type: "LineString", coordinates: [[1, 0], [2, 0]] }
      }),
      makeLeg({
        index: 3,
        pathTerminator: "DF",
        semanticClass: "df",
        depictionClass: "chart-line",
        geometryKind: "direct",
        chartObjectClass: "route-leg",
        approximationLevel: "practical",
        bounded: true,
        depictionGeometry: { type: "LineString", coordinates: [[2, 0], [3, 0]] },
        legacyGeometry: { type: "LineString", coordinates: [[2, 0], [3, 0]] }
      }),
      makeLeg({
        index: 4,
        pathTerminator: "RF",
        semanticClass: "rf",
        depictionClass: "chart-arc",
        geometryKind: "arc",
        chartObjectClass: "arc-leg",
        approximationLevel: "visual",
        bounded: true,
        depictionGeometry: { type: "LineString", coordinates: [[3, 0], [3.5, 0.5], [4, 1]] },
        legacyGeometry: { type: "LineString", coordinates: [[3, 0], [3.5, 0.5], [4, 1]] }
      }),
      makeLeg({
        index: 5,
        pathTerminator: "AF",
        semanticClass: "af",
        depictionClass: "chart-arc",
        geometryKind: "arc",
        chartObjectClass: "arc-leg",
        approximationLevel: "visual",
        bounded: true,
        depictionGeometry: { type: "LineString", coordinates: [[4, 1], [4.5, 1.5], [5, 2]] },
        legacyGeometry: { type: "LineString", coordinates: [[4, 1], [4.5, 1.5], [5, 2]] }
      }),
      makeLeg({
        index: 6,
        pathTerminator: "HF",
        semanticClass: "hf",
        depictionClass: "hold",
        geometryKind: "hold",
        chartObjectClass: "hold-racetrack",
        approximationLevel: "practical",
        bounded: true,
        depictionGeometry: { type: "LineString", coordinates: [[5, 2], [5.2, 2.2], [5.4, 2], [5.2, 1.8], [5, 2]] },
        legacyGeometry: { type: "LineString", coordinates: [[5, 2], [5.2, 2.2], [5.4, 2], [5.2, 1.8], [5, 2]] },
        chartAnnotations: {
          holdRole: "hold-to-fix",
          inboundCourse: 339.5,
          turnDirection: "R",
          legLengthNm: 4,
          legTimeMinutes: null,
          altitudeRestrictions: { lower: "03000", upper: "06000" },
          speedRestriction: 210,
          annotationCoord: [5.25, 2.35]
        }
      }),
      makeLeg({
        index: 7,
        pathTerminator: "CA",
        semanticClass: "ca",
        depictionClass: "open-leg",
        geometryKind: "ray",
        chartObjectClass: "open-leg",
        approximationLevel: "approximate",
        bounded: false,
        depictionGeometry: { type: "LineString", coordinates: [[5, 2], [5.5, 2.4]] },
        legacyGeometry: { type: "LineString", coordinates: [[5, 2], [5.5, 2.4]] },
        chartAnnotations: {
          openEnded: true,
          courseDegrees: 159.4,
          truncationMarker: "open-end",
          anchorCoord: [5, 2]
        }
      })
    ],
    branches: [
      {
        id: "cat-a-b",
        applicability: { aircraftCategories: ["A", "B"], aircraftTypes: null, operationTypes: null },
        legs: [
          makeLeg({
            index: 0,
            pathTerminator: "TF",
            semanticClass: "tf",
            depictionClass: "chart-line",
            geometryKind: "track",
            chartObjectClass: "route-leg",
            approximationLevel: "exact",
            bounded: true,
            depictionGeometry: { type: "LineString", coordinates: [[5, 2], [6, 2]] },
            legacyGeometry: { type: "LineString", coordinates: [[5, 2], [6, 2]] },
            applicability: { aircraftCategories: ["A", "B"], aircraftTypes: null, operationTypes: null },
            branchId: "cat-a-b"
          })
        ]
      },
      {
        id: "cat-c",
        applicability: { aircraftCategories: ["C"], aircraftTypes: null, operationTypes: null },
        legs: [
          makeLeg({
            index: 0,
            pathTerminator: "TF",
            semanticClass: "tf",
            depictionClass: "chart-line",
            geometryKind: "track",
            chartObjectClass: "route-leg",
            approximationLevel: "exact",
            bounded: true,
            depictionGeometry: { type: "LineString", coordinates: [[5, 2], [6, 3]] },
            legacyGeometry: { type: "LineString", coordinates: [[5, 2], [6, 3]] },
            applicability: { aircraftCategories: ["C"], aircraftTypes: null, operationTypes: null },
            branchId: "cat-c"
          })
        ]
      }
    ],
    legs: []
  };
}

test("procedureLegToOpenLayersFeature prefers depictionGeometry over legacyGeometry", () => {
  const leg = makeLeg({
    index: 0,
    pathTerminator: "IF",
    semanticClass: "if",
    depictionClass: "chart-point",
    geometryKind: "point",
    chartObjectClass: "fix",
    approximationLevel: "exact",
    bounded: true,
    depictionGeometry: { type: "Point", coordinates: [10, 20] },
    legacyGeometry: { type: "LineString", coordinates: [[0, 0], [1, 1]] }
  });

  const feature = procedureLegToOpenLayersFeature(leg, { procedureId: "procedure:test:1", debug: true });
  assert.equal(feature.geometry.type, "Point");
  assert.equal(feature.properties.depictionClass, "chart-point");
  assert.equal(feature.properties.chartObjectClass, "fix");
  assert.equal(feature.properties.debugLabel, "if | exact | fix");
});

test("buildProcedureRenderModel keeps procedure semantics distinct while rendering from depictionGeometry", () => {
  const renderModel = buildProcedureRenderModel(makeProcedureResult(), { debug: true });
  const bySemantic = new Map(renderModel.features.map((feature) => [feature.properties.semanticClass, feature]));

  assert.equal(bySemantic.get("if").geometry.type, "Point");
  assert.equal(bySemantic.get("if").properties.depictionClass, "chart-point");
  assert.equal(bySemantic.get("tf").geometry.type, "LineString");
  assert.equal(bySemantic.get("tf").properties.depictionClass, "chart-line");
  assert.equal(bySemantic.get("cf").properties.approximationLevel, "approximate");
  assert.equal(bySemantic.get("df").properties.approximationLevel, "practical");
  assert.equal(bySemantic.get("rf").properties.depictionClass, "chart-arc");
  assert.equal(bySemantic.get("af").properties.depictionClass, "chart-arc");
  assert.equal(bySemantic.get("rf").properties.depictionCurveType, "circular-arc");
  assert.equal(bySemantic.get("af").properties.depictionCurveType, "circular-arc");
  assert.equal(bySemantic.get("hf").properties.depictionClass, "hold");
  assert.equal(bySemantic.get("hf").properties.chartObjectClass, "hold-racetrack");
  assert.equal(bySemantic.get("ca").properties.depictionClass, "open-leg");
  assert.equal(bySemantic.get("ca").properties.chartObjectClass, "open-leg");
});

test("filterProcedureLegs supports aircraft category and branch filtering", () => {
  const procedureResult = makeProcedureResult();

  const filteredForA = filterProcedureLegs(procedureResult, { aircraftCategory: "A" });
  assert.ok(filteredForA.some((leg) => leg.branchId === "cat-a-b"));
  assert.ok(!filteredForA.some((leg) => leg.branchId === "cat-c"));
  assert.ok(filteredForA.some((leg) => leg.branchId == null));

  const filteredBranch = filterProcedureLegs(procedureResult, { branchIds: ["cat-c"] });
  assert.ok(filteredBranch.some((leg) => leg.branchId == null));
  assert.ok(filteredBranch.some((leg) => leg.branchId === "cat-c"));
  assert.ok(!filteredBranch.some((leg) => leg.branchId === "cat-a-b"));
});

test("buildProcedureRenderModel propagates debug metadata and branch applicability", () => {
  const renderModel = buildProcedureRenderModel(makeProcedureResult(), {
    aircraftCategory: "A",
    debug: true
  });
  const branchFeature = renderModel.features.find((feature) => feature.properties.branchId === "cat-a-b");

  assert.deepEqual(branchFeature.properties.applicability, {
    aircraftCategories: ["A", "B"],
    aircraftTypes: null,
    operationTypes: null
  });
  assert.match(branchFeature.properties.debugLabel, /branch:cat-a-b/);
  assert.match(branchFeature.properties.debugLabel, /exact/);
  assert.match(branchFeature.properties.debugLabel, /route-leg/);
});

test("procedureLegToOpenLayersAnnotationFeature emits hold annotation points", () => {
  const holdLeg = makeProcedureResult().commonLegs.find((leg) => leg.pathTerminator === "HF");
  const feature = procedureLegToOpenLayersAnnotationFeature(holdLeg, {
    procedureId: "procedure:test:1",
    debug: true
  });

  assert.equal(feature.geometry.type, "Point");
  assert.equal(feature.properties.layer, "procedure-annotations");
  assert.equal(feature.properties.type, "procedure-annotation");
  assert.equal(feature.properties.annotationRole, "hold-annotation");
  assert.equal(feature.properties.chartObjectClass, "hold-racetrack");
  assert.match(feature.properties.annotationText, /339.5deg/);
});

test("buildProcedureRenderModel exposes annotation features for hold and open legs", () => {
  const renderModel = buildProcedureRenderModel(makeProcedureResult(), { debug: true });
  assert.ok(renderModel.features.some((feature) => feature.properties.depictionClass === "hold"));
  assert.ok(renderModel.annotationFeatures.some((feature) => feature.properties.annotationRole === "hold-annotation"));
  assert.ok(renderModel.annotationFeatures.some((feature) => feature.properties.depictionClass === "open-leg"));
});

test("procedureLegToOpenLayersEditorialFeatures derives hold and open-leg marks separately from geometry", () => {
  const procedureResult = makeProcedureResult();
  const holdLeg = procedureResult.commonLegs.find((leg) => leg.pathTerminator === "HF");
  const openLeg = procedureResult.commonLegs.find((leg) => leg.pathTerminator === "CA");

  const holdMarks = procedureLegToOpenLayersEditorialFeatures(holdLeg, {
    procedureId: procedureResult.procedureId,
    routeType: procedureResult.routeType,
    transitionId: procedureResult.transitionId
  });
  const openLegMarks = procedureLegToOpenLayersEditorialFeatures(openLeg, {
    procedureId: procedureResult.procedureId,
    routeType: procedureResult.routeType,
    transitionId: procedureResult.transitionId
  });

  assert.ok(holdMarks.some((feature) => feature.properties.editorialClass === "holding-fix-marker"));
  assert.ok(holdMarks.some((feature) => feature.properties.editorialClass === "direction-arrow"));
  assert.ok(holdMarks.some((feature) => feature.properties.editorialClass === "course-label"));
  assert.ok(holdMarks.some((feature) => feature.properties.editorialClass === "leg-distance-label"));
  assert.ok(holdMarks.some((feature) => feature.properties.editorialClass === "speed-label"));
  assert.ok(holdMarks.some((feature) => feature.properties.editorialClass === "altitude-label"));

  assert.ok(openLegMarks.some((feature) => feature.properties.editorialClass === "direction-arrow"));
  assert.ok(openLegMarks.some((feature) => feature.properties.editorialClass === "open-end-marker"));
  assert.ok(openLegMarks.some((feature) => feature.properties.editorialClass === "course-label"));
  assert.equal(openLegMarks.every((feature) => feature.properties.layer === "procedure-editorial"), true);
});

test("buildProcedureRenderModel exposes editorial features without mixing them into primary geometry features", () => {
  const renderModel = buildProcedureRenderModel(makeProcedureResult(), { debug: true });
  assert.ok(renderModel.editorialFeatures.length > 0);
  assert.ok(renderModel.editorialFeatures.some((feature) => feature.properties.editorialClass === "direction-arrow"));
  assert.ok(renderModel.features.every((feature) => feature.properties.type === "procedure-leg"));
  assert.ok(renderModel.editorialFeatures.every((feature) => feature.properties.type === "procedure-editorial-mark"));
});

test("buildCartography accepts procedureResults and exposes procedure layer semantics", () => {
  const cartography = buildCartography({
    features: [],
    procedureResults: [makeProcedureResult()],
    procedureRenderOptions: { aircraftCategory: "A", debug: true }
  });

  const procedures = cartography.layers.find((layer) => layer.name === "procedures");
  assert.ok(procedures);
  assert.ok(procedures.featureCount >= 1);
  assert.ok(procedures.depictionClasses.includes("chart-line"));
  assert.ok(procedures.depictionClasses.includes("chart-point"));
  assert.ok(procedures.depictionClasses.includes("chart-arc"));
  assert.ok(procedures.depictionClasses.includes("open-leg"));
  assert.ok(procedures.semanticClasses.includes("cf"));
  assert.ok(procedures.semanticClasses.includes("df"));
  assert.ok(procedures.branchIds.includes("cat-a-b"));
  assert.ok(procedures.chartObjectClasses.includes("route-leg"));

  const holds = cartography.layers.find((layer) => layer.name === "holds");
  assert.ok(holds);
  assert.ok(holds.depictionClasses.includes("hold"));
  assert.ok(holds.chartObjectClasses.includes("hold-racetrack"));

  const annotations = cartography.layers.find((layer) => layer.name === "procedure-annotations");
  assert.ok(annotations);
  assert.equal(annotations.geometryType, "point");

  const editorial = cartography.layers.find((layer) => layer.name === "procedure-editorial");
  assert.ok(editorial);
  assert.equal(editorial.geometryType, "point");
});
