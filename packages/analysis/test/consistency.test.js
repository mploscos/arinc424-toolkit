import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArincText } from "@arinc424/core";
import { validateCrossEntityConsistency } from "../src/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

test("validateCrossEntityConsistency passes valid fixtures", async () => {
  const text = fs.readFileSync(path.join(root, "test/fixtures/procedure.arinc"), "utf8");
  const canonical = await parseArincText(text, { generatedAt: null });
  const result = validateCrossEntityConsistency(canonical);
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test("validateCrossEntityConsistency detects missing relations", async () => {
  const text = fs.readFileSync(path.join(root, "test/fixtures/minimal-airport.arinc"), "utf8");
  const canonical = await parseArincText(text, { generatedAt: null });

  canonical.entities.runways[0].airportId = "airport:US:MISSING";
  canonical.entities.runways[0].refs = { airportId: "airport:US:MISSING" };

  const result = validateCrossEntityConsistency(canonical);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("references missing airport")));
});

test("validateCrossEntityConsistency resolves airport references by ident", async () => {
  const text = fs.readFileSync(path.join(root, "test/fixtures/procedure.arinc"), "utf8");
  const canonical = await parseArincText(text, { generatedAt: null });

  canonical.entities.procedures[0].airportId = "KPRC";

  const result = validateCrossEntityConsistency(canonical);
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test("validateCrossEntityConsistency resolves raw procedure fixes by ident without false warning", async () => {
  const text = fs.readFileSync(path.join(root, "test/fixtures/procedure.arinc"), "utf8");
  const canonical = await parseArincText(text, { generatedAt: null });

  canonical.entities.procedures[0].refs.fixIds = [];

  const result = validateCrossEntityConsistency(canonical);
  assert.equal(result.valid, true);
  assert.ok(!result.warnings.some((warning) => warning.includes("unresolved raw fixes")));
});

test("validateCrossEntityConsistency warns on ambiguous fix ident instead of false missing-fix error", async () => {
  const text = fs.readFileSync(path.join(root, "test/fixtures/procedure.arinc"), "utf8");
  const canonical = await parseArincText(text, { generatedAt: null });

  canonical.entities.procedures[0].refs.fixIds = ["PRC1"];
  canonical.entities.navaids.push({
    id: "navaid:VOR:US:PRC1",
    type: "navaid",
    ident: "PRC1",
    name: "PROC DUPLICATE",
    coord: [-72.9, 40.55],
    sourceRefs: [{ recordType: "D", lineNumber: 1, rawLine: "synthetic", entityType: "navaids", entityId: "navaid:VOR:US:PRC1" }]
  });

  const result = validateCrossEntityConsistency(canonical);
  assert.equal(result.valid, true);
  assert.ok(result.warnings.some((warning) => warning.includes("ambiguous fix PRC1")));
  assert.ok(!result.errors.some((error) => error.includes("missing fix PRC1")));
});
