const allowedLayers = new Set(["airports", "heliports", "runways", "waypoints", "navaids", "airways", "airspaces", "procedures", "holds"]);

const layerRules = {
  airports: { type: "airport", geometry: ["Point"], requiredProps: ["id", "type", "source", "sourceRefs", "createdFrom", "icao", "ident"] },
  heliports: { type: "heliport", geometry: ["Point"], requiredProps: ["id", "type", "source", "sourceRefs", "createdFrom", "ident"] },
  runways: { type: "runway", geometry: ["Point", "LineString"], requiredProps: ["id", "type", "source", "sourceRefs", "createdFrom", "airportId", "runwayDesignator"] },
  waypoints: { type: "waypoint", geometry: ["Point"], requiredProps: ["id", "type", "source", "sourceRefs", "createdFrom", "ident"] },
  navaids: { type: "navaid", geometry: ["Point"], requiredProps: ["id", "type", "source", "sourceRefs", "createdFrom", "ident", "navaidType"] },
  airways: { type: "airway", geometry: ["LineString"], requiredProps: ["id", "type", "source", "sourceRefs", "createdFrom", "airwayName"] },
  airspaces: { type: "airspace", geometry: ["Polygon", "MultiPolygon"], requiredProps: ["id", "type", "source", "sourceRefs", "createdFrom"] },
  procedures: { type: "procedure", geometry: ["LineString"], requiredProps: ["id", "type", "source", "sourceRefs", "createdFrom", "procedureType", "airportId"] },
  holds: { type: "hold", geometry: ["LineString", "Polygon"], requiredProps: ["id", "type", "source", "sourceRefs", "createdFrom", "fixId"] }
};

function fail(msg) {
  throw new Error(`Feature schema validation failed: ${msg}`);
}

export function assertFeatureBaseSchema(feature) {
  if (!feature || typeof feature !== "object") fail("feature must be an object");
  if (typeof feature.id !== "string" || !feature.id) fail("feature.id must be a non-empty string");
  if (!allowedLayers.has(feature.layer)) fail(`feature.layer is invalid: ${feature.layer}`);
  if (!feature.geometry || typeof feature.geometry !== "object") fail("feature.geometry must be an object");
  if (!["Point", "LineString", "Polygon", "MultiPolygon"].includes(feature.geometry.type)) {
    fail(`feature.geometry.type is invalid: ${feature.geometry?.type}`);
  }
  if (!feature.properties || typeof feature.properties !== "object") fail("feature.properties must be an object");
  if (!Array.isArray(feature.bbox) || feature.bbox.length !== 4) fail("feature.bbox must be a 4-number array");
}

export function assertFeatureDiscriminatorSchema(feature) {
  const rule = layerRules[feature.layer];
  if (!rule) fail(`no discriminator rule for layer ${feature.layer}`);
  if (!rule.geometry.includes(feature.geometry.type)) {
    fail(`layer ${feature.layer} does not support geometry type ${feature.geometry.type}`);
  }
  if (feature.properties.type !== rule.type) {
    fail(`layer ${feature.layer} requires properties.type=${rule.type}, got ${feature.properties.type}`);
  }
  for (const prop of rule.requiredProps) {
    if (!Object.prototype.hasOwnProperty.call(feature.properties, prop)) {
      fail(`layer ${feature.layer} missing required properties.${prop}`);
    }
  }
  if (feature.properties.createdFrom?.canonicalSchema !== "navdata-canonical") {
    fail(`layer ${feature.layer} requires properties.createdFrom.canonicalSchema=navdata-canonical`);
  }
}
