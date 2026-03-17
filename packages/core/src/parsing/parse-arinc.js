import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLineReader } from "./reader.js";
import { detectType } from "./slices.js";
import { parseLimit } from "./limits.js";
import { reconstructAirspaceBoundary } from "./airspace-boundary.js";
import { createLayouts } from "../layouts/index.js";
import { createCanonicalModel, validateCanonicalModel } from "../canonical/model.js";
import { validateAirspaceGeometry } from "../validation/airspace-geometry-validator.js";

function loadLayoutConfig(layoutPath) {
  const raw = fs.readFileSync(layoutPath, "utf8");
  const config = JSON.parse(raw);
  if (!config?.layouts) throw new Error("Invalid layout config: missing layouts object");
  return config;
}

function normalizeKey(value, fallback = "UNK") {
  const raw = String(value ?? "").trim().toUpperCase();
  return raw || fallback;
}

function makeId(prefix, parts) {
  return `${prefix}:${parts.map((p) => normalizeKey(p)).join(":")}`;
}

function makeSourceRef({ recordType, lineNumber, rawLine, entityType, entityId }) {
  return { recordType, lineNumber, rawLine, entityType, entityId };
}

function parseSuppressedNmThousandths(raw) {
  const text = String(raw ?? "").trim();
  if (!/^\d+$/.test(text)) return null;
  return Number(text) / 1000;
}

function bboxFromCoords(coords) {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const p of coords ?? []) {
    const lon = Number(p?.[0]);
    const lat = Number(p?.[1]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    minLon = Math.min(minLon, lon);
    minLat = Math.min(minLat, lat);
    maxLon = Math.max(maxLon, lon);
    maxLat = Math.max(maxLat, lat);
  }
  return Number.isFinite(minLon) ? [minLon, minLat, maxLon, maxLat] : null;
}

function addIfAbsentById(list, record) {
  if (!list.some((x) => x.id === record.id)) list.push(record);
}

function sortCanonicalEntities(model) {
  for (const key of Object.keys(model.entities)) {
    model.entities[key].sort((a, b) => a.id.localeCompare(b.id));
  }
}

function buildFixLookup(model) {
  const byIdent = new Map();
  const byIdentIcao = new Map();

  function add(ident, icao, id, coord) {
    if (!ident || !id || !coord) return;
    const identKey = normalizeKey(ident);
    const icaoKey = normalizeKey(icao, "ZZ");

    const listByIdent = byIdent.get(identKey) ?? [];
    listByIdent.push({ id, coord, icao: icaoKey });
    byIdent.set(identKey, listByIdent);

    const listByCombo = byIdentIcao.get(`${identKey}:${icaoKey}`) ?? [];
    listByCombo.push({ id, coord, icao: icaoKey });
    byIdentIcao.set(`${identKey}:${icaoKey}`, listByCombo);
  }

  for (const rec of model.entities.waypoints) add(rec.ident, rec.icao, rec.id, rec.coord);
  for (const rec of model.entities.navaids) add(rec.ident, rec.icao, rec.id, rec.coord);
  for (const rec of model.entities.airports) add(rec.ident, rec.icao, rec.id, rec.coord);
  for (const rec of model.entities.heliports) add(rec.ident, rec.icao, rec.id, rec.coord);

  function resolveFix(fixIdent, icaoHint) {
    const ident = normalizeKey(fixIdent);
    const icao = normalizeKey(icaoHint, "ZZ");
    const direct = byIdentIcao.get(`${ident}:${icao}`) ?? [];
    if (direct.length === 1) return direct[0];
    if (direct.length > 1) return [...direct].sort((a, b) => a.id.localeCompare(b.id))[0];

    const loose = byIdent.get(ident) ?? [];
    if (loose.length === 1) return loose[0];
    if (loose.length > 1) return [...loose].sort((a, b) => a.id.localeCompare(b.id))[0];
    return null;
  }

  return { resolveFix };
}

