import { validateCanonicalModel } from "@arinc424/core";
import { validateFeatureModel } from "./validate.js";

const DEFAULT_ZOOM_RULES = {
  airports: [6, 14],
  heliports: [8, 14],
  runways: [10, 15],
  waypoints: [9, 14],
  navaids: [8, 14],
  airways: [7, 12],
  airspaces: [4, 12],
  procedures: [8, 15],
  holds: [11, 15]
};

function bboxFromGeometry(geometry) {
  const points = [];
  function walk(coords) {
    if (!Array.isArray(coords)) return;
    if (typeof coords[0] === "number") {
      points.push(coords);
      return;
    }
    for (const child of coords) walk(child);
  }
  walk(geometry?.coordinates);
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const [lon, lat] of points) {
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    minLon = Math.min(minLon, lon);
    minLat = Math.min(minLat, lat);
    maxLon = Math.max(maxLon, lon);
    maxLat = Math.max(maxLat, lat);
  }
  return Number.isFinite(minLon) ? [minLon, minLat, maxLon, maxLat] : null;
}

function toFeature(layer, geometry, properties, sourceRefs, zoomRules) {
  const bbox = bboxFromGeometry(geometry);
  if (!bbox) return null;
  const [minZoom, maxZoom] = zoomRules[layer] ?? [0, 24];
  return {
    id: properties.id,
    layer,
    geometry,
    properties,
    bbox,
    minZoom,
    maxZoom,
    sourceRefs: sourceRefs ?? []
  };
}

function cleanObject(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

function baseProps(entity, type, canonical) {
  return cleanObject({
    id: entity.id,
    type,
    name: entity.name ?? undefined,
    source: canonical.metadata.source ?? "unknown",
    sourceRefs: entity.sourceRefs ?? [],
    country: entity.icao ?? undefined,
    region: entity.region ?? undefined,
    createdFrom: {
      canonicalSchema: canonical.schema,
      canonicalVersion: canonical.schemaVersion,
      entityType: type,
      entityId: entity.id
    },
    lastUpdated: canonical.metadata.generatedAt ?? undefined
  });
}

/**
 * Build normalized features from canonical model.
 * @param {object} canonical
 * @param {{zoomRules?: Record<string, [number, number]>, generatedAt?: string|null, deterministic?: boolean}} [options]
 * @returns {{schema:string,schemaVersion:string,metadata:object,features:object[]}}
 */
export function buildFeaturesFromCanonical(canonical, options = {}) {
  validateCanonicalModel(canonical);
  const zoomRules = { ...DEFAULT_ZOOM_RULES, ...(options.zoomRules ?? {}) };
  const features = [];

  for (const a of canonical.entities.airports) {
    if (!Array.isArray(a.coord)) continue;
    const f = toFeature(
      "airports",
      { type: "Point", coordinates: a.coord },
      cleanObject({ ...baseProps(a, "airport", canonical), icao: a.icao, ident: a.ident, elevationM: a.elevationM }),
      a.sourceRefs,
      zoomRules
    );
    if (f) features.push(f);
  }

  for (const h of canonical.entities.heliports) {
    if (!Array.isArray(h.coord)) continue;
    const f = toFeature(
      "heliports",
      { type: "Point", coordinates: h.coord },
      cleanObject({ ...baseProps(h, "heliport", canonical), icao: h.icao, ident: h.ident, elevationM: h.elevationM }),
      h.sourceRefs,
      zoomRules
    );
    if (f) features.push(f);
  }

  for (const r of canonical.entities.runways) {
    const geom = r.geometry ?? (Array.isArray(r.coord) ? { type: "Point", coordinates: r.coord } : null);
    if (!geom) continue;
    const f = toFeature(
      "runways",
      geom,
      cleanObject({
        ...baseProps(r, "runway", canonical),
        airportId: r.refs?.airportId ?? r.airportId,
        runwayDesignator: r.runwayDesignator,
        headingDeg: r.headingDeg,
        lengthM: r.lengthM,
        widthM: r.widthM
      }),
      r.sourceRefs,
      zoomRules
    );
    if (f) features.push(f);
  }

  for (const w of canonical.entities.waypoints) {
    if (!Array.isArray(w.coord)) continue;
    const f = toFeature(
      "waypoints",
      { type: "Point", coordinates: w.coord },
      cleanObject({ ...baseProps(w, "waypoint", canonical), ident: w.ident, usage: w.usage }),
      w.sourceRefs,
      zoomRules
    );
    if (f) features.push(f);
  }

  for (const n of canonical.entities.navaids) {
    if (!Array.isArray(n.coord)) continue;
    const f = toFeature(
      "navaids",
      { type: "Point", coordinates: n.coord },
      cleanObject({ ...baseProps(n, "navaid", canonical), ident: n.ident, navaidType: n.navaidType, frequency: n.frequency }),
      n.sourceRefs,
      zoomRules
    );
    if (f) features.push(f);
  }

  for (const a of canonical.entities.airways) {
    if (!Array.isArray(a.coordinates) || a.coordinates.length < 2) continue;
    const f = toFeature(
      "airways",
      { type: "LineString", coordinates: a.coordinates },
      cleanObject({ ...baseProps(a, "airway", canonical), airwayName: a.airwayName, airwayType: a.airwayType, upperLower: a.level, segmentOrder: 0 }),
      a.sourceRefs,
      zoomRules
    );
    if (f) features.push(f);
  }

  for (const a of canonical.entities.airspaces) {
    if (!Array.isArray(a.coordinates) || a.coordinates.length < 4) continue;
    const f = toFeature(
      "airspaces",
      { type: "Polygon", coordinates: [a.coordinates] },
      cleanObject({
        ...baseProps(a, "airspace", canonical),
        airspaceClass: a.airspaceClass,
        lowerLimit: a.lowerLimitM,
        upperLimit: a.upperLimitM,
        controllingAuthority: a.airspaceType
      }),
      a.sourceRefs,
      zoomRules
    );
    if (f) features.push(f);
  }

  for (const p of canonical.entities.procedures) {
    if (!Array.isArray(p.coordinates) || p.coordinates.length < 2) continue;
    const f = toFeature(
      "procedures",
      { type: "LineString", coordinates: p.coordinates },
      cleanObject({
        ...baseProps(p, "procedure", canonical),
        procedureType: p.procedureType,
        airportId: p.airportId,
        runwayId: p.runwayId,
        sequenceIndex: 0
      }),
      p.sourceRefs,
      zoomRules
    );
    if (f) features.push(f);
  }

  for (const h of canonical.entities.holds) {
    if (!Array.isArray(h.coordinates) || h.coordinates.length < 2) continue;
    const f = toFeature(
      "holds",
      { type: "LineString", coordinates: h.coordinates },
      cleanObject({ ...baseProps(h, "hold", canonical), fixId: h.fixId }),
      h.sourceRefs,
      zoomRules
    );
    if (f) features.push(f);
  }

  const sorted = [...features].sort((a, b) => a.layer.localeCompare(b.layer) || a.id.localeCompare(b.id));
  const model = {
    schema: "arinc-feature-model",
    schemaVersion: "1.0.0",
    metadata: {
      generatedAt: options.generatedAt ?? null,
      source: canonical.metadata.source ?? null
    },
    features: sorted
  };

  validateFeatureModel(model);
  return model;
}
