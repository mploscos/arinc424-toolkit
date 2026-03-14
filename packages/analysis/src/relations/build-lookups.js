import { validateCanonicalModel } from "@arinc424/core";

function groupBy(items, keyFn) {
  const out = new Map();
  for (const item of items ?? []) {
    const key = keyFn(item);
    if (!out.has(key)) out.set(key, []);
    out.get(key).push(item);
  }
  return out;
}

/**
 * Build deterministic lookups for canonical model navigation entities.
 * @param {object} canonicalModel
 * @returns {object}
 */
export function buildLookups(canonicalModel) {
  validateCanonicalModel(canonicalModel);
  const entities = canonicalModel.entities;

  const airportsById = new Map((entities.airports ?? []).map((a) => [a.id, a]));
  const waypointsById = new Map((entities.waypoints ?? []).map((w) => [w.id, w]));
  const airspacesById = new Map((entities.airspaces ?? []).map((a) => [a.id, a]));

  const runwaysByAirportId = groupBy(entities.runways ?? [], (r) => r?.refs?.airportId ?? r?.airportId ?? "unknown");
  const proceduresByAirportId = groupBy(entities.procedures ?? [], (p) => p?.airportId ?? p?.refs?.airportId ?? "unknown");

  return {
    airportsById,
    waypointsById,
    airspacesById,
    runwaysByAirportId,
    proceduresByAirportId
  };
}
