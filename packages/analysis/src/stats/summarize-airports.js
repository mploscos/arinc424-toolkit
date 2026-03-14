function sortObjectByKey(obj) {
  return Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)));
}

/**
 * Summarize airport-related canonical stats.
 * @param {object} entities
 * @returns {object}
 */
export function summarizeAirports(entities) {
  const airports = entities?.airports ?? [];
  const runways = entities?.runways ?? [];
  const procedures = entities?.procedures ?? [];

  const runwaysByAirportId = {};
  for (const runway of runways) {
    const airportId = runway?.refs?.airportId ?? runway?.airportId ?? "unknown";
    runwaysByAirportId[airportId] = (runwaysByAirportId[airportId] ?? 0) + 1;
  }

  const proceduresByAirportId = {};
  for (const procedure of procedures) {
    const airportId = procedure?.airportId ?? procedure?.refs?.airportId ?? "unknown";
    proceduresByAirportId[airportId] = (proceduresByAirportId[airportId] ?? 0) + 1;
  }

  const airportsWithRunways = airports.filter((a) => (runwaysByAirportId[a.id] ?? 0) > 0).length;
  const airportsWithProcedures = airports.filter((a) => (proceduresByAirportId[a.id] ?? 0) > 0).length;

  return {
    airportCount: airports.length,
    runwayCount: runways.length,
    procedureCount: procedures.length,
    airportsWithRunways,
    airportsWithProcedures,
    runwaysByAirportId: sortObjectByKey(runwaysByAirportId),
    proceduresByAirportId: sortObjectByKey(proceduresByAirportId)
  };
}
