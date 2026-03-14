import { validateCanonicalModel } from "@arinc424/core";
import { buildLookups } from "../relations/build-lookups.js";

function haversineKm(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const [lon1, lat1] = a;
  const [lon2, lat2] = b;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLon / 2);
  const q = s1 * s1 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * s2 * s2;
  return 2 * R * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q));
}

function findAirport(airports, token) {
  const t = String(token || "").trim().toLowerCase();
  if (!t) return null;
  return airports.find((a) => String(a.id).toLowerCase() === t)
    || airports.find((a) => String(a.ident || "").toLowerCase() === t)
    || airports.find((a) => String(a.name || "").toLowerCase() === t)
    || airports.find((a) => String(a.id || "").toLowerCase().endsWith(t))
    || null;
}

/**
 * Inspect one canonical airport.
 * @param {object} canonicalModel
 * @param {string} idOrIdent
 * @returns {object}
 */
export function inspectAirport(canonicalModel, idOrIdent) {
  validateCanonicalModel(canonicalModel);
  const airports = canonicalModel.entities.airports ?? [];
  const airport = findAirport(airports, idOrIdent);
  if (!airport) return { found: false, input: idOrIdent, kind: "airport", warnings: ["Airport not found"] };

  const lookups = buildLookups(canonicalModel);
  const runways = [...(lookups.runwaysByAirportId.get(airport.id) ?? [])].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const procedures = [...(lookups.proceduresByAirportId.get(airport.id) ?? [])].sort((a, b) => String(a.id).localeCompare(String(b.id)));

  const coord = Array.isArray(airport.coord) ? airport.coord : null;
  const nearbyWaypoints = (canonicalModel.entities.waypoints ?? [])
    .filter((w) => Array.isArray(w.coord) && coord)
    .map((w) => ({ id: w.id, ident: w.ident ?? null, distanceKm: haversineKm(coord, w.coord) }))
    .filter((w) => w.distanceKm <= 80)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 10)
    .map((w) => ({ ...w, distanceKm: Number(w.distanceKm.toFixed(2)) }));

  return {
    found: true,
    kind: "airport",
    id: airport.id,
    ident: airport.ident ?? null,
    name: airport.name ?? null,
    type: airport.type,
    sourceRefs: airport.sourceRefs ?? [],
    bounds: coord ? [coord[0], coord[1], coord[0], coord[1]] : null,
    geometrySummary: {
      geometryType: coord ? "Point" : null,
      hasCoordinates: Boolean(coord)
    },
    relatedEntities: {
      runways: runways.map((r) => ({ id: r.id, runwayDesignator: r.runwayDesignator ?? null })),
      procedures: procedures.map((p) => ({ id: p.id, procedureType: p.procedureType ?? null })),
      nearbyWaypoints
    },
    warnings: []
  };
}
