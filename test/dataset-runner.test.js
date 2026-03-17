import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { summarizeTiles } from "../scripts/run-large-dataset.mjs";

test("summarizeTiles handles large tile trees without stack overflow", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "arinc-tiles-summary-"));
  try {
    for (let z = 4; z <= 6; z++) {
      for (let x = 0; x < 40; x++) {
        const dir = path.join(tmp, String(z), String(x));
        fs.mkdirSync(dir, { recursive: true });
        for (let y = 0; y < 25; y++) {
          fs.writeFileSync(path.join(dir, `${y}.json`), "{\"type\":\"FeatureCollection\",\"features\":[]}\n", "utf8");
        }
      }
    }

    const summary = summarizeTiles(tmp);
    assert.equal(summary.tileFileCount, 3 * 40 * 25);
    assert.equal(summary.tileCountByZoom["4"], 1000);
    assert.equal(summary.tileCountByZoom["5"], 1000);
    assert.equal(summary.tileCountByZoom["6"], 1000);
    assert.ok(summary.largestTileFileSizeBytes > 0);
    assert.ok(summary.directorySizeBytes >= summary.largestTileFileSizeBytes);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
