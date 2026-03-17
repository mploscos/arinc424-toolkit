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

function makeEA(id, lat, lon, icao = "US") {
  const a = blankLine();
  a[0] = "S";
  put(a, 5, 6, "EA");
  put(a, 7, 10, "K2  ");
  put(a, 11, 12, icao);
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

function makePDRF(seq, procId, transitionId, fixId, centerFix, arcRadiusRaw) {
  const a = blankLine();
  a[0] = "S";
  a[4] = "P";
  a[12] = "D";
  put(a, 7, 10, "KJFK");
  put(a, 11, 12, "US");
  put(a, 14, 19, procId);
  put(a, 20, 20, "1");
  put(a, 21, 25, transitionId);
  put(a, 27, 29, String(seq).padStart(3, "0"));
  put(a, 30, 34, fixId);
  put(a, 35, 36, "US");
  put(a, 37, 38, "PC");
  put(a, 39, 39, "1");
  put(a, 44, 44, "L");
  put(a, 48, 49, "RF");
  put(a, 57, 62, arcRadiusRaw);
  put(a, 107, 111, centerFix);
  put(a, 112, 113, "US");
  put(a, 114, 116, "PC");
  return a.join("");
}

function makeEP({ duplicate = "40", fixId, fixIcao = "US", fixSection = "DB", inboundRaw = "2210", turnDir = "L", legLengthRaw = "054", legTimeRaw = "", minAlt = "04000", maxAlt = "", speedRaw = "", name = "" }) {
  const a = blankLine();
  a[0] = "S";
  put(a, 5, 6, "EP");
  put(a, 7, 10, "ENRT");
  put(a, 28, 29, duplicate);
  put(a, 30, 34, fixId);
  put(a, 35, 36, fixIcao);
  put(a, 37, 38, fixSection);
  put(a, 39, 39, "0");
  put(a, 40, 43, inboundRaw);
  put(a, 44, 44, turnDir);
  put(a, 45, 47, legLengthRaw);
  put(a, 48, 49, legTimeRaw);
  put(a, 50, 54, minAlt);
  put(a, 55, 59, maxAlt);
  put(a, 60, 62, speedRaw);
  put(a, 99, 123, name);
  return a.join("");
}

function makeUC({ icao = "BI", airspaceType = "B", airspaceCenter = "BIRK", classification = "", multipleCode = "Z", seq, boundaryVia = "G", lat, lon, lowerLimit = "GND", lowerUnit = " ", upperLimit = "UNLTD", upperUnit = " ", name = "", cont = "0" }) {
  const a = blankLine();
  a[0] = "S";
  put(a, 5, 6, "UC");
  put(a, 7, 8, icao);
  put(a, 10, 10, airspaceType);
  put(a, 10, 14, airspaceCenter);
  put(a, 17, 17, classification);
  put(a, 20, 20, multipleCode);
  put(a, 21, 24, String(seq).padStart(4, "0"));
  put(a, 25, 25, cont);
  put(a, 31, 32, boundaryVia);
  put(a, 33, 41, lat);
  put(a, 42, 51, lon);
  put(a, 82, 86, lowerLimit);
  put(a, 87, 87, lowerUnit);
  put(a, 88, 92, upperLimit);
  put(a, 93, 93, upperUnit);
  put(a, 94, 123, name);
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

test("parseArincText decodes RF ARC Radius using suppressed thousandths", async () => {
  const text = [
    "HDR FAACIFP TEST",
    makePA(),
    makeEA("START", "N40450000", "W073460000"),
    makeEA("ENDRF", "N40460000", "W073450000"),
    makeEA("CTRRF", "N40455000", "W073455000"),
    makePDRF(1, "RFDBG1", "RW04", "START", "CTRRF", "002070"),
    makePDRF(2, "RFDBG1", "RW04", "ENDRF", "CTRRF", "002070")
  ].join("\n");

  const model = await parseArincText(text);
  const proc = model.entities.procedures.find((item) => item.procedureCode === "RFDBG1");
  assert.ok(proc);
  const rf = proc.legs.find((leg) => leg.pathTerm === "RF");
  assert.ok(rf);
  assert.equal(rf.arcRadiusRaw, "002070");
  assert.equal(rf.arcRadiusNm, 2.07);
});

test("parseArincText keeps Jeppesen-like holds distinct when fixId collides across ICAO sections", async () => {
  const text = [
    "HDR JEPP TEST",
    makeEA("AG", "N50000000", "E030000000", "UR"),
    makeEA("AG", "N49000000", "E002000000", "LF"),
    makeEP({ duplicate: "40", fixId: "AG", fixIcao: "UR", fixSection: "DB", minAlt: "FL098", maxAlt: "FL187", name: "AGOY" }),
    makeEP({ duplicate: "40", fixId: "AG", fixIcao: "LF", fixSection: "DB", legTimeRaw: "10", legLengthRaw: "", minAlt: "02500", maxAlt: "FL060", speedRaw: "220", name: "AGEN" })
  ].join("\n");

  const model = await parseArincText(text);
  assert.equal(model.entities.holds.length, 2);
  assert.notEqual(model.entities.holds[0].id, model.entities.holds[1].id);
  assert.ok(model.entities.holds.some((item) => item.id.includes(":UR:DB:40")));
  assert.ok(model.entities.holds.some((item) => item.id.includes(":LF:DB:40")));
});

test("FAA baseline airway parsing remains unchanged after Jeppesen hold-id fix", async () => {
  const text = [
    "HDR FAACIFP TEST",
    makePA(),
    makeEA("DIXIE", "N40400000", "W073100000"),
    makeEA("MERIT", "N41000000", "W072000000"),
    makeER("J75", 1, "DIXIE"),
    makeER("J75", 2, "MERIT")
  ].join("\n");

  const model = await parseArincText(text);
  assert.equal(model.entities.airways.length, 1);
  assert.equal(model.entities.airways[0].refs.segmentFixIds.length, 2);
  assert.equal(model.entities.holds.length, 0);
});

test("parseArincText splits Jeppesen-like airspace boundaries when sequence restarts under the same base key", async () => {
  const text = [
    "HDR JEPP TEST",
    makeUC({ seq: 10, cont: "1", lat: "N90000000", lon: "W060000000", name: "REYKJAVIK CTA" }),
    makeUC({ seq: 20, lat: "N90000000", lon: "W000000000" }),
    makeUC({ seq: 30, boundaryVia: "GE", lat: "N82000000", lon: "W060000000" }),
    makeUC({ seq: 10, cont: "1", lat: "N64470900", lon: "W022521500", lowerLimit: "01000", upperLimit: "FL245", name: "FAXI TMA" }),
    makeUC({ seq: 20, lat: "N64425300", lon: "W022282400" }),
    makeUC({ seq: 30, boundaryVia: "GE", lat: "N64380037", lon: "W022580185" })
  ].join("\n");

  const model = await parseArincText(text, { includeAirspaceGeometryDebug: true });
  const matches = model.entities.airspaces.filter((item) => item.id.startsWith("airspace:UC:UC:BI|B|BIRK||Z"));
  assert.equal(matches.length, 2);
  assert.ok(matches.some((item) => item.name === "REYKJAVIK CTA"));
  assert.ok(matches.some((item) => item.name === "FAXI TMA"));
  assert.ok(matches.every((item) => item.geometryDebug?.splitGroupCount === 2));
  assert.ok(matches.every((item) => item.coordinates.length >= 4));
});
