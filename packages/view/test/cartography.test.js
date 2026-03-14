import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCartography,
  buildLabelCandidates,
  deriveProcedureDisplay,
  getDefaultLayerDescriptor,
  isFeatureVisibleAtZoom,
  getLabelRule,
  getProcedureStyle
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
  assert.equal(airports.maxZoom, 10);
  assert.deepEqual(cartography.bounds, [-10, 35, 5, 45]);
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
  const labelAt5 = getLabelRule(majorAirport, airportDescriptor, 5);
  const labelAt6 = getLabelRule(majorAirport, airportDescriptor, 6);
  assert.equal(labelAt5.enabled, false);
  assert.equal(labelAt6.enabled, true);
  assert.ok(labelAt6.priority > 0);

  const waypointDescriptor = getDefaultLayerDescriptor("waypoints");
  const minorWaypoint = {
    properties: { ident: "DPK", importance: "minor" },
    minZoom: undefined,
    maxZoom: undefined
  };
  assert.equal(isFeatureVisibleAtZoom(minorWaypoint, waypointDescriptor, 10), false);
  assert.equal(isFeatureVisibleAtZoom(minorWaypoint, waypointDescriptor, 11), true);
  assert.equal(getLabelRule(minorWaypoint, waypointDescriptor, 11).enabled, false);
  assert.equal(getLabelRule(minorWaypoint, waypointDescriptor, 12).enabled, true);

  const procedureDescriptor = getDefaultLayerDescriptor("procedure");
  const approachProcedure = {
    properties: {
      procedureType: "APPROACH",
      procedureId: "procedure:APP:TEST:01"
    },
    minZoom: undefined,
    maxZoom: undefined
  };
  assert.equal(isFeatureVisibleAtZoom(approachProcedure, procedureDescriptor, 8), false);
  assert.equal(isFeatureVisibleAtZoom(approachProcedure, procedureDescriptor, 9), true);
  assert.equal(getLabelRule(approachProcedure, procedureDescriptor, 9).enabled, false);
  assert.equal(getLabelRule(approachProcedure, procedureDescriptor, 10).enabled, true);
  assert.ok(getProcedureStyle(approachProcedure, 14).width > getProcedureStyle({ properties: { procedureType: "SID" } }, 14).width);
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
