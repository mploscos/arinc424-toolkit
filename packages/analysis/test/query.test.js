import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { parseArincText } from "@arinc424/core";
import { buildFeaturesFromCanonical } from "@arinc424/features";
import { queryEntities } from "../src/index.js";

import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

test("queryEntities filters canonical by layer", async () => {
  const fixture = fs.readFileSync(path.join(root, "test/fixtures/airspace.arinc"), "utf8");
  const canonical = await parseArincText(fixture, { generatedAt: null });
  const out = queryEntities(canonical, { layer: "airspaces" });
  assert.equal(out.length, canonical.entities.airspaces.length);
  assert.ok(out.every((item) => item.__layer === "airspaces"));
});

test("queryEntities filters features by bbox", async () => {
  const fixture = fs.readFileSync(path.join(root, "test/fixtures/airway-network.arinc"), "utf8");
  const canonical = await parseArincText(fixture, { generatedAt: null });
  const features = buildFeaturesFromCanonical(canonical, { generatedAt: null });

  const out = queryEntities(features, { bbox: [-74, 40, -72.5, 41] });
  assert.ok(out.length >= 1);
  assert.ok(out.every((f) => typeof f.id === "string"));
});
