import { validateCanonicalModel } from "@arinc424/core";
import { validateFeatureModel } from "@arinc424/features";
import { summarizeAirspaces } from "./summarize-airspaces.js";
import { summarizeAirports } from "./summarize-airports.js";

const ENTITY_KEYS = [
  "airports",
  "heliports",
  "runways",
  "waypoints",
  "navaids",
  "airways",
  "airspaces",
  "procedures",
  "holds"
];

function bboxFromGeometry(geometry) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  function walk(coords) {
    if (!Array.isArray(coords)) return;
    if (typeof coords[0] === "number" && typeof coords[1] === "number") {
      const x = Number(coords[0]);
      const y = Number(coords[1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      return;
    }
    for (const child of coords) walk(child);
  }

  walk(geometry?.coordinates);
  return Number.isFinite(minX) ? [minX, minY, maxX, maxY] : null;
}

function mergeBounds(a, b) {
  if (!a) return b ? [...b] : null;
  if (!b) return [...a];
  return [
    Math.min(a[0], b[0]),
    Math.min(a[1], b[1]),
    Math.max(a[2], b[2]),
    Math.max(a[3], b[3])
  ];
}

/**
 * Summarize canonical model statistics.
 * @param {object} canonicalModel
 * @returns {object}
 */
export function summarizeDataset(canonicalModel) {
  validateCanonicalModel(canonicalModel);

  const counts = {};
  for (const key of ENTITY_KEYS) counts[key] = canonicalModel.entities[key].length;

  return {
    schema: "arinc-analysis-summary",
    schemaVersion: "1.0.0",
    kind: "canonical",
    sourceSchema: canonicalModel.schema,
    sourceSchemaVersion: canonicalModel.schemaVersion,
    metadata: {
      source: canonicalModel.metadata?.source ?? null,
      generatedAt: canonicalModel.metadata?.generatedAt ?? null,
      datasetId: canonicalModel.metadata?.datasetId ?? null
    },
    entityCounts: counts,
    totals: {
      entities: Object.values(counts).reduce((acc, n) => acc + n, 0)
    },
    airspaces: summarizeAirspaces(canonicalModel.entities.airspaces),
    airports: summarizeAirports(canonicalModel.entities)
  };
}

/**
 * Summarize feature model statistics.
 * @param {object} featureModel
 * @returns {object}
 */
export function summarizeFeatures(featureModel) {
  validateFeatureModel(featureModel);

  const layerCounts = {};
  const geometryCounts = {};
  let bounds = null;

  for (const feature of featureModel.features ?? []) {
    const layer = String(feature.layer || "unknown");
    const geometryType = String(feature.geometry?.type || "unknown");

    layerCounts[layer] = (layerCounts[layer] ?? 0) + 1;
    geometryCounts[geometryType] = (geometryCounts[geometryType] ?? 0) + 1;

    const bbox = Array.isArray(feature.bbox) && feature.bbox.length === 4
      ? feature.bbox
      : bboxFromGeometry(feature.geometry);
    bounds = mergeBounds(bounds, bbox);
  }

  return {
    schema: "arinc-analysis-summary",
    schemaVersion: "1.0.0",
    kind: "features",
    sourceSchema: featureModel.schema,
    sourceSchemaVersion: featureModel.schemaVersion,
    metadata: {
      source: featureModel.metadata?.source ?? null,
      generatedAt: featureModel.metadata?.generatedAt ?? null
    },
    totalFeatures: featureModel.features?.length ?? 0,
    layerCounts: Object.fromEntries(Object.entries(layerCounts).sort(([a], [b]) => a.localeCompare(b))),
    geometryCounts: Object.fromEntries(Object.entries(geometryCounts).sort(([a], [b]) => a.localeCompare(b))),
    bounds
  };
}
