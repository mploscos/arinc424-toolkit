function sortedUnique(values) {
  return [...new Set((values ?? []).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
}

/**
 * Build procedure relations and enrich waypoint usage references.
 * @param {object} canonicalModel
 * @param {Map<string, object>} waypointUsage
 * @returns {Map<string, object>}
 */
export function buildProcedureRelations(canonicalModel, waypointUsage = new Map()) {
  const out = new Map();

  for (const procedure of canonicalModel.entities.procedures ?? []) {
    const fixIds = sortedUnique(procedure?.refs?.fixIds ?? []);
    const fixRawIds = sortedUnique(procedure?.refs?.fixRawIds ?? []);
    const legCount = Array.isArray(procedure.legs) ? procedure.legs.length : 0;

    out.set(procedure.id, {
      procedureId: procedure.id,
      airportId: procedure.airportId ?? null,
      runwayId: procedure.runwayId ?? null,
      fixIds,
      fixRawIds,
      legCount
    });

    for (const fixId of fixIds) {
      const row = waypointUsage.get(fixId) ?? { airwayIds: [], procedureIds: [], holdIds: [] };
      row.procedureIds.push(procedure.id);
      waypointUsage.set(fixId, row);
    }
  }

  for (const [fixId, row] of waypointUsage.entries()) {
    row.airwayIds = sortedUnique(row.airwayIds);
    row.procedureIds = sortedUnique(row.procedureIds);
    row.holdIds = sortedUnique(row.holdIds);
    waypointUsage.set(fixId, row);
  }

  return out;
}

/**
 * Attach hold usage references to waypoint relation map.
 * @param {object} canonicalModel
 * @param {Map<string, object>} waypointUsage
 * @returns {Map<string, object>}
 */
export function addHoldUsageRelations(canonicalModel, waypointUsage = new Map()) {
  for (const hold of canonicalModel.entities.holds ?? []) {
    const fixId = hold?.fixId ?? hold?.refs?.fixId;
    if (!fixId) continue;
    const row = waypointUsage.get(fixId) ?? { airwayIds: [], procedureIds: [], holdIds: [] };
    row.holdIds.push(hold.id);
    waypointUsage.set(fixId, row);
  }

  for (const [fixId, row] of waypointUsage.entries()) {
    row.airwayIds = sortedUnique(row.airwayIds);
    row.procedureIds = sortedUnique(row.procedureIds);
    row.holdIds = sortedUnique(row.holdIds);
    waypointUsage.set(fixId, row);
  }

  return waypointUsage;
}
