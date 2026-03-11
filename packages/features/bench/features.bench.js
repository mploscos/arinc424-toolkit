import fs from "node:fs";
import path from "node:path";
import { buildFeaturesFromCanonical } from "../src/index.js";

const canonical = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "../../test/golden/airway-network/canonical.golden.json"), "utf8"));
const iters = 120;

const t0 = process.hrtime.bigint();
for (let i = 0; i < iters; i++) {
  buildFeaturesFromCanonical(canonical, { generatedAt: null });
}
const t1 = process.hrtime.bigint();
const ms = Number(t1 - t0) / 1e6;
console.log(`[features] transform benchmark: ${iters} iterations in ${ms.toFixed(2)} ms (${(ms / iters).toFixed(2)} ms/op)`);
