import { validateCanonicalModel } from "@arinc424/core";
import { buildLookups } from "../relations/build-lookups.js";

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
    if (airportId && !lookups.airportsById.has(airportId)) {
      errors.push(`Runway ${runway.id} references missing airport ${airportId}`);
    }
  }

  for (const procedure of canonicalModel.entities.procedures ?? []) {
    const airportId = procedure?.airportId ?? procedure?.refs?.airportId;
    if (airportId && !lookups.airportsById.has(airportId)) {
      errors.push(`Procedure ${procedure.id} references missing airport ${airportId}`);
    }

    if (procedure?.runwayId && !lookups.runwaysById.has(procedure.runwayId)) {
      errors.push(`Procedure ${procedure.id} references missing runway ${procedure.runwayId}`);
    }

    const fixIds = procedure?.refs?.fixIds ?? [];
    const missingFixes = fixIds.filter((fixId) => !lookups.waypointsById.has(fixId) && !lookups.navaidsById.has(fixId));
    for (const fixId of missingFixes) {
      errors.push(`Procedure ${procedure.id} references missing fix ${fixId}`);
    }

    const rawCount = Array.isArray(procedure?.refs?.fixRawIds) ? procedure.refs.fixRawIds.length : 0;
    if (rawCount > fixIds.length) {
      warnings.push(`Procedure ${procedure.id} has unresolved raw fixes (${rawCount - fixIds.length})`);
    }
  }

  for (const airway of canonicalModel.entities.airways ?? []) {
    const segFixIds = airway?.refs?.segmentFixIds ?? [];
    const segRaw = airway?.refs?.segmentFixRaw ?? [];
    const missingFixes = segFixIds.filter((fixId) => !lookups.waypointsById.has(fixId) && !lookups.navaidsById.has(fixId));
    for (const fixId of missingFixes) {
      errors.push(`Airway ${airway.id} references missing segment fix ${fixId}`);
    }
    if (segRaw.length > segFixIds.length) {
      warnings.push(`Airway ${airway.id} has unresolved raw fixes (${segRaw.length - segFixIds.length})`);
    }
  }

  for (const hold of canonicalModel.entities.holds ?? []) {
    const fixId = hold?.fixId ?? hold?.refs?.fixId;
    if (fixId && !lookups.waypointsById.has(fixId) && !lookups.navaidsById.has(fixId)) {
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
