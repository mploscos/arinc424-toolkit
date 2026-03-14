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

function indexById(items) {
  return new Map((items ?? []).map((item) => [item.id, item]));
}

function indexByIdent(items, pickIdent = (x) => x.ident) {
  const out = new Map();
  for (const item of items ?? []) {
    const ident = String(pickIdent(item) ?? "").trim().toUpperCase();
    if (!ident) continue;
    if (!out.has(ident)) out.set(ident, []);
    out.get(ident).push(item);
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

  const airportsById = indexById(entities.airports);
  const heliportsById = indexById(entities.heliports);
  const runwaysById = indexById(entities.runways);
  const waypointsById = indexById(entities.waypoints);
  const navaidsById = indexById(entities.navaids);
  const airwaysById = indexById(entities.airways);
  const airspacesById = indexById(entities.airspaces);
  const proceduresById = indexById(entities.procedures);
  const holdsById = indexById(entities.holds);

  const entitiesById = new Map([
    ...airportsById,
    ...heliportsById,
    ...runwaysById,
    ...waypointsById,
    ...navaidsById,
    ...airwaysById,
    ...airspacesById,
    ...proceduresById,
    ...holdsById
  ]);

  const runwaysByAirportId = groupBy(entities.runways ?? [], (r) => r?.refs?.airportId ?? r?.airportId ?? "unknown");
  const proceduresByAirportId = groupBy(entities.procedures ?? [], (p) => p?.airportId ?? p?.refs?.airportId ?? "unknown");
  const proceduresByRunwayId = groupBy(
    (entities.procedures ?? []).filter((p) => p?.runwayId),
    (p) => p.runwayId
  );
  const holdsByFixId = groupBy((entities.holds ?? []).filter((h) => h?.fixId), (h) => h.fixId);

  const waypointsByIdent = indexByIdent(entities.waypoints, (w) => w.ident);
  const navaidsByIdent = indexByIdent(entities.navaids, (n) => n.ident);

  return {
    entities,
    entitiesById,
    airportsById,
    heliportsById,
    runwaysById,
    waypointsById,
    navaidsById,
    airwaysById,
    airspacesById,
    proceduresById,
    holdsById,
    runwaysByAirportId,
    proceduresByAirportId,
    proceduresByRunwayId,
    holdsByFixId,
    waypointsByIdent,
    navaidsByIdent
  };
}
