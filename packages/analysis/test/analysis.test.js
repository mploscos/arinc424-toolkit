import test from "node:test";
import assert from "node:assert/strict";
import {
  summarizeDataset,
  summarizeFeatures,
  inspectAirspace,
  inspectAirport,
  inspectWaypoint,
  queryEntities,
  buildLookups,
  formatSummary
} from "../src/index.js";

test("analysis package exports are available", () => {
  for (const fn of [
    summarizeDataset,
    summarizeFeatures,
    inspectAirspace,
    inspectAirport,
    inspectWaypoint,
    queryEntities,
    buildLookups,
    formatSummary
  ]) {
    assert.equal(typeof fn, "function");
  }
});
