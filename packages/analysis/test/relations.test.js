import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArincText } from "@arinc424/core";
import { buildRelations } from "../src/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

async function loadCanonical(name) {
  const text = fs.readFileSync(path.join(root, "test/fixtures", name), "utf8");
  return parseArincText(text, { generatedAt: null });
}

test("buildRelations includes airport/procedure/waypoint relations", async () => {
  const canonical = await loadCanonical("procedure.arinc");
  const relations = buildRelations(canonical);

  const airportId = canonical.entities.airports[0].id;
  const airportRow = relations.airportRelations[airportId];
  assert.ok(airportRow);
  assert.equal(airportRow.procedureIds.length, 1);
  assert.ok(airportRow.terminalWaypointIds.length >= 1);

  const firstFixId = canonical.entities.procedures[0].refs.fixIds[0];
  const waypointRow = relations.waypointRelations[firstFixId];
  assert.ok(waypointRow.procedureIds.includes(canonical.entities.procedures[0].id));
});

test("buildRelations includes airway members and endpoints", async () => {
  const canonical = await loadCanonical("airway-network.arinc");
  const relations = buildRelations(canonical);
  const airwayId = canonical.entities.airways[0].id;

  const airwayRow = relations.airwayRelations[airwayId];
  assert.ok(airwayRow);
  assert.ok(Array.isArray(airwayRow.members));
  assert.ok(airwayRow.members.length >= 2);
  assert.ok(airwayRow.endpoints.startFixId);
  assert.ok(airwayRow.endpoints.endFixId);
});
