import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { generateTiles } from "../src/index.js";

const features = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "../../test/golden/airway-network/features.golden.json"), "utf8"));
const iters = 15;

const t0 = process.hrtime.bigint();
for (let i = 0; i < iters; i++) {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "arinc-bench-tiles-"));
  generateTiles(features, { outDir, minZoom: 4, maxZoom: 8, generatedAt: null });
  fs.rmSync(outDir, { recursive: true, force: true });
}
const t1 = process.hrtime.bigint();
const ms = Number(t1 - t0) / 1e6;
console.log(`[tiles] tile benchmark: ${iters} iterations in ${ms.toFixed(2)} ms (${(ms / iters).toFixed(2)} ms/op)`);
