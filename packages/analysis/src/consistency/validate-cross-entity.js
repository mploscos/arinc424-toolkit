import { validateCanonicalModel } from "@arinc424/core";
import { buildLookups } from "../relations/build-lookups.js";
import { resolveAirportReference, resolveFixReference } from "../relations/resolve-entities.js";

/**
 * Validate cross-entity consistency in canonical model relations.
 * @param {object} canonicalModel
 * @returns {{valid:boolean,errors:string[],warnings:string[],summary:object}}
 */
export function validateCrossEntityConsistency(canonicalModel) {
  validateCanonicalModel(canonicalModel);
  const lookups = buildLookups(canonicalModel);
  const errors = [];
  const warnings = [];

  for (const runway of canonicalModel.entities.runways ?? []) {
    const airportId = runway?.refs?.airportId ?? runway?.airportId;
    const resolution = resolveAirportReference(lookups, airportId);
    if (airportId && !resolution.resolved) {
      if (resolution.matchType === "ambiguous-ident") {
        warnings.push(`Runway ${runway.id} references ambiguous airport ${airportId}`);
        warnings.push(...resolution.warnings.map((warning) => `Runway ${runway.id}: ${warning}`));
        continue;
      }
      errors.push(`Runway ${runway.id} references missing airport ${airportId}`);
    }
  }

  for (const procedure of canonicalModel.entities.procedures ?? []) {
    const airportId = procedure?.airportId ?? procedure?.refs?.airportId;
    const airportResolution = resolveAirportReference(lookups, airportId);
    if (airportId && !airportResolution.resolved) {
      if (airportResolution.matchType === "ambiguous-ident") {
        warnings.push(`Procedure ${procedure.id} references ambiguous airport ${airportId}`);
        warnings.push(...airportResolution.warnings.map((warning) => `Procedure ${procedure.id}: ${warning}`));
      } else {
      errors.push(`Procedure ${procedure.id} references missing airport ${airportId}`);
      }
    }

    if (procedure?.runwayId && !lookups.runwaysById.has(procedure.runwayId)) {
      errors.push(`Procedure ${procedure.id} references missing runway ${procedure.runwayId}`);
    }

    const fixIds = procedure?.refs?.fixIds ?? [];
    for (const fixId of fixIds) {
      const resolution = resolveFixReference(lookups, fixId);
      if (!resolution.resolved) {
        if (resolution.matchType === "ambiguous-ident") {
          warnings.push(`Procedure ${procedure.id} references ambiguous fix ${fixId}`);
          warnings.push(...resolution.warnings.map((warning) => `Procedure ${procedure.id}: ${warning}`));
        } else {
          errors.push(`Procedure ${procedure.id} references missing fix ${fixId}`);
        }
      }
    }

    const rawFixIds = Array.isArray(procedure?.refs?.fixRawIds) ? procedure.refs.fixRawIds : [];
    const unresolvedRawFixes = rawFixIds.filter((rawFixId) => {
      const resolution = resolveFixReference(lookups, rawFixId);
      if (!resolution.resolved && resolution.matchType === "ambiguous-ident") {
        warnings.push(`Procedure ${procedure.id} references ambiguous raw fix ${rawFixId}`);
        warnings.push(...resolution.warnings.map((warning) => `Procedure ${procedure.id}: ${warning}`));
        return false;
      }
      return !resolution.resolved;
    });
    if (unresolvedRawFixes.length > 0) {
      warnings.push(`Procedure ${procedure.id} has unresolved raw fixes (${unresolvedRawFixes.length})`);
    }
  }

  for (const airway of canonicalModel.entities.airways ?? []) {
    const segFixIds = airway?.refs?.segmentFixIds ?? [];
    const segRaw = airway?.refs?.segmentFixRaw ?? [];
    for (const fixId of segFixIds) {
      const resolution = resolveFixReference(lookups, fixId);
      if (!resolution.resolved) {
        if (resolution.matchType === "ambiguous-ident") {
          warnings.push(`Airway ${airway.id} references ambiguous segment fix ${fixId}`);
          warnings.push(...resolution.warnings.map((warning) => `Airway ${airway.id}: ${warning}`));
        } else {
          errors.push(`Airway ${airway.id} references missing segment fix ${fixId}`);
        }
      }
    }

    const unresolvedSegmentRaw = segRaw.filter((rawFixId) => {
      const resolution = resolveFixReference(lookups, rawFixId);
      if (!resolution.resolved && resolution.matchType === "ambiguous-ident") {
        warnings.push(`Airway ${airway.id} references ambiguous raw fix ${rawFixId}`);
        warnings.push(...resolution.warnings.map((warning) => `Airway ${airway.id}: ${warning}`));
        return false;
      }
      return !resolution.resolved;
    });
    if (unresolvedSegmentRaw.length > 0) {
      warnings.push(`Airway ${airway.id} has unresolved raw fixes (${unresolvedSegmentRaw.length})`);
    }
  }

  for (const hold of canonicalModel.entities.holds ?? []) {
    const fixId = hold?.fixId ?? hold?.refs?.fixId;
    const resolution = resolveFixReference(lookups, fixId);
    if (fixId && !resolution.resolved) {
      if (resolution.matchType === "ambiguous-ident") {
        warnings.push(`Hold ${hold.id} references ambiguous fix ${fixId}`);
        warnings.push(...resolution.warnings.map((warning) => `Hold ${hold.id}: ${warning}`));
        continue;
      }
      errors.push(`Hold ${hold.id} references missing fix ${fixId}`);
    }
  }

  const ambiguousWaypointIdents = [...lookups.waypointsByIdent.entries()]
    .filter(([, arr]) => arr.length > 1)
    .map(([ident, arr]) => ({ ident, count: arr.length }))
    .sort((a, b) => a.ident.localeCompare(b.ident));

  for (const dup of ambiguousWaypointIdents) {
    warnings.push(`Waypoint ident ${dup.ident} is ambiguous (${dup.count} canonical entities)`);
  }

  const ambiguousNavaidIdents = [...lookups.navaidsByIdent.entries()]
    .filter(([, arr]) => arr.length > 1)
    .map(([ident, arr]) => ({ ident, count: arr.length }))
    .sort((a, b) => a.ident.localeCompare(b.ident));

  for (const dup of ambiguousNavaidIdents) {
    warnings.push(`Navaid ident ${dup.ident} is ambiguous (${dup.count} canonical entities)`);
  }

  return {
    valid: errors.length === 0,
    errors: [...errors].sort((a, b) => a.localeCompare(b)),
    warnings: [...warnings].sort((a, b) => a.localeCompare(b)),
    summary: {
      runwayCount: canonicalModel.entities.runways.length,
      procedureCount: canonicalModel.entities.procedures.length,
      airwayCount: canonicalModel.entities.airways.length,
      holdCount: canonicalModel.entities.holds.length,
      errorCount: errors.length,
      warningCount: warnings.length
    }
  };
}
