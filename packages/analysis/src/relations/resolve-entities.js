function normalizeToken(token) {
  return String(token ?? "").trim();
}

function normalizeIdent(token) {
  const value = normalizeToken(token);
  if (!value) return "";
  const parts = value.split(":").filter(Boolean);
  return String(parts.at(-1) ?? value).trim().toUpperCase();
}

function uniqueById(candidates = []) {
  const out = new Map();
  for (const candidate of candidates) {
    if (!candidate?.id) continue;
    out.set(candidate.id, candidate);
  }
  return [...out.values()];
}

function unresolvedResult(input, matchType = "unresolved", warnings = [], candidates = []) {
  return {
    input,
    resolved: false,
    entity: null,
    entityId: null,
    entityType: null,
    matchType,
    warnings,
    candidates: candidates.map((candidate) => ({
      id: candidate.id,
      ident: candidate.ident ?? candidate.entity?.ident ?? null,
      entityType: candidate.entityType ?? null
    }))
  };
}

/**
 * Resolve an airport reference by canonical id first, then by ident.
 * @param {object} lookups
 * @param {string} reference
 * @returns {{input:string,resolved:boolean,entity:object|null,entityId:string|null,entityType:string|null,matchType:string,warnings:string[],candidates:object[]}}
 */
export function resolveAirportReference(lookups, reference) {
  const input = normalizeToken(reference);
  if (!input) return unresolvedResult(input, "empty");

  const byId = lookups?.airportsById?.get(input) ?? null;
  if (byId) {
    return {
      input,
      resolved: true,
      entity: byId,
      entityId: byId.id,
      entityType: "airport",
      matchType: "canonical-id",
      warnings: [],
      candidates: [{ id: byId.id, ident: byId.ident ?? null, entityType: "airport" }]
    };
  }

  const ident = normalizeIdent(input);
  const matches = uniqueById(lookups?.airportsByIdent?.get(ident) ?? []);
  if (matches.length === 1) {
    const match = matches[0];
    return {
      input,
      resolved: true,
      entity: match,
      entityId: match.id,
      entityType: "airport",
      matchType: "ident",
      warnings: [],
      candidates: [{ id: match.id, ident: match.ident ?? null, entityType: "airport" }]
    };
  }

  if (matches.length > 1) {
    return unresolvedResult(
      input,
      "ambiguous-ident",
      [`Airport reference ${input} is ambiguous (${matches.length} matches for ident ${ident})`],
      matches.map((match) => ({ id: match.id, ident: match.ident, entityType: "airport" }))
    );
  }

  return unresolvedResult(input);
}

/**
 * Resolve a fix reference across terminal/enroute waypoints and navaids.
 * @param {object} lookups
 * @param {string} reference
 * @returns {{input:string,resolved:boolean,entity:object|null,entityId:string|null,entityType:string|null,matchType:string,warnings:string[],candidates:object[]}}
 */
export function resolveFixReference(lookups, reference) {
  const input = normalizeToken(reference);
  if (!input) return unresolvedResult(input, "empty");

  const waypoint = lookups?.waypointsById?.get(input) ?? null;
  if (waypoint) {
    return {
      input,
      resolved: true,
      entity: waypoint,
      entityId: waypoint.id,
      entityType: "waypoint",
      matchType: "canonical-id",
      warnings: [],
      candidates: [{ id: waypoint.id, ident: waypoint.ident ?? null, entityType: "waypoint" }]
    };
  }

  const navaid = lookups?.navaidsById?.get(input) ?? null;
  if (navaid) {
    return {
      input,
      resolved: true,
      entity: navaid,
      entityId: navaid.id,
      entityType: "navaid",
      matchType: "canonical-id",
      warnings: [],
      candidates: [{ id: navaid.id, ident: navaid.ident ?? null, entityType: "navaid" }]
    };
  }

  const ident = normalizeIdent(input);
  const matches = uniqueById(lookups?.fixesByIdent?.get(ident) ?? []);
  if (matches.length === 1) {
    const match = matches[0];
    return {
      input,
      resolved: true,
      entity: match.entity,
      entityId: match.id,
      entityType: match.entityType,
      matchType: "ident",
      warnings: [],
      candidates: [{ id: match.id, ident: match.ident ?? null, entityType: match.entityType }]
    };
  }

  if (matches.length > 1) {
    return unresolvedResult(
      input,
      "ambiguous-ident",
      [`Fix reference ${input} is ambiguous (${matches.length} matches for ident ${ident})`],
      matches
    );
  }

  return unresolvedResult(input);
}
