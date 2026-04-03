import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { summarizeTiles, buildSplitProcedureArtifacts, canonicalProcedureCategory } from "../scripts/run-large-dataset.mjs";

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

test("buildSplitProcedureArtifacts creates lightweight catalog entries and per-procedure files", () => {
  const procedures = [
    {
      id: "procedure:PD:US:KAAA:ALPHA1:1:RW01",
      procedureType: "SID",
      airportId: "airport:US:KAAA",
      runwayId: "RW01",
      transitionId: "RW01"
    },
    {
      id: "procedure:APP:US:KBBB:ILS25:1:RW25",
      procedureType: "APPROACH",
      airportId: "airport:US:KBBB",
      runwayId: "RW25",
      transitionId: "VECTORS"
    }
  ];
  const featureCollection = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "LineString", coordinates: [[1, 2], [3, 4]] },
        properties: { procedureId: "procedure:PD:US:KAAA:ALPHA1:1:RW01" }
      },
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [2, 3] },
        properties: { procedureId: "procedure:PD:US:KAAA:ALPHA1:1:RW01" }
      }
    ]
  };

  const artifacts = buildSplitProcedureArtifacts(procedures, featureCollection, {
    catalogBasePath: "./analysis",
    legsBasePath: "./analysis/procedure-legs"
  });

  assert.equal(artifacts.catalog.type, "procedure-catalog");
  assert.equal(artifacts.catalog.procedures.length, 2);
  assert.equal(artifacts.legArtifacts.length, 1);

  const sidEntry = artifacts.catalog.procedures.find((entry) => entry.procedureId === procedures[0].id);
  const approachEntry = artifacts.catalog.procedures.find((entry) => entry.procedureId === procedures[1].id);

  assert.equal(sidEntry.airport, "KAAA");
  assert.equal(sidEntry.procedureType, "SID");
  assert.equal(sidEntry.legsAvailable, true);
  assert.match(sidEntry.legsPath, /^\.\/analysis\/procedure-legs\/KAAA\/.+\.geojson$/);
  assert.deepEqual(sidEntry.bounds, [1, 2, 3, 4]);

  assert.equal(approachEntry.airport, "KBBB");
  assert.equal(approachEntry.legsAvailable, false);
  assert.equal(approachEntry.legsPath, null);

  assert.equal(artifacts.legArtifacts[0].procedureId, procedures[0].id);
  assert.equal(artifacts.legArtifacts[0].featureCollection.features.length, 2);
});

test("canonicalProcedureCategory maps FAA terminal route codes to viewer categories", () => {
  assert.equal(canonicalProcedureCategory({ procedureType: "PD" }), "SID");
  assert.equal(canonicalProcedureCategory({ procedureType: "PE" }), "STAR");
  assert.equal(canonicalProcedureCategory({ procedureType: "PF" }), "APPROACH");
  assert.equal(canonicalProcedureCategory({ procedureType: "PI" }), "APPROACH");
});
