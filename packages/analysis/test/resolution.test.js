import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArincText } from "@arinc424/core";
import { buildLookups, resolveAirportReference, resolveFixReference } from "../src/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

async function loadCanonical(name) {
  const text = fs.readFileSync(path.join(root, "test/fixtures", name), "utf8");
  return parseArincText(text, { generatedAt: null });
}

test("resolveAirportReference resolves canonical airport id and ident", async () => {
  const canonical = await loadCanonical("procedure.arinc");
  const lookups = buildLookups(canonical);

  const byId = resolveAirportReference(lookups, "airport:US:KPRC");
  assert.equal(byId.resolved, true);
  assert.equal(byId.entityType, "airport");
  assert.equal(byId.matchType, "canonical-id");

  const byIdent = resolveAirportReference(lookups, "KPRC");
  assert.equal(byIdent.resolved, true);
  assert.equal(byIdent.entityId, "airport:US:KPRC");
  assert.equal(byIdent.matchType, "ident");
});

test("resolveFixReference resolves waypoint ids and raw idents", async () => {
  const canonical = await loadCanonical("procedure.arinc");
  const lookups = buildLookups(canonical);

  const byId = resolveFixReference(lookups, "waypoint:EA:US:K2:PRC1");
  assert.equal(byId.resolved, true);
  assert.equal(byId.entityType, "waypoint");
  assert.equal(byId.matchType, "canonical-id");

  const byIdent = resolveFixReference(lookups, "PRC1");
  assert.equal(byIdent.resolved, true);
  assert.equal(byIdent.entityType, "waypoint");
  assert.equal(byIdent.matchType, "ident");
});

test("resolveFixReference reports ambiguity explicitly", async () => {
  const canonical = await loadCanonical("procedure.arinc");
  canonical.entities.navaids.push({
    id: "navaid:VOR:US:PRC1",
    type: "navaid",
    ident: "PRC1",
    name: "PROC DUPLICATE",
    coord: [-72.9, 40.55],
    sourceRefs: [{ recordType: "D", lineNumber: 1, rawLine: "synthetic", entityType: "navaids", entityId: "navaid:VOR:US:PRC1" }]
  });
  const lookups = buildLookups(canonical);

  const resolution = resolveFixReference(lookups, "PRC1");
  assert.equal(resolution.resolved, false);
  assert.equal(resolution.matchType, "ambiguous-ident");
  assert.ok(resolution.warnings.some((warning) => warning.includes("ambiguous")));
  assert.equal(resolution.candidates.length, 2);
});
