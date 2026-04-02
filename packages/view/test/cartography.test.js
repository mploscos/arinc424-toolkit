import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCartography,
  buildLabelCandidates,
  deriveProcedureDisplay,
  getDefaultLayerDescriptor,
  isFeatureVisibleAtZoom,
  getLabelRule,
  getProcedureStyle,
  getAirportStyle,
  getWaypointStyle,
  getAirspaceStyle,
  getAirwayStyle,
  categorizeAirspaceFeatureProperties,
  classifyAirwayTier,
  CHART_MODE_ENROUTE,
  CHART_MODE_TERMINAL,
  CHART_MODE_PROCEDURE,
  isFeatureVisibleInChartMode,
  getLabelRuleForChartMode,
  createProcedureFocusContext,
  getFeatureBBox,
  expandBBox,
  bboxIntersects,
  buildAirportFocusBBox,
  buildProcedureFocusBBox
} from "../src/cartography/index.js";

test("buildCartography groups layers and computes bounds", () => {
  const featureModel = {
    features: [
      {
        id: "airport:LEMD",
        layer: "airports",
        geometry: { type: "Point", coordinates: [-3.56, 40.49] },
        properties: { name: "Adolfo Suarez Madrid-Barajas", ident: "LEMD" },
        bbox: [-3.56, 40.49, -3.56, 40.49],
        minZoom: 6,
        maxZoom: 12
      },
      {
        id: "airspace:1",
        layer: "airspaces",
        geometry: {
          type: "Polygon",
          coordinates: [[[-3.8, 40.3], [-3.2, 40.3], [-3.2, 40.7], [-3.8, 40.7], [-3.8, 40.3]]]
        },
        properties: { name: "CTR MADRID" },
        bbox: [-3.8, 40.3, -3.2, 40.7],
        minZoom: 4,
        maxZoom: 11
      }
    ]
  };

  const cartography = buildCartography(featureModel);
  assert.ok(Array.isArray(cartography.layers));
  assert.equal(cartography.layers.length, 2);
  assert.deepEqual(cartography.bounds, [-3.8, 40.3, -3.2, 40.7]);

  const airspaces = cartography.layers.find((l) => l.name === "airspaces");
  assert.equal(airspaces.styleHint, "airspace");
  assert.equal(airspaces.geometryType, "polygon");
  assert.equal(airspaces.featureCount, 1);
});

test("buildCartography can seed from index-like metadata", () => {
  const cartography = buildCartography(
    { features: [] },
    {
      layers: ["airports", "runways", "airspaces"],
      bounds: [-10, 35, 5, 45],
      minZoom: 4,
      maxZoom: 10
    }
  );

  assert.equal(cartography.layers.length, 3);
  const airports = cartography.layers.find((l) => l.name === "airports");
  assert.equal(airports.minZoom, 4);
  assert.equal(airports.maxZoom, 22);
  assert.equal(airports.availableMinZoom, 4);
  assert.equal(airports.availableMaxZoom, 10);
  assert.deepEqual(cartography.bounds, [-10, 35, 5, 45]);
});

test("seeded tile max zoom does not hide cartography above the tile pyramid", () => {
  const cartography = buildCartography(
    { features: [] },
    {
      layers: ["airports"],
      minZoom: 4,
      maxZoom: 10
    }
  );
  const airportDescriptor = cartography.layers.find((l) => l.name === "airports");
  const airport = {
    properties: { ident: "LEMD", importance: "major" },
    minZoom: undefined,
    maxZoom: undefined
  };

  assert.equal(isFeatureVisibleAtZoom(airport, airportDescriptor, 11), true);
  assert.equal(isFeatureVisibleAtZoom(airport, airportDescriptor, 16), true);
});

