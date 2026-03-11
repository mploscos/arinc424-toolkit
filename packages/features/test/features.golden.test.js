import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildFeaturesFromCanonical, validateFeatureModel } from "../src/index.js";

const FIXTURES = ["minimal-airport", "airway-network", "airspace", "procedure"];

for (const name of FIXTURES) {
  test(`features golden output matches for ${name}`, () => {
    const root = path.resolve(process.cwd(), "../../");
    const canonical = JSON.parse(fs.readFileSync(path.join(root, "test/golden", name, "canonical.golden.json"), "utf8"));
    const golden = JSON.parse(fs.readFileSync(path.join(root, "test/golden", name, "features.golden.json"), "utf8"));

    const out = buildFeaturesFromCanonical(canonical, { generatedAt: null });
    validateFeatureModel(out);

    assert.deepEqual(out, golden);
  });
}
