const SUPPORTED_VIA = new Set(["G", "H", "L", "R", "C", "E"]);
const PARTIAL_VIA = new Set(["A"]);

function toNumberOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeVia(v) {
  const raw = String(v ?? "").trim().toUpperCase();
  return raw ? raw[0] : "G";
}

function haversineMeters(a, b) {
  const [lon1, lat1] = a.map(Number);
  const [lon2, lat2] = b.map(Number);
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371008.8;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const rLat1 = toRad(lat1);
  const rLat2 = toRad(lat2);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function isValidLonLat(point) {
  const lon = toNumberOrNull(point?.[0]);
  const lat = toNumberOrNull(point?.[1]);
  return lon !== null && lat !== null && lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90;
}

function getArcCenter(seg) {
  if (isValidLonLat([seg.arcLon, seg.arcLat])) return [Number(seg.arcLon), Number(seg.arcLat)];
  if (isValidLonLat([seg.centerLon, seg.centerLat])) return [Number(seg.centerLon), Number(seg.centerLat)];
  if (seg.centerFix || seg.centerFixId) return "FIX_REF";
  return null;
}

function getArcDistanceNm(seg) {
  const direct = toNumberOrNull(seg.arcDistance ?? seg.arcRadius ?? seg.radius);
  return direct;
}

function extractSegments(airspace) {
  if (Array.isArray(airspace?.segments)) return airspace.segments;
  if (Array.isArray(airspace?.parts)) return airspace.parts;
  return [];
}

function extractCoordinates(airspace) {
  if (Array.isArray(airspace?.coordinates)) return airspace.coordinates;
  return [];
}

/**
 * Validate ARINC 424 UC/UR airspace geometry consistency.
 *
 * @param {object} airspace
 * @param {object} [options]
 * @param {number} [options.connectToleranceMeters=100]
 * @returns {{valid:boolean,errors:string[],warnings:string[]}}
 */
export function validateAirspaceGeometry(airspace, options = {}) {
  const connectToleranceMeters = Number.isFinite(Number(options.connectToleranceMeters))
    ? Number(options.connectToleranceMeters)
    : 100;
  const errors = [];
  const warnings = [];

  const segments = extractSegments(airspace);
  if (!segments.length) {
    errors.push("Airspace has no segments");
    return { valid: false, errors, warnings };
  }

  // 1) Sequence checks in source order.
  let prevSeq = -Infinity;
  const seenSeq = new Set();
  for (const seg of segments) {
    const seq = toNumberOrNull(seg.seq ?? seg.sequenceNumber);
    if (seq === null) {
      errors.push("Segment missing sequence number");
      continue;
    }
    if (seq < prevSeq) errors.push(`Segments are not ordered by Sequence Number at seq=${seq}`);
    if (seenSeq.has(seq)) errors.push(`Duplicate sequence number seq=${seq}`);
    seenSeq.add(seq);
    prevSeq = seq;
  }

  const ordered = [...segments].sort((a, b) => {
    const sa = toNumberOrNull(a.seq ?? a.sequenceNumber) ?? 0;
    const sb = toNumberOrNull(b.seq ?? b.sequenceNumber) ?? 0;
    return sa - sb;
  });

  // 2) Via + coordinate + arc checks.
  for (let i = 0; i < ordered.length; i++) {
    const seg = ordered[i];
    const seq = toNumberOrNull(seg.seq ?? seg.sequenceNumber) ?? "unknown";
    const via = normalizeVia(seg.boundaryVia);
    const p = [seg.lon, seg.lat];
    if (!isValidLonLat(p)) errors.push(`Invalid coordinate at seq=${seq}`);

    if (!SUPPORTED_VIA.has(via)) {
      if (PARTIAL_VIA.has(via)) {
        warnings.push(`BoundaryVia ${via} partially supported at seq=${seq}`);
      } else {
        errors.push(`Unsupported Boundary Via value '${via}' at seq=${seq}`);
      }
    }

    if (via !== "E" && i === ordered.length - 1) {
      errors.push(`Missing next point for segment at seq=${seq}`);
    }

    if (via === "L" || via === "R" || via === "C" || via === "A") {
      const center = getArcCenter(seg);
      if (!center) errors.push(`Arc segment missing center fix at seq=${seq}`);
      const distNm = getArcDistanceNm(seg);
      if (distNm === null || !(distNm > 0)) errors.push(`Arc segment missing arc distance/radius at seq=${seq}`);
    }
  }

  // 3) Continuity by sequence increments.
  for (let i = 0; i < ordered.length - 1; i++) {
    const seq = toNumberOrNull(ordered[i].seq ?? ordered[i].sequenceNumber);
    const nextSeq = toNumberOrNull(ordered[i + 1].seq ?? ordered[i + 1].sequenceNumber);
    if (seq !== null && nextSeq !== null && nextSeq - seq > 1) {
      errors.push(`Segment continuity break at seq=${seq}`);
    }
  }

  // 4) Sequence end indicator (if present).
  const hasEndIndicator = ordered.some((s) => s.sequenceEndIndicator != null || s.seqEnd != null);
  if (hasEndIndicator) {
    const last = ordered[ordered.length - 1];
    const raw = String(last.sequenceEndIndicator ?? last.seqEnd ?? "").trim().toUpperCase();
    const indicatesEnd = raw === "E" || raw === "Y" || raw === "1" || raw === "*";
    if (!indicatesEnd) errors.push("SequenceEndIndicator does not close boundary on last segment");
  }

  // 5) Polygon closure from reconstructed coordinates.
  const coordinates = extractCoordinates(airspace);
  if (!Array.isArray(coordinates) || coordinates.length < 4) {
    errors.push("Insufficient coordinates to form closed polygon");
  } else {
    for (const c of coordinates) {
      if (!isValidLonLat(c)) {
        errors.push("Invalid coordinate found in reconstructed polygon");
        break;
      }
    }
    const first = coordinates[0];
    const last = coordinates[coordinates.length - 1];
    const d = haversineMeters(first, last);
    if (d > connectToleranceMeters) errors.push("Open polygon: first/last points do not close");
  }

  // 6) Altitude check.
  const lower = toNumberOrNull(airspace.lowerLimitM ?? airspace.lowerAltitudeM ?? airspace.lowerLimit);
  const upper = toNumberOrNull(airspace.upperLimitM ?? airspace.upperAltitudeM ?? airspace.upperLimit ?? airspace.maximumAltitude);
  if (lower !== null && upper !== null && lower > upper) errors.push("Lower altitude above upper altitude");

  // Surface reconstruction warnings.
  if (Array.isArray(airspace?.reconstruction?.warnings)) {
    warnings.push(...airspace.reconstruction.warnings);
  }
  if (Array.isArray(airspace?.reconstruction?.errors)) {
    errors.push(...airspace.reconstruction.errors);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}