test("label candidates are sorted by priority", () => {
  const features = [
    {
      id: "airspace:major",
      layer: "airspaces",
      properties: { name: "CTR TEST", importance: "major" }
    },
    {
      id: "airport:major",
      layer: "airports",
      properties: { ident: "KJFK", importance: "major" }
    },
    {
      id: "waypoint:minor",
      layer: "waypoints",
      properties: { ident: "DPK", importance: "minor" }
    }
  ];
  const layerMap = new Map([
    ["airspaces", getDefaultLayerDescriptor("airspaces")],
    ["airports", getDefaultLayerDescriptor("airports")],
    ["waypoints", getDefaultLayerDescriptor("waypoints")]
  ]);
  const labels = buildLabelCandidates(features, layerMap);
  assert.equal(labels.length, 3);
  assert.equal(labels[0].featureId, "airspace:major");
  assert.equal(labels[1].featureId, "airport:major");
  assert.ok(labels[1].priority > labels[2].priority);
});

test("visibility and label rules follow chart-like zoom thresholds", () => {
  const runwayDescriptor = getDefaultLayerDescriptor("runways");
  const runway = { properties: {}, minZoom: undefined, maxZoom: undefined };
  assert.equal(isFeatureVisibleAtZoom(runway, runwayDescriptor, 9), false);
  assert.equal(isFeatureVisibleAtZoom(runway, runwayDescriptor, 11), true);

  const airportDescriptor = getDefaultLayerDescriptor("airports");
  const majorAirport = {
    properties: { ident: "EGLL", importance: "major" },
    minZoom: undefined,
    maxZoom: undefined
  };
  const labelAt6 = getLabelRule(majorAirport, airportDescriptor, 6);
  const labelAt7 = getLabelRule(majorAirport, airportDescriptor, 7);
  assert.equal(labelAt6.enabled, false);
  assert.equal(labelAt7.enabled, true);
  assert.ok(labelAt7.priority > 0);

  const waypointDescriptor = getDefaultLayerDescriptor("waypoints");
  const minorWaypoint = {
    properties: { ident: "DPK", importance: "minor" },
    minZoom: undefined,
    maxZoom: undefined
  };
  assert.equal(isFeatureVisibleAtZoom(minorWaypoint, waypointDescriptor, 10), false);
  assert.equal(isFeatureVisibleAtZoom(minorWaypoint, waypointDescriptor, 11), true);
  assert.equal(getLabelRule(minorWaypoint, waypointDescriptor, 12).enabled, false);
  assert.equal(getLabelRule(minorWaypoint, waypointDescriptor, 13).enabled, true);

  const procedureDescriptor = getDefaultLayerDescriptor("procedure");
  const approachProcedure = {
    properties: {
      procedureType: "APPROACH",
      procedureId: "procedure:APP:TEST:01"
    },
    minZoom: undefined,
    maxZoom: undefined
  };
  assert.equal(isFeatureVisibleAtZoom(approachProcedure, procedureDescriptor, 6), false);
  assert.equal(isFeatureVisibleAtZoom(approachProcedure, procedureDescriptor, 7), true);
  assert.equal(getLabelRule(approachProcedure, procedureDescriptor, 8).enabled, false);
  assert.equal(getLabelRule(approachProcedure, procedureDescriptor, 9).enabled, true);
  assert.ok(getProcedureStyle(approachProcedure, 14).width > getProcedureStyle({ properties: { procedureType: "SID" } }, 14).width);
});

test("point layers stay visible at zooms where their labels appear", () => {
  const cases = [
    {
      descriptor: getDefaultLayerDescriptor("airports"),
      feature: { properties: { ident: "LEMD", importance: "major" }, minZoom: undefined, maxZoom: undefined },
      labelZoom: 7
    },
    {
      descriptor: getDefaultLayerDescriptor("heliports"),
      feature: { properties: { ident: "LEHC", importance: "minor" }, minZoom: undefined, maxZoom: undefined },
      labelZoom: 11
    },
    {
      descriptor: getDefaultLayerDescriptor("navaids"),
      feature: { properties: { ident: "NDB1", layer: "navaids", importance: "medium" }, minZoom: undefined, maxZoom: undefined },
      labelZoom: 13
    },
    {
      descriptor: getDefaultLayerDescriptor("waypoints"),
      feature: { properties: { ident: "FIX01", layer: "waypoints", importance: "minor" }, minZoom: undefined, maxZoom: undefined },
      labelZoom: 13
    }
  ];

  for (const entry of cases) {
    assert.equal(getLabelRule(entry.feature, entry.descriptor, entry.labelZoom).enabled, true);
    assert.equal(isFeatureVisibleAtZoom(entry.feature, entry.descriptor, entry.labelZoom), true);
  }
});

