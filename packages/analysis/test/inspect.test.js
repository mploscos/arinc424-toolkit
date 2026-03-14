import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { parseArincText } from "@arinc424/core";
import { inspectAirspace, inspectAirport, inspectWaypoint, inspectProcedure } from "../src/index.js";

import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

async function loadCanonical(name) {
  const text = fs.readFileSync(path.join(root, "test/fixtures", name), "utf8");
  return parseArincText(text, { generatedAt: null });
}

test("inspectAirspace returns structured details", async () => {
  const canonical = await loadCanonical("airspace.arinc");
  const first = canonical.entities.airspaces[0];
  const inspected = inspectAirspace(canonical, first.id);
  assert.equal(inspected.found, true);
  assert.equal(inspected.kind, "airspace");
  assert.equal(inspected.id, first.id);
  assert.ok(inspected.geometrySummary.vertexCount >= 3);
});

test("inspectAirport resolves by ident", async () => {
  const canonical = await loadCanonical("minimal-airport.arinc");
  const inspected = inspectAirport(canonical, "KMIN");
  assert.equal(inspected.found, true);
  assert.equal(inspected.kind, "airport");
  assert.equal(inspected.ident, "KMIN");
  assert.equal(inspected.relatedEntities.runways.length, 1);
  assert.ok(inspected.relationSummary);
});

test("inspectWaypoint resolves connected entities", async () => {
  const canonical = await loadCanonical("airway-network.arinc");
  const inspected = inspectWaypoint(canonical, "DIXIE");
  assert.equal(inspected.found, true);
  assert.equal(inspected.kind, "waypoint");
  assert.equal(inspected.ident, "DIXIE");
  assert.ok(Array.isArray(inspected.relatedEntities.airways));
  assert.ok(Array.isArray(inspected.relatedEntities.holds));
});

test("inspectProcedure resolves airport and fixes", async () => {
  const canonical = await loadCanonical("procedure.arinc");
  const inspected = inspectProcedure(canonical, "PRC1");
  assert.equal(inspected.found, true);
  assert.equal(inspected.kind, "procedure");
  assert.equal(inspected.relatedEntities.airport.ident, "KPRC");
  assert.ok(inspected.relatedEntities.fixes.length >= 1);
});
