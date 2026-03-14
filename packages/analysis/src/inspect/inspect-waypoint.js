import { validateCanonicalModel } from "@arinc424/core";

function findWaypoint(waypoints, token) {
  const t = String(token || "").trim().toLowerCase();
  if (!t) return null;
  return waypoints.find((w) => String(w.id).toLowerCase() === t)
    || waypoints.find((w) => String(w.ident || "").toLowerCase() === t)
    || waypoints.find((w) => String(w.name || "").toLowerCase() === t)
    || waypoints.find((w) => String(w.id || "").toLowerCase().endsWith(t))
    || null;
}

function coordNear(a, b, eps = 1e-9) {
  return Array.isArray(a) && Array.isArray(b) && Math.abs(a[0] - b[0]) <= eps && Math.abs(a[1] - b[1]) <= eps;
}

/**
 * Inspect one canonical waypoint.
 * @param {object} canonicalModel
 * @param {string} idOrIdent
 * @returns {object}
 */
export function inspectWaypoint(canonicalModel, idOrIdent) {
  validateCanonicalModel(canonicalModel);
  const waypoint = findWaypoint(canonicalModel.entities.waypoints ?? [], idOrIdent);
  if (!waypoint) return { found: false, input: idOrIdent, kind: "waypoint", warnings: ["Waypoint not found"] };

  const coord = Array.isArray(waypoint.coord) ? waypoint.coord : null;

  const airways = (canonicalModel.entities.airways ?? [])
    .filter((a) => Array.isArray(a.coordinates) && coord && a.coordinates.some((c) => coordNear(c, coord)))
    .map((a) => ({ id: a.id, airwayName: a.airwayName ?? null, airwayType: a.airwayType ?? null }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const procedures = (canonicalModel.entities.procedures ?? [])
    .filter((p) => Array.isArray(p.coordinates) && coord && p.coordinates.some((c) => coordNear(c, coord)))
    .map((p) => ({ id: p.id, procedureType: p.procedureType ?? null, airportId: p.airportId ?? null }))
    .sort((a, b) => a.id.localeCompare(b.id));

  return {
    found: true,
    kind: "waypoint",
    id: waypoint.id,
    ident: waypoint.ident ?? null,
    name: waypoint.name ?? null,
    type: waypoint.type,
    sourceRefs: waypoint.sourceRefs ?? [],
    bounds: coord ? [coord[0], coord[1], coord[0], coord[1]] : null,
    geometrySummary: {
      geometryType: coord ? "Point" : null,
      hasCoordinates: Boolean(coord)
    },
    relatedEntities: {
      airways,
      procedures
    },
    warnings: []
  };
}
