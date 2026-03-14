import { validateCrossEntityConsistency } from "../consistency/validate-cross-entity.js";
import { buildLookups } from "../relations/build-lookups.js";

function centerOfBbox(bbox) {
  if (!Array.isArray(bbox) || bbox.length !== 4) return null;
  const [minX, minY, maxX, maxY] = bbox;
  if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null;
  return [(minX + maxX) / 2, (minY + maxY) / 2];
}

function bboxFromEntity(entity) {
  if (Array.isArray(entity?.bbox) && entity.bbox.length === 4) return entity.bbox;
  if (Array.isArray(entity?.coord) && entity.coord.length >= 2) {
    return [entity.coord[0], entity.coord[1], entity.coord[0], entity.coord[1]];
  }
  if (Array.isArray(entity?.coordinates) && entity.coordinates.length) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of entity.coordinates) {
      if (!Array.isArray(p) || p.length < 2) continue;
      const [x, y] = p;
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
    if (Number.isFinite(minX)) return [minX, minY, maxX, maxY];
  }
  return null;
}

function parseIssueType(message) {
  const text = String(message || "").toLowerCase();
  if (text.includes("missing airport")) return "missing-airport";
  if (text.includes("missing runway")) return "missing-runway";
  if (text.includes("missing fix")) return "missing-fix";
  if (text.includes("unresolved raw fixes")) return "unresolved-reference";
  if (text.includes("ambiguous")) return "ambiguous-ident";
  return "relation-warning";
}

function extractEntityId(message) {
  const m = String(message || "").match(/\b([a-z]+:[^\s]+)\b/i);
  return m ? m[1] : null;
}

function findEntityByMessage(lookups, message) {
  const directId = extractEntityId(message);
  if (directId && lookups.entitiesById.has(directId)) return lookups.entitiesById.get(directId);

  const text = String(message || "");
  const identMatch = text.match(/ident\s+([A-Z0-9]+)/i);
  if (identMatch) {
    const ident = identMatch[1].toUpperCase();
    const wp = lookups.waypointsByIdent.get(ident)?.[0];
    if (wp) return wp;
    const nv = lookups.navaidsByIdent.get(ident)?.[0];
    if (nv) return nv;
  }

  return null;
}

/**
 * Build georeferenced issue features from consistency output.
 * @param {object} canonicalModel
 * @param {object} [consistencyResult]
 * @returns {{type:"FeatureCollection",features:object[],summary:object}}
 */
export function buildIssueFeatures(canonicalModel, consistencyResult = null) {
  const consistency = consistencyResult ?? validateCrossEntityConsistency(canonicalModel);
  const lookups = buildLookups(canonicalModel);

  const rows = [
    ...(consistency.errors ?? []).map((message) => ({ severity: "error", message })),
    ...(consistency.warnings ?? []).map((message) => ({ severity: "warning", message }))
  ];

  const features = rows.map((row, idx) => {
    const relatedEntity = findEntityByMessage(lookups, row.message);
    const relatedEntityId = relatedEntity?.id ?? extractEntityId(row.message);
    const bbox = relatedEntity ? bboxFromEntity(relatedEntity) : null;
    const coordinates = centerOfBbox(bbox);
    const type = parseIssueType(row.message);

    return {
      type: "Feature",
      id: `issue:${row.severity}:${idx + 1}`,
      geometry: coordinates ? { type: "Point", coordinates } : null,
      properties: {
        id: `issue:${row.severity}:${idx + 1}`,
        severity: row.severity,
        type,
        message: row.message,
        relatedEntityId: relatedEntityId ?? null,
        bbox: bbox ?? null
      },
      bbox: bbox ?? undefined
    };
  });

  const sorted = [...features].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return {
    type: "FeatureCollection",
    features: sorted,
    summary: {
      issueCount: sorted.length,
      errorCount: sorted.filter((f) => f.properties.severity === "error").length,
      warningCount: sorted.filter((f) => f.properties.severity === "warning").length
    }
  };
}
