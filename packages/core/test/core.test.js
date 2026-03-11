import test from "node:test";
import assert from "node:assert/strict";
import { parseArincText, validateCanonicalModel } from "../src/index.js";

function blankLine() {
  return Array.from({ length: 130 }, () => " ");
}

function put(arr, start, end, value) {
  const len = end - start + 1;
  const txt = String(value ?? "").padEnd(len, " ").slice(0, len);
  for (let i = 0; i < len; i++) arr[start - 1 + i] = txt[i];
}

function makePA() {
  const a = blankLine();
  a[0] = "S";
  a[4] = "P";
  a[12] = "A";
  put(a, 7, 10, "KJFK");
  put(a, 11, 12, "US");
  put(a, 33, 41, "N40450000");
  put(a, 42, 51, "W073460000");
  put(a, 94, 123, "John F Kennedy Intl");
  return a.join("");
}

function makeEA(id, lat, lon) {
  const a = blankLine();
  a[0] = "S";
  put(a, 5, 6, "EA");
  put(a, 7, 10, "K2  ");
  put(a, 11, 12, "US");
  put(a, 14, 18, id);
  put(a, 33, 41, lat);
  put(a, 42, 51, lon);
  return a.join("");
}

function makeER(route, seq, fixId) {
  const a = blankLine();
  a[0] = "S";
  put(a, 5, 6, "ER");
  put(a, 14, 18, route);
  put(a, 26, 29, String(seq).padStart(4, "0"));
  put(a, 30, 34, fixId);
  put(a, 35, 36, "US");
  put(a, 39, 39, "0");
  put(a, 45, 45, "J");
  put(a, 46, 46, "L");
  return a.join("");
}

test("parseArincText builds canonical model with robust IDs and refs", async () => {
  const text = [
    "HDR FAACIFP TEST",
    makePA(),
    makeEA("DIXIE", "N40400000", "W073100000"),
    makeEA("MERIT", "N41000000", "W072000000"),
    makeER("J75", 1, "DIXIE"),
    makeER("J75", 2, "MERIT")
  ].join("\n");

  const model = await parseArincText(text);
  validateCanonicalModel(model);

  assert.equal(model.schema, "navdata-canonical");
  assert.equal(model.entities.airports.length, 1);
  assert.equal(model.entities.waypoints.length, 2);
  assert.equal(model.entities.airways.length, 1);
  assert.ok(model.entities.airways[0].id.startsWith("airway:"));
  assert.equal(model.entities.airways[0].refs.segmentFixIds.length, 2);
  assert.equal(model.metadata.generatedAt, null);
});

test("validateCanonicalModel rejects invalid payloads with clear errors", () => {
  assert.throws(() =>
    validateCanonicalModel({
      schema: "navdata-canonical",
      schemaVersion: "1.0.0",
      metadata: { source: "X", generatedAt: null },
      entities: {
        airports: [{ id: "airport:1", type: "airport", sourceRefs: [] }],
        heliports: [],
        runways: [],
        waypoints: [],
        navaids: [],
        airways: [],
        airspaces: [],
        procedures: [],
        holds: []
      }
    })
  );
});
