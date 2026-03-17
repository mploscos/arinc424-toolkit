import test from "node:test";
import assert from "node:assert/strict";
import {
  summarizeDataset,
  summarizeFeatures,
  inspectAirspace,
  inspectAirport,
  inspectWaypoint,
  inspectProcedure,
  queryEntities,
  queryRelated,
  buildLookups,
  resolveAirportReference,
  resolveFixReference,
  buildRelations,
  validateCrossEntityConsistency,
  buildIssueFeatures,
  formatSummary
} from "../src/index.js";

test("analysis package exports are available", () => {
  for (const fn of [
    summarizeDataset,
    summarizeFeatures,
    inspectAirspace,
    inspectAirport,
    inspectWaypoint,
    inspectProcedure,
    queryEntities,
    queryRelated,
    buildLookups,
    resolveAirportReference,
    resolveFixReference,
    buildRelations,
    validateCrossEntityConsistency,
    buildIssueFeatures,
    formatSummary
  ]) {
    assert.equal(typeof fn, "function");
  }
});
