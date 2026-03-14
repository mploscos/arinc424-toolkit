import { validateCanonicalModel } from "@arinc424/core";
import { buildLookups } from "../relations/build-lookups.js";
import { buildRelations } from "../relations/build-relations.js";

function findWaypoint(waypoints, token) {
  const t = String(token || "").trim().toLowerCase();
  if (!t) return null;
  return waypoints.find((w) => String(w.id).toLowerCase() === t)
    || waypoints.find((w) => String(w.ident || "").toLowerCase() === t)
    || waypoints.find((w) => String(w.name || "").toLowerCase() === t)
    || waypoints.find((w) => String(w.id || "").toLowerCase().endsWith(t))
    || null;
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

  const lookups = buildLookups(canonicalModel);
  const relations = buildRelations(canonicalModel);
  const row = relations.waypointRelations[waypoint.id] ?? {
    airwayIds: [],
    procedureIds: [],
    holdIds: []
  };

  const airways = row.airwayIds
    .map((id) => lookups.airwaysById.get(id))
    .filter(Boolean)
    .map((a) => ({ id: a.id, airwayName: a.airwayName ?? null, airwayType: a.airwayType ?? null }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const procedures = row.procedureIds
    .map((id) => lookups.proceduresById.get(id))
    .filter(Boolean)
    .map((p) => ({ id: p.id, procedureType: p.procedureType ?? null, airportId: p.airportId ?? null }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const holds = row.holdIds
    .map((id) => lookups.holdsById.get(id))
    .filter(Boolean)
    .map((h) => ({ id: h.id, minAltitudeM: h.minAltitudeM ?? null, maxAltitudeM: h.maxAltitudeM ?? null }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const coord = Array.isArray(waypoint.coord) ? waypoint.coord : null;
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
      procedures,
      holds
    },
    relationSummary: {
      airwayCount: airways.length,
      procedureCount: procedures.length,
      holdCount: holds.length
    },
    warnings: []
  };
}
