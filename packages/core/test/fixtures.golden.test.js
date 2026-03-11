import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { parseArincText, validateCanonicalModel } from "../src/index.js";

const FIXTURES = ["minimal-airport", "airway-network", "airspace", "procedure"];

for (const name of FIXTURES) {
  test(`core golden canonical matches for ${name}`, async () => {
    const root = path.resolve(process.cwd(), "../../");
    const fixture = fs.readFileSync(path.join(root, "test/fixtures", `${name}.arinc`), "utf8");
    const golden = JSON.parse(fs.readFileSync(path.join(root, "test/golden", name, "canonical.golden.json"), "utf8"));

    const out = await parseArincText(fixture, { generatedAt: null });
    validateCanonicalModel(out);

    assert.deepEqual(out, golden);
  });
}
