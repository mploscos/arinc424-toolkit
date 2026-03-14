import { validateCanonicalModel } from "@arinc424/core";
import { buildRelations } from "../relations/build-relations.js";

function bboxFromCoordinates(coords) {
  if (!Array.isArray(coords) || coords.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of coords) {
    if (!Array.isArray(p) || p.length < 2) continue;
    const [x, y] = p;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return Number.isFinite(minX) ? [minX, minY, maxX, maxY] : null;
}

function findByIdOrToken(items, token) {
  const t = String(token || "").trim();
  if (!t) return null;
  return items.find((i) => i.id === t)
    || items.find((i) => String(i.id).toLowerCase().endsWith(t.toLowerCase()))
    || items.find((i) => String(i.name || "").toLowerCase() === t.toLowerCase())
    || null;
}

/**
 * Inspect one canonical airspace.
 * @param {object} canonicalModel
 * @param {string} idOrToken
 * @returns {object}
 */
export function inspectAirspace(canonicalModel, idOrToken) {
  validateCanonicalModel(canonicalModel);
  const entity = findByIdOrToken(canonicalModel.entities.airspaces ?? [], idOrToken);
  if (!entity) {
    return { found: false, input: idOrToken, kind: "airspace", warnings: ["Airspace not found"] };
  }

  const warnings = [
    ...(Array.isArray(entity.validationWarnings) ? entity.validationWarnings : []),
    ...(Array.isArray(entity.reconstructionWarnings) ? entity.reconstructionWarnings : [])
  ];

  const coords = Array.isArray(entity.coordinates) ? entity.coordinates : [];
  if (coords.length >= 2) {
    const first = coords[0];
    const last = coords[coords.length - 1];
    if (Array.isArray(first) && Array.isArray(last)) {
      const closed = Math.abs(first[0] - last[0]) < 1e-9 && Math.abs(first[1] - last[1]) < 1e-9;
      if (!closed) warnings.push("Boundary ring is not explicitly closed");
    }
  }

  const segmentMetadata = entity.segmentMetadata
    ?? entity.geometryDebug?.segmentMetadata
    ?? entity.reconstructionMetadata?.segmentMetadata
    ?? [];

  const relations = buildRelations(canonicalModel);
  const row = relations.airspaceRelations[entity.id] ?? {
    nearbyEntityRefs: []
  };

  return {
    found: true,
    kind: "airspace",
    id: entity.id,
    type: entity.type,
    name: entity.name ?? null,
    sourceRefs: entity.sourceRefs ?? [],
    bounds: Array.isArray(entity.bbox) ? entity.bbox : bboxFromCoordinates(coords),
    geometrySummary: {
      geometryType: "Polygon",
      vertexCount: coords.length,
      segmentCount: Array.isArray(segmentMetadata) ? segmentMetadata.length : null,
      hasArcSegments: Boolean(
        (segmentMetadata ?? []).some((s) => ["L", "R", "C", "A"].includes(String(s?.via || "").toUpperCase()))
      )
    },
    relatedEntities: {
      restrictiveType: entity.restrictiveType ?? null,
      airspaceClass: entity.airspaceClass ?? null,
      airspaceType: entity.airspaceType ?? null,
      segmentMetadata,
      nearbyEntities: row.nearbyEntityRefs ?? []
    },
    limits: {
      lowerLimitM: entity.lowerLimitM ?? null,
      upperLimitM: entity.upperLimitM ?? null
    },
    warnings: [...new Set(warnings)].sort((a, b) => a.localeCompare(b))
  };
}
