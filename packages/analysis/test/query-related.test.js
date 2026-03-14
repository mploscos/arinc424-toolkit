import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArincText } from "@arinc424/core";
import { queryRelated } from "../src/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

test("queryRelated returns airport procedures", async () => {
  const text = fs.readFileSync(path.join(root, "test/fixtures/procedure.arinc"), "utf8");
  const canonical = await parseArincText(text, { generatedAt: null });

  const out = queryRelated(canonical, {
    airport: "KPRC",
    relation: "procedureIds"
  });
  assert.equal(out.found, true);
  assert.ok(Array.isArray(out.results));
  assert.equal(out.results.length, 1);
});

test("queryRelated returns waypoint airway usage", async () => {
  const text = fs.readFileSync(path.join(root, "test/fixtures/airway-network.arinc"), "utf8");
  const canonical = await parseArincText(text, { generatedAt: null });

  const out = queryRelated(canonical, {
    waypoint: "DIXIE",
    relation: "airwayIds"
  });
  assert.equal(out.found, true);
  assert.ok(out.results.length >= 1);
});
