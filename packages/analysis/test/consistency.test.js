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
