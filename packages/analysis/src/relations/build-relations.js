import { validateCanonicalModel } from "@arinc424/core";
import { buildLookups } from "./build-lookups.js";
import { buildAirportRelations, buildRunwayRelations } from "./airports.js";
import { buildAirwayRelations } from "./airways.js";
import { buildProcedureRelations, addHoldUsageRelations } from "./procedures.js";
import { buildAirspaceRelations } from "./airspaces.js";

function mapToObject(map) {
  return Object.fromEntries(
    [...map.entries()].sort(([a], [b]) => String(a).localeCompare(String(b)))
  );
}

/**
 * Build cross-entity relations from canonical model.
 * @param {object} canonicalModel
 * @returns {object}
 */
export function buildRelations(canonicalModel) {
  validateCanonicalModel(canonicalModel);
  const lookups = buildLookups(canonicalModel);

  const airportRelations = buildAirportRelations(canonicalModel, lookups);
  const runwayRelations = buildRunwayRelations(canonicalModel, lookups);
  const { airwayRelations, waypointUsage } = buildAirwayRelations(canonicalModel);
  const procedureRelations = buildProcedureRelations(canonicalModel, waypointUsage);
  addHoldUsageRelations(canonicalModel, waypointUsage);
  const airspaceRelations = buildAirspaceRelations(canonicalModel);

  return {
    schema: "arinc-analysis-relations",
    schemaVersion: "1.0.0",
    airportRelations: mapToObject(airportRelations),
    runwayRelations: mapToObject(runwayRelations),
    waypointRelations: mapToObject(waypointUsage),
    airwayRelations: mapToObject(airwayRelations),
    procedureRelations: mapToObject(procedureRelations),
    airspaceRelations: mapToObject(airspaceRelations),
    summary: {
      airports: airportRelations.size,
      runways: runwayRelations.size,
      waypointsUsed: waypointUsage.size,
      airways: airwayRelations.size,
      procedures: procedureRelations.size,
      airspaces: airspaceRelations.size
    }
  };
}