function finalizeDerivedGeometry(model, buckets, options = {}) {
  const { resolveFix } = buildFixLookup(model);

  for (const parts of buckets.airways.values()) {
    const ordered = [...parts].sort((a, b) => a.seq - b.seq);
    const first = ordered[0];
    const resolved = ordered.map((seg) => ({ ...seg, fix: resolveFix(seg.fixId, seg.icao) }));
    const coordinates = resolved.map((x) => x.fix?.coord).filter(Boolean);
    if (coordinates.length < 2) continue;

    const id = makeId("airway", [first.route, first.icao, first.routeType, first.level]);
    model.entities.airways.push({
      id,
      type: "airway",
      airwayName: first.route,
      airwayType: first.routeType || "unknown",
      level: first.level || null,
      refs: {
        segmentFixIds: resolved.map((x) => x.fix?.id).filter(Boolean),
        segmentFixRaw: resolved.map((x) => x.fixId)
      },
      coordinates,
      bbox: bboxFromCoords(coordinates),
      minAltitudeM: parseLimit(first.minAlt, "FT"),
      maxAltitudeM: parseLimit(first.maxAlt, "FT"),
      sourceRefs: ordered.flatMap((s) => s.sourceRefs)
    });
  }

  for (const [key, parts] of buckets.airspaces) {
    const ordered = [...parts].sort((a, b) => a.seq - b.seq);
    const reconstruction = reconstructAirspaceBoundary(ordered, {
      maxArcStepDeg: options.airspaceArcStepDeg ?? 2,
      maxLineStepDeg: options.airspaceLineStepDeg ?? 2
    });
    const closed = reconstruction.coordinates;
    if (closed.length < 4) continue;

    const head = ordered[0];
    model.entities.airspaces.push({
      id: makeId("airspace", [head.kind, key]),
      type: "airspace",
      airspaceType: head.airspaceType ?? null,
      airspaceClass: head.classification ?? null,
      restrictiveType: head.restrictiveType ?? null,
      name: head.name ?? null,
      lowerLimitM: parseLimit(head.lowerLimit, head.lowerUnit),
      upperLimitM: parseLimit(head.upperLimit, head.upperUnit),
      coordinates: closed,
      bbox: bboxFromCoords(closed),
      sourceRefs: ordered.flatMap((s) => s.sourceRefs),
      ...(options.includeAirspaceGeometryDebug
        ? {
          geometryDebug: {
            reconstructionWarnings: reconstruction.warnings,
            reconstructionErrors: reconstruction.errors,
            segmentMetadata: reconstruction.segmentMetadata
          }
        }
        : {})
    });
  }

  for (const parts of buckets.procedures.values()) {
    const ordered = [...parts].sort((a, b) => a.seq - b.seq);
    const head = ordered[0];
    const procedureId = makeId("procedure", [head.type, head.icao, head.airportId, head.procId, head.routeType, head.transitionId || "MAIN"]);

    const resolvedFixes = ordered
      .filter((leg) => leg.fixId)
      .map((leg) => ({ leg, fix: resolveFix(leg.fixId, leg.fixIcao) }));

    const coordinates = resolvedFixes.map((x) => x.fix?.coord).filter(Boolean);
    const fixCanonicalIds = resolvedFixes.map((x) => x.fix?.id).filter(Boolean);
    const fixRawIds = resolvedFixes.map((x) => x.leg.fixId);

    model.entities.procedures.push({
      id: procedureId,
      type: "procedure",
      procedureType: head.type,
      airportId: makeId("airport", [head.icao, head.airportId]),
      runwayId: null,
      procedureCode: head.procId,
      transitionId: head.transitionId || null,
      refs: {
        fixIds: fixCanonicalIds,
        fixRawIds
      },
      coordinates,
      bbox: bboxFromCoords(coordinates),
      legs: ordered.map((x) => ({
        seq: x.seq,
        fixId: resolveFix(x.fixId, x.fixIcao)?.id ?? null,
        fixRawId: x.fixId,
        pathTerm: x.pathTerm,
        turnDir: x.turnDir,
        ...(x.arcRadiusRaw ? { arcRadiusRaw: x.arcRadiusRaw, arcRadiusNm: parseSuppressedNmThousandths(x.arcRadiusRaw) } : {}),
        ...(x.centerFix ? {
          centerFixId: resolveFix(x.centerFix, x.centerIcao)?.id ?? null,
          centerFixRawId: x.centerFix,
          centerSection: x.centerSection || null
        } : {}),
        ...(x.legCodeRaw ? { legCodeRaw: x.legCodeRaw } : {}),
        ...(x.auxRefBlockRaw ? { auxRefBlockRaw: x.auxRefBlockRaw } : {}),
        ...(x.navBlockRaw ? { navBlockRaw: x.navBlockRaw } : {}),
        alt1: x.alt1,
        alt2: x.alt2,
        speed: x.speed
      })),
      sourceRefs: ordered.flatMap((s) => s.sourceRefs)
    });
  }

  for (const h of buckets.holds) {
    const fix = resolveFix(h.fixId, h.fixIcao);
    if (!fix) continue;
    const coords = [fix.coord, [fix.coord[0] + 0.01, fix.coord[1] + 0.01]];
    model.entities.holds.push({
      id: makeId("hold", [h.icao, h.region, h.fixId, h.duplicate || "0"]),
      type: "hold",
      refs: {
        fixId: fix.id,
        fixRawId: h.fixId
      },
      fixId: fix.id,
      turnDirection: h.turnDir || null,
      minAltitudeM: parseLimit(h.minAlt, "FT"),
      maxAltitudeM: parseLimit(h.maxAlt, "FT"),
      coordinates: coords,
      bbox: bboxFromCoords(coords),
      sourceRefs: h.sourceRefs
    });
  }
}