test("deriveProcedureDisplay avoids exposing raw internal ids as labels", () => {
  const display = deriveProcedureDisplay({
    properties: {
      id: "procedure:PD:US:KPRC:PRC1:1:RW04",
      procedureType: "PD",
      transitionId: "RW04"
    }
  });
  assert.equal(display.category, "SID");
  assert.equal(display.ident, "PRC1");
  assert.equal(display.airport, "KPRC");
  assert.equal(display.runway, "RW04");
  assert.equal(display.displayLabel, "PRC1 RW04");
});

test("airspace semantics use restrained categories instead of one generic style", () => {
  const restrictive = {
    properties: { name: "R-123", restrictiveType: "RESTRICTED", importance: "major" }
  };
  const terminal = {
    properties: { name: "CLASS C TEST", airspaceClass: "CLASS C", importance: "major" }
  };
  const fallback = {
    properties: { name: "FIR TEST", importance: "minor" }
  };

  assert.equal(categorizeAirspaceFeatureProperties(restrictive).category, "restrictive");
  assert.equal(categorizeAirspaceFeatureProperties(terminal).category, "terminal-controlled");
  assert.equal(categorizeAirspaceFeatureProperties(fallback).category, "fallback");

  const restrictiveStyle = getAirspaceStyle(restrictive, 9);
  const terminalStyle = getAirspaceStyle(terminal, 9);
  assert.notEqual(restrictiveStyle.stroke, terminalStyle.stroke);
  assert.ok(restrictiveStyle.lineDash);
  assert.ok(String(terminalStyle.fill).includes("rgba"));
});

test("airways and labels are visually secondary at overview scales", () => {
  const majorAirway = {
    properties: { routeType: "JET", importance: "major", airwayName: "J60" }
  };
  const minorAirway = {
    properties: { routeType: "LOW", importance: "minor", airwayName: "V12" }
  };
  const airwayDescriptor = getDefaultLayerDescriptor("airways");
  const airwayMajorStyle = getAirwayStyle(majorAirway, 8);
  const airwayMinorStyle = getAirwayStyle(minorAirway, 8);

  assert.equal(classifyAirwayTier(majorAirway), "major");
  assert.equal(classifyAirwayTier(minorAirway), "minor");
  assert.ok(airwayMajorStyle.width < 1.5);
  assert.ok(airwayMinorStyle.width < airwayMajorStyle.width);
  assert.equal(getLabelRule(minorAirway, airwayDescriptor, 10).enabled, false);
  assert.equal(getLabelRule(majorAirway, airwayDescriptor, 10).enabled, true);
});

test("point symbology tokens distinguish airports, heliports, navaids, and compulsory fixes", () => {
  const airport = { properties: { facilityType: "AIRPORT", importance: "major" } };
  const heliport = { properties: { facilityType: "HELIPORT", importance: "major" } };
  const navaid = { properties: { layer: "navaids", importance: "medium" } };
  const compulsoryFix = { properties: { layer: "waypoints", usage: "B", importance: "minor" } };

  assert.equal(getAirportStyle(airport, 10).symbol, "airport");
  assert.equal(getAirportStyle(heliport, 10).symbol, "heliport");
  assert.equal(getWaypointStyle(navaid, 12).symbol, "navaid");
  assert.equal(getWaypointStyle(compulsoryFix, 12).symbol, "waypoint-compulsory");
});

