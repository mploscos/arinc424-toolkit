function sortedUnique(ids) {
  return [...new Set((ids ?? []).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
}

/**
 * Build airport-centric relation map.
 * @param {object} canonicalModel
 * @param {object} lookups
 * @returns {Map<string, object>}
 */
export function buildAirportRelations(canonicalModel, lookups) {
  const out = new Map();
  for (const airport of canonicalModel.entities.airports ?? []) {
    const runwayIds = (lookups.runwaysByAirportId.get(airport.id) ?? []).map((r) => r.id);
    const procedureRecords = lookups.proceduresByAirportId.get(airport.id) ?? [];
    const procedureIds = procedureRecords.map((p) => p.id);

    const terminalWaypointIds = sortedUnique(
      procedureRecords.flatMap((p) => p?.refs?.fixIds ?? [])
    );

    out.set(airport.id, {
      airportId: airport.id,
      runwayIds: sortedUnique(runwayIds),
      procedureIds: sortedUnique(procedureIds),
      terminalWaypointIds
    });
  }
  return out;
}

/**
 * Build runway-centric relation map.
 * @param {object} canonicalModel
 * @param {object} lookups
 * @returns {Map<string, object>}
 */
export function buildRunwayRelations(canonicalModel, lookups) {
  const out = new Map();
  for (const runway of canonicalModel.entities.runways ?? []) {
    const airportId = runway?.refs?.airportId ?? runway?.airportId ?? null;
    const procedureIds = (lookups.proceduresByRunwayId.get(runway.id) ?? []).map((p) => p.id);
    out.set(runway.id, {
      runwayId: runway.id,
      airportId,
      procedureIds: sortedUnique(procedureIds)
    });
  }
  return out;
}
