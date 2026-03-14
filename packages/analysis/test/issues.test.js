import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArincText } from "@arinc424/core";
import { buildIssueFeatures, validateCrossEntityConsistency } from "../src/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

test("buildIssueFeatures returns deterministic feature collection", async () => {
  const text = fs.readFileSync(path.join(root, "test/fixtures/minimal-airport.arinc"), "utf8");
  const canonical = await parseArincText(text, { generatedAt: null });

  canonical.entities.runways[0].airportId = "airport:US:MISSING";
  canonical.entities.runways[0].refs = { airportId: "airport:US:MISSING" };

  const consistency = validateCrossEntityConsistency(canonical);
  const issueFc = buildIssueFeatures(canonical, consistency);

  assert.equal(issueFc.type, "FeatureCollection");
  assert.ok(issueFc.features.length >= 1);
  const first = issueFc.features[0];
  assert.equal(first.type, "Feature");
  assert.ok(["error", "warning"].includes(first.properties.severity));
  assert.equal(typeof first.properties.message, "string");
  assert.ok("relatedEntityId" in first.properties);
});