function runAirspaceValidation(buckets, options = {}) {
  if (!options.validateAirspaceGeometry) return;
  const onResult = typeof options.onAirspaceValidationResult === "function"
    ? options.onAirspaceValidationResult
    : null;
  const failures = [];

  for (const [bucketKey, parts] of buckets.airspaces) {
    const [kind] = String(bucketKey).split(":");
    if (kind !== "UC" && kind !== "UR") continue;

    const ordered = [...parts].sort((a, b) => a.seq - b.seq);
    const reconstruction = reconstructAirspaceBoundary(ordered, {
      maxArcStepDeg: options.airspaceArcStepDeg ?? 2,
      maxLineStepDeg: options.airspaceLineStepDeg ?? 2
    });

    const head = ordered[0] ?? {};
    const result = validateAirspaceGeometry({
      kind,
      id: makeId("airspace", [kind, head.key ?? bucketKey]),
      lowerLimit: parseLimit(head.lowerLimit, head.lowerUnit),
      upperLimit: parseLimit(head.upperLimit, head.upperUnit),
      coordinates: reconstruction.coordinates,
      segments: ordered,
      reconstruction
    });

    if (!result.valid) failures.push({ bucketKey, kind, errors: result.errors });
    if (onResult) onResult({ bucketKey, kind, result });
  }

  if (failures.length && options.throwOnAirspaceValidationError) {
    const msg = failures
      .map((f) => `${f.bucketKey}: ${f.errors.join("; ")}`)
      .join(" | ");
    throw new Error(`Airspace geometry validation failed: ${msg}`);
  }
}

/**
 * Parse ARINC text into canonical model.
 * @param {string} text
 * @param {object} [options]
 * @returns {Promise<object>}
 */
export async function parseArincText(text, options = {}) {
  const lines = String(text ?? "").split(/\r?\n/);
  return parseArincLines(lines, options);
}

/**
 * Parse ARINC file into canonical model.
 * @param {string} inputFile
 * @param {object} [options]
 * @returns {Promise<object>}
 */
export async function parseArincFile(inputFile, options = {}) {
  const collected = [];
  let lineNumber = 0;
  for await (const line of createLineReader(inputFile)) {
    lineNumber += 1;
    collected.push({ line, lineNumber });
  }
  return parseArincLines(collected, { ...options, inputFile });
}

