function sortedUnique(values) {
  return [...new Set((values ?? []).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
}

/**
 * Build airway and waypoint/hold usage relations.
 * @param {object} canonicalModel
 * @returns {{airwayRelations: Map<string, object>, waypointUsage: Map<string, object>}}
 */
export function buildAirwayRelations(canonicalModel) {
  const airwayRelations = new Map();
  const waypointUsage = new Map();

  for (const airway of canonicalModel.entities.airways ?? []) {
    const memberFixIds = sortedUnique(airway?.refs?.segmentFixIds ?? []);
    const memberRaw = sortedUnique(airway?.refs?.segmentFixRaw ?? []);
    const endpoints = memberFixIds.length >= 2
      ? { startFixId: memberFixIds[0], endFixId: memberFixIds[memberFixIds.length - 1] }
      : { startFixId: memberFixIds[0] ?? null, endFixId: memberFixIds[0] ?? null };

    airwayRelations.set(airway.id, {
      airwayId: airway.id,
      members: memberFixIds,
      memberRaw,
      endpoints
    });

    for (const fixId of memberFixIds) {
      const row = waypointUsage.get(fixId) ?? { airwayIds: [], procedureIds: [], holdIds: [] };
      row.airwayIds.push(airway.id);
      waypointUsage.set(fixId, row);
    }
  }

  for (const [fixId, row] of waypointUsage.entries()) {
    row.airwayIds = sortedUnique(row.airwayIds);
    row.procedureIds = sortedUnique(row.procedureIds);
    row.holdIds = sortedUnique(row.holdIds);
    waypointUsage.set(fixId, row);
  }

  return { airwayRelations, waypointUsage };
}