test("procedure styles vary by editorial category instead of one generic magenta", () => {
  const sid = { properties: { procedureType: "SID" } };
  const star = { properties: { procedureType: "STAR" } };
  const approach = { properties: { procedureType: "APPROACH" } };
  const hold = { layer: "holds", properties: { layer: "holds" } };

  const sidStyle = getProcedureStyle(sid, 13);
  const starStyle = getProcedureStyle(star, 13);
  const approachStyle = getProcedureStyle(approach, 13);
  const holdStyle = getProcedureStyle(hold, 13);

  assert.notEqual(sidStyle.stroke, starStyle.stroke);
  assert.notEqual(starStyle.stroke, approachStyle.stroke);
  assert.deepEqual(starStyle.lineDash, [10, 6]);
  assert.deepEqual(approachStyle.lineDash, [10, 4, 2, 4]);
  assert.deepEqual(holdStyle.lineDash, [6, 5]);
});

test("chart modes suppress clutter according to editorial intent", () => {
  const enrouteAirway = {
    layer: "airways",
    properties: { airwayName: "J60", routeType: "JET", importance: "major" }
  };
  const terminalWaypoint = {
    layer: "waypoints",
    properties: { ident: "DAG", importance: "minor" }
  };
  const procedure = {
    layer: "procedures",
    properties: { procedureId: "procedure:PD:US:KSNA:STAYY4:4:RW20R", procedureType: "SID" }
  };

  assert.equal(isFeatureVisibleInChartMode({
    feature: enrouteAirway,
    descriptor: getDefaultLayerDescriptor("airways"),
    zoom: 7,
    mode: CHART_MODE_ENROUTE
  }), true);
  assert.equal(isFeatureVisibleInChartMode({
    feature: terminalWaypoint,
    descriptor: getDefaultLayerDescriptor("waypoints"),
    zoom: 9,
    mode: CHART_MODE_ENROUTE
  }), false);
  assert.equal(isFeatureVisibleInChartMode({
    feature: procedure,
    descriptor: getDefaultLayerDescriptor("procedures"),
    zoom: 10,
    mode: CHART_MODE_TERMINAL,
    procedureState: { show: false, selected: "all" }
  }), false);
});

test("procedure mode isolates selected procedure and relevant fix labels", () => {
  const debugLegs = [
    {
      properties: {
        procedureId: "procedure:APP:US:KSNA:ILS20R:1:RW20R",
        legType: "TF",
        fixIdent: "STARY"
      }
    },
    {
      properties: {
        procedureId: "procedure:APP:US:KSNA:ILS20R:1:RW20R",
        legType: "RF",
        fixIdent: "CFIX"
      }
    }
  ];
  const focus = createProcedureFocusContext(debugLegs, "procedure:APP:US:KSNA:ILS20R:1:RW20R");
  const selectedProcedure = {
    layer: "procedures",
    properties: { procedureId: "procedure:APP:US:KSNA:ILS20R:1:RW20R", procedureType: "APPROACH" }
  };
  const otherProcedure = {
    layer: "procedures",
    properties: { procedureId: "procedure:APP:US:KSNA:RNAV20R:1:RW20R", procedureType: "APPROACH" }
  };
  const focusWaypoint = {
    layer: "waypoints",
    properties: { ident: "CFIX", importance: "minor" }
  };

  assert.equal(isFeatureVisibleInChartMode({
    feature: selectedProcedure,
    descriptor: getDefaultLayerDescriptor("procedures"),
    zoom: 11,
    mode: CHART_MODE_PROCEDURE,
    procedureState: { show: true, selected: "procedure:APP:US:KSNA:ILS20R:1:RW20R" },
    focusContext: focus
  }), true);
  assert.equal(isFeatureVisibleInChartMode({
    feature: otherProcedure,
    descriptor: getDefaultLayerDescriptor("procedures"),
    zoom: 11,
    mode: CHART_MODE_PROCEDURE,
    procedureState: { show: true, selected: "procedure:APP:US:KSNA:ILS20R:1:RW20R" },
    focusContext: focus
  }), false);

  const baseLabel = getLabelRule(focusWaypoint, getDefaultLayerDescriptor("waypoints"), 13);
  const modeLabel = getLabelRuleForChartMode({
    feature: focusWaypoint,
    descriptor: getDefaultLayerDescriptor("waypoints"),
    baseRule: baseLabel,
    zoom: 13,
    mode: CHART_MODE_PROCEDURE,
    procedureState: { show: true, selected: "procedure:APP:US:KSNA:ILS20R:1:RW20R" },
    focusContext: focus
  });
  assert.equal(modeLabel.enabled, true);
  assert.ok(modeLabel.priority > baseLabel.priority);
});

