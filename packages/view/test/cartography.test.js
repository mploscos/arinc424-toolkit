import test from "node:test";
import assert from "node:assert/strict";
import { buildCartography } from "../src/cartography/index.js";

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
