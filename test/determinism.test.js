import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArincText } from "@arinc424/core";
import { buildFeaturesFromCanonical } from "@arinc424/features";
import { generateTiles } from "@arinc424/tiles";

const FIXTURES = ["minimal-airport", "airway-network", "airspace", "procedure"];

for (const name of FIXTURES) {
  test(`determinism: canonical/features/tiles stable for ${name}`, async () => {
    const root = process.cwd();
    const text = fs.readFileSync(path.join(root, "test/fixtures", `${name}.arinc`), "utf8");

    const c1 = await parseArincText(text, { generatedAt: null });
    const c2 = await parseArincText(text, { generatedAt: null });
    assert.deepEqual(c1, c2);

    const f1 = buildFeaturesFromCanonical(c1, { generatedAt: null });
    const f2 = buildFeaturesFromCanonical(c2, { generatedAt: null });
    assert.deepEqual(f1, f2);

    const t1 = fs.mkdtempSync(path.join(os.tmpdir(), `arinc-det-1-${name}-`));
    const t2 = fs.mkdtempSync(path.join(os.tmpdir(), `arinc-det-2-${name}-`));
    const r1 = generateTiles(f1, { outDir: t1, minZoom: 4, maxZoom: 10, generatedAt: null });
    const r2 = generateTiles(f2, { outDir: t2, minZoom: 4, maxZoom: 10, generatedAt: null });
    assert.deepEqual(r1.manifest, r2.manifest);

    const listJson = (dir) => {
      const out = [];
      const walk = (d) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          const p = path.join(d, e.name);
          if (e.isDirectory()) walk(p);
          else if (e.name.endsWith(".json")) out.push(path.relative(dir, p));
        }
      };
      walk(dir);
      return out.sort();
    };

    const files1 = listJson(t1);
    const files2 = listJson(t2);
    assert.deepEqual(files1, files2);
    for (const rel of files1) {
      const a = fs.readFileSync(path.join(t1, rel), "utf8");
      const b = fs.readFileSync(path.join(t2, rel), "utf8");
      assert.equal(a, b);
    }

    fs.rmSync(t1, { recursive: true, force: true });
    fs.rmSync(t2, { recursive: true, force: true });
  });
}