test("spatial helpers build deterministic focus bboxes", () => {
  const bbox = getFeatureBBox({
    geometry: { type: "LineString", coordinates: [[1, 2], [3, 5], [2, 4]] }
  });
  assert.deepEqual(bbox, [1, 2, 3, 5]);
  assert.deepEqual(expandBBox([1, 2, 3, 4], 2), [-1, 0, 5, 6]);
  assert.equal(bboxIntersects([0, 0, 2, 2], [1, 1, 3, 3]), true);
  assert.equal(bboxIntersects([0, 0, 1, 1], [2, 2, 3, 3]), false);

  const airportFocus = buildAirportFocusBBox({
    airportBBox: [10, 10, 10.2, 10.1],
    runwayBBoxes: [[10.05, 10.02, 10.18, 10.04]],
    airportMargin: 0.3,
    runwayMargin: 0.1
  });
  assert.deepEqual(airportFocus, [9.9, 9.9, 10.299999999999999, 10.2]);

  const procedureFocus = buildProcedureFocusBBox({
    procedureBBox: [20, 20, 20.4, 20.2],
    procedureLegBBoxes: [[20.35, 20.15, 20.55, 20.35]],
    margin: 0.2
  });
  assert.deepEqual(procedureFocus, [19.8, 19.8, 20.75, 20.55]);
});

test("terminal and procedure modes honor spatial context", () => {
  const terminalAirspace = {
    layer: "airspaces",
    bbox: [0, 0, 1, 1],
    properties: { name: "LOCAL CTR", airspaceClass: "CLASS D", importance: "major" }
  };
  const distantAirspace = {
    layer: "airspaces",
    bbox: [10, 10, 11, 11],
    properties: { name: "DISTANT CTA", airspaceClass: "CLASS E", importance: "major" }
  };
  const focusWaypoint = {
    layer: "waypoints",
    bbox: [0.1, 0.1, 0.1, 0.1],
    properties: { ident: "CFIX", importance: "minor" }
  };

  assert.equal(isFeatureVisibleInChartMode({
    feature: terminalAirspace,
    descriptor: getDefaultLayerDescriptor("airspaces"),
    zoom: 9,
    mode: CHART_MODE_TERMINAL,
    spatialContext: { terminalFocusBBox: [-1, -1, 2, 2], terminalContextBBox: [-2, -2, 3, 3] }
  }), true);
  assert.equal(isFeatureVisibleInChartMode({
    feature: distantAirspace,
    descriptor: getDefaultLayerDescriptor("airspaces"),
    zoom: 9,
    mode: CHART_MODE_TERMINAL,
    spatialContext: { terminalFocusBBox: [-1, -1, 2, 2], terminalContextBBox: [-2, -2, 3, 3] }
  }), false);

  const procedureBaseLabel = getLabelRule(focusWaypoint, getDefaultLayerDescriptor("waypoints"), 13);
  assert.equal(getLabelRuleForChartMode({
    feature: focusWaypoint,
    descriptor: getDefaultLayerDescriptor("waypoints"),
    baseRule: procedureBaseLabel,
    zoom: 13,
    mode: CHART_MODE_PROCEDURE,
    focusContext: { selected: true, fixIdents: new Set(["CFIX"]) },
    spatialContext: { procedureFocusBBox: [-1, -1, 2, 2] }
  }).enabled, true);
  assert.equal(getLabelRuleForChartMode({
    feature: focusWaypoint,
    descriptor: getDefaultLayerDescriptor("waypoints"),
    baseRule: procedureBaseLabel,
    zoom: 13,
    mode: CHART_MODE_PROCEDURE,
    focusContext: { selected: true, fixIdents: new Set(["CFIX"]) },
    spatialContext: { procedureFocusBBox: [5, 5, 6, 6] }
  }).enabled, false);
});