async function parseArincLines(rawLines, options = {}) {
  const layoutPath = options.layoutPath ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../layouts.default.json");
  const config = loadLayoutConfig(layoutPath);
  const layouts = createLayouts(config);
  const model = createCanonicalModel({
    source: options.source ?? null,
    inputFile: options.inputFile ?? null,
    datasetId: options.datasetId ?? null,
    generatedAt: options.generatedAt ?? null
  });

  const airwayBuckets = new Map();
  const airspaceBuckets = new Map();
  const procedureBuckets = new Map();
  const holdRecords = [];

  let inferredSource = options.source ?? null;

  for (let i = 0; i < rawLines.length; i++) {
    const row = typeof rawLines[i] === "string" ? { line: rawLines[i], lineNumber: i + 1 } : rawLines[i];
    const line = row.line;
    if (!line) continue;

    if (!inferredSource && line.startsWith("HDR")) {
      const h = line.toUpperCase();
      if (h.includes("FAACIFP")) inferredSource = "FAA-CIFP";
      else if (h.includes("ARINC") || h.includes("NAVDATA")) inferredSource = "ARINC-424";
    }

    const detected = detectType(line);
    if (!detected) continue;
    const parser = layouts[detected];
    if (!parser) continue;

    const rec = parser.parse(line);
    if (!rec) continue;

    const sourceRefStub = { recordType: detected, lineNumber: row.lineNumber, rawLine: line };

    if (detected === "PA") {
      const isHeli = line[4] === "H" || /\bHELI(PORT|PAD)?\b/i.test(rec.name || "") || /^H\d/.test(String(rec.id || ""));
      if (isHeli) {
        const id = makeId("heliport", [rec.icao, rec.id]);
        addIfAbsentById(model.entities.heliports, {
          id,
          type: "heliport",
          ident: rec.id,
          icao: rec.icao,
          name: rec.name || null,
          iata: rec.iata || null,
          coord: [rec.lon, rec.lat],
          elevationM: rec.elevationFt ? rec.elevationFt * 0.3048 : null,
          sourceRefs: [makeSourceRef({ ...sourceRefStub, entityType: "heliports", entityId: id })]
        });
      } else {
        const id = makeId("airport", [rec.icao, rec.id]);
        addIfAbsentById(model.entities.airports, {
          id,
          type: "airport",
          ident: rec.id,
          icao: rec.icao,
          name: rec.name || null,
          iata: rec.iata || null,
          coord: [rec.lon, rec.lat],
          elevationM: rec.elevationFt ? rec.elevationFt * 0.3048 : null,
          sourceRefs: [makeSourceRef({ ...sourceRefStub, entityType: "airports", entityId: id })]
        });
      }
    } else if (detected === "PG") {
      const airportId = makeId("airport", [rec.icao, rec.airportId]);
      const id = makeId("runway", [airportId, rec.runwayId]);
      addIfAbsentById(model.entities.runways, {
        id,
        type: "runway",
        refs: { airportId },
        airportId,
        runwayDesignator: rec.runwayId,
        name: rec.name || null,
        headingDeg: rec.bearing,
        lengthM: rec.lengthFt ? rec.lengthFt * 0.3048 : null,
        widthM: rec.widthFt ? rec.widthFt * 0.3048 : null,
        coord: [rec.lon, rec.lat],
        sourceRefs: [makeSourceRef({ ...sourceRefStub, entityType: "runways", entityId: id })]
      });
    } else if (detected === "EA" || detected === "PC") {
      const id = makeId("waypoint", [detected, rec.icao, rec.region, rec.id]);
      addIfAbsentById(model.entities.waypoints, {
        id,
        type: "waypoint",
        ident: rec.id,
        region: rec.region || null,
        icao: rec.icao || null,
        usage: rec.usage || null,
        waypointType: rec.type || null,
        name: rec.name || null,
        coord: [rec.lon, rec.lat],
        sourceRefs: [makeSourceRef({ ...sourceRefStub, entityType: "waypoints", entityId: id })]
      });
    } else if (detected === "D" || detected === "DB") {
      const id = makeId("navaid", [detected, rec.icao, rec.id]);
      addIfAbsentById(model.entities.navaids, {
        id,
        type: "navaid",
        navaidType: detected === "DB" ? "NDB" : "VHF",
        ident: rec.id,
        icao: rec.icao || null,
        name: rec.name || null,
        frequency: rec.frequency || null,
        class: rec.class || null,
        magVarDeg: rec.magVarDeg ?? null,
        coord: [rec.lon, rec.lat],
        sourceRefs: [makeSourceRef({ ...sourceRefStub, entityType: "navaids", entityId: id })]
      });
    } else if (detected === "ER") {
      const key = `${normalizeKey(rec.route)}:${normalizeKey(rec.icao, "ZZ")}:${normalizeKey(rec.routeType)}:${normalizeKey(rec.level)}`;
      const list = airwayBuckets.get(key) ?? [];
      list.push({ ...rec, sourceRefs: [makeSourceRef({ ...sourceRefStub, entityType: "airways", entityId: makeId("airway", [key]) })] });
      airwayBuckets.set(key, list);
    } else if (detected === "UC" || detected === "UR" || detected === "UF") {
      const kind = detected;
      const key = rec.key;
      const list = airspaceBuckets.get(`${kind}:${key}`) ?? [];
      list.push({ ...rec, kind, sourceRefs: [makeSourceRef({ ...sourceRefStub, entityType: "airspaces", entityId: makeId("airspace", [kind, key]) })] });
      airspaceBuckets.set(`${kind}:${key}`, list);
    } else if (["PD", "PE", "PF", "HD", "HE", "HF"].includes(detected)) {
      const key = `${detected}:${normalizeKey(rec.icao)}:${normalizeKey(rec.airportId)}:${normalizeKey(rec.procId)}:${normalizeKey(rec.routeType)}:${normalizeKey(rec.transitionId, "MAIN")}`;
      const list = procedureBuckets.get(key) ?? [];
      list.push({ ...rec, type: detected, sourceRefs: [makeSourceRef({ ...sourceRefStub, entityType: "procedures", entityId: makeId("procedure", [key]) })] });
      procedureBuckets.set(key, list);
    } else if (detected === "EP") {
      holdRecords.push({ ...rec, sourceRefs: [makeSourceRef({ ...sourceRefStub, entityType: "holds", entityId: makeId("hold", [rec.icao, rec.region, rec.fixId, rec.duplicate || "0"]) })] });
    }
  }

  model.metadata.source = inferredSource;

  runAirspaceValidation({
    airspaces: airspaceBuckets
  }, options);

  finalizeDerivedGeometry(model, {
    airways: airwayBuckets,
    airspaces: airspaceBuckets,
    procedures: procedureBuckets,
    holds: holdRecords
  }, options);

  sortCanonicalEntities(model);
  validateCanonicalModel(model);
  return model;
}

/**
 * Build canonical model from parsed inputs.
 * @param {string} text
 * @param {object} [options]
 * @returns {Promise<object>}
 */
export async function buildCanonicalModel(text, options = {}) {
  return parseArincText(text, options);
}
