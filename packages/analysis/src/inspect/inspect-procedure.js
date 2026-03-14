import { validateCanonicalModel } from "@arinc424/core";
import { buildLookups } from "../relations/build-lookups.js";

function findProcedure(procedures, token) {
  const t = String(token || "").trim().toLowerCase();
  if (!t) return null;
  return procedures.find((p) => String(p.id).toLowerCase() === t)
    || procedures.find((p) => String(p.id || "").toLowerCase().endsWith(t))
    || procedures.find((p) => String(p.procedureCode || "").toLowerCase() === t)
    || procedures.find((p) => String(p.transitionId || "").toLowerCase() === t)
    || null;
}

/**
 * Inspect one canonical procedure.
 * @param {object} canonicalModel
 * @param {string} idOrToken
 * @returns {object}
 */
export function inspectProcedure(canonicalModel, idOrToken) {
  validateCanonicalModel(canonicalModel);
  const procedure = findProcedure(canonicalModel.entities.procedures ?? [], idOrToken);
  if (!procedure) {
    return { found: false, input: idOrToken, kind: "procedure", warnings: ["Procedure not found"] };
  }

  const lookups = buildLookups(canonicalModel);
  const warnings = [];

  if (procedure.airportId && !lookups.airportsById.has(procedure.airportId)) {
    warnings.push(`Referenced airport not found: ${procedure.airportId}`);
  }
  if (procedure.runwayId && !lookups.runwaysById.has(procedure.runwayId)) {
    warnings.push(`Referenced runway not found: ${procedure.runwayId}`);
  }

  const fixIds = [...new Set(procedure?.refs?.fixIds ?? [])].sort((a, b) => a.localeCompare(b));
  const fixEntities = fixIds.map((fixId) => {
    const fix = lookups.waypointsById.get(fixId) ?? lookups.navaidsById.get(fixId) ?? null;
    if (!fix) {
      warnings.push(`Referenced fix not found: ${fixId}`);
      return { id: fixId, ident: null, type: null };
    }
    return { id: fixId, ident: fix.ident ?? null, type: fix.type ?? null };
  });

  const legCount = Array.isArray(procedure.legs) ? procedure.legs.length : 0;

  return {
    found: true,
    kind: "procedure",
    id: procedure.id,
    type: procedure.type,
    procedureType: procedure.procedureType ?? null,
    procedureCode: procedure.procedureCode ?? null,
    transitionId: procedure.transitionId ?? null,
    sourceRefs: procedure.sourceRefs ?? [],
    bounds: Array.isArray(procedure.bbox) ? procedure.bbox : null,
    geometrySummary: {
      geometryType: "LineString",
      legCount,
      coordinateCount: Array.isArray(procedure.coordinates) ? procedure.coordinates.length : 0
    },
    relatedEntities: {
      airport: procedure.airportId
        ? {
          id: procedure.airportId,
          ident: lookups.airportsById.get(procedure.airportId)?.ident ?? null,
          name: lookups.airportsById.get(procedure.airportId)?.name ?? null
        }
        : null,
      runway: procedure.runwayId
        ? {
          id: procedure.runwayId,
          runwayDesignator: lookups.runwaysById.get(procedure.runwayId)?.runwayDesignator ?? null
        }
        : null,
      fixes: fixEntities
    },
    warnings: [...new Set(warnings)].sort((a, b) => a.localeCompare(b))
  };
}
