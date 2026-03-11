import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { parseArincText } from "../src/index.js";

test("golden canonical output remains stable for sample fixture", async () => {
  const fixtureDir = path.resolve(process.cwd(), "../../test/fixtures");
  const text = fs.readFileSync(path.join(fixtureDir, "sample.arinc"), "utf8");
  const golden = JSON.parse(fs.readFileSync(path.join(fixtureDir, "sample.canonical.golden.json"), "utf8"));

  const out = await parseArincText(text);
  assert.deepEqual(out, golden);
});
