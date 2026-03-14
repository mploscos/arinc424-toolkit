import { validateCanonicalModel } from "@arinc424/core";
import { buildRelations } from "../relations/build-relations.js";

function findByToken(keys, token) {
  const t = String(token || "").trim().toLowerCase();
  if (!t) return null;
  return keys.find((k) => k.toLowerCase() === t)
    || keys.find((k) => k.toLowerCase().endsWith(t))
    || null;
}

/**
 * Query explicit relation sets from canonical model.
 * @param {object} canonicalModel
 * @param {{airport?:string,runway?:string,waypoint?:string,airway?:string,procedure?:string,airspace?:string,relation:string}} options
 * @returns {object}
 */
export function queryRelated(canonicalModel, options) {
  validateCanonicalModel(canonicalModel);
  const relation = String(options?.relation ?? "").trim();
  if (!relation) throw new Error("queryRelated requires options.relation");

  const relations = buildRelations(canonicalModel);

  const selectors = [
    ["airport", options?.airport, relations.airportRelations],
    ["runway", options?.runway, relations.runwayRelations],
    ["waypoint", options?.waypoint, relations.waypointRelations],
    ["airway", options?.airway, relations.airwayRelations],
    ["procedure", options?.procedure, relations.procedureRelations],
    ["airspace", options?.airspace, relations.airspaceRelations]
  ].filter(([, value]) => Boolean(value));

  if (selectors.length !== 1) {
    throw new Error("queryRelated requires exactly one selector: airport/runway/waypoint/airway/procedure/airspace");
  }

  const [kind, token, pool] = selectors[0];
  const keys = Object.keys(pool);
  const id = findByToken(keys, token);
  if (!id) return { found: false, kind, relation, input: token, results: [], warnings: ["Entity not found"] };

  const row = pool[id] ?? {};
  const raw = row[relation];
  const results = Array.isArray(raw)
    ? [...raw]
    : (raw === undefined ? [] : [raw]);

  return {
    found: true,
    kind,
    id,
    relation,
    results
  };
}
