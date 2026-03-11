import fs from "node:fs";
import path from "node:path";
import { parseArincText } from "../src/index.js";

const fixture = fs.readFileSync(path.resolve(process.cwd(), "../../test/fixtures/airway-network.arinc"), "utf8");
const iters = 40;

const t0 = process.hrtime.bigint();
for (let i = 0; i < iters; i++) {
  await parseArincText(fixture, { generatedAt: null });
}
const t1 = process.hrtime.bigint();
const ms = Number(t1 - t0) / 1e6;
console.log(`[core] parse benchmark: ${iters} iterations in ${ms.toFixed(2)} ms (${(ms / iters).toFixed(2)} ms/op)`);
