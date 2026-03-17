const EARTH_RADIUS_M = 6371008.8;
const NM_TO_M = 1852;

function toRad(d) { return (d * Math.PI) / 180; }
function toDeg(r) { return (r * 180) / Math.PI; }
function isFiniteLonLat(p) {
  return Array.isArray(p)
    && Number.isFinite(Number(p[0]))
    && Number.isFinite(Number(p[1]))
    && Number(p[0]) >= -180
    && Number(p[0]) <= 180
    && Number(p[1]) >= -90
    && Number(p[1]) <= 90;
}

function normalizeVia(v) {
  const raw = String(v ?? "").trim().toUpperCase();
  return raw || "G";
}

function baseVia(v) {
  const raw = normalizeVia(v);
  return raw ? raw[0] : "G";
}

function endsBoundary(v) {
  const raw = normalizeVia(v);
  return raw === "E" || raw.endsWith("E");
}

function normalizeBearing(b) {
  let n = Number(b) % 360;
  if (n < 0) n += 360;
  return n;
}

function haversineMeters(a, b) {
  const [lon1, lat1] = a.map(Number);
  const [lon2, lat2] = b.map(Number);
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const rLat1 = toRad(lat1);
  const rLat2 = toRad(lat2);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

function bearingDegrees(from, to) {
  const [lon1, lat1] = [toRad(Number(from[0])), toRad(Number(from[1]))];
  const [lon2, lat2] = [toRad(Number(to[0])), toRad(Number(to[1]))];
  const dLon = lon2 - lon1;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return normalizeBearing(toDeg(Math.atan2(y, x)));
}

function destinationPoint(center, bearingDeg, distanceMeters) {
  const brng = toRad(Number(bearingDeg));
  const d = Number(distanceMeters) / EARTH_RADIUS_M;
  const lat1 = toRad(Number(center[1]));
  const lon1 = toRad(Number(center[0]));

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng)
  );
  const lon2 = lon1 + Math.atan2(
    Math.sin(brng) * Math.sin(d) * Math.cos(lat1),
    Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
  );
  let lonDeg = toDeg(lon2);
  while (lonDeg > 180) lonDeg -= 360;
  while (lonDeg < -180) lonDeg += 360;
  return [lonDeg, toDeg(lat2)];
}

function greatCirclePath(start, end, maxStepDeg = 2) {
  if (!isFiniteLonLat(start) || !isFiniteLonLat(end)) return [];
  const [lon1, lat1] = [toRad(start[0]), toRad(start[1])];
  const [lon2, lat2] = [toRad(end[0]), toRad(end[1])];

  const a = Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2;
  const omega = 2 * Math.asin(Math.min(1, Math.sqrt(a)));
  if (omega < 1e-12) return [start, end];

  const stepRad = toRad(maxStepDeg);
  const n = Math.max(1, Math.ceil(omega / stepRad));
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const s1 = Math.sin((1 - t) * omega) / Math.sin(omega);
    const s2 = Math.sin(t * omega) / Math.sin(omega);
    const x = s1 * Math.cos(lat1) * Math.cos(lon1) + s2 * Math.cos(lat2) * Math.cos(lon2);
    const y = s1 * Math.cos(lat1) * Math.sin(lon1) + s2 * Math.cos(lat2) * Math.sin(lon2);
    const z = s1 * Math.sin(lat1) + s2 * Math.sin(lat2);
    const lat = Math.atan2(z, Math.sqrt(x * x + y * y));
    const lon = Math.atan2(y, x);
    out.push([toDeg(lon), toDeg(lat)]);
  }
  return out;
}

function rhumbApproxPath(start, end, maxStepDeg = 2) {
  // Approximation kept explicit; replace with full rhumb implementation if needed.
  const dLon = Math.abs(Number(end[0]) - Number(start[0]));
  const dLat = Math.abs(Number(end[1]) - Number(start[1]));
  const n = Math.max(1, Math.ceil(Math.max(dLon, dLat) / maxStepDeg));
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push([
      Number(start[0]) + (Number(end[0]) - Number(start[0])) * t,
      Number(start[1]) + (Number(end[1]) - Number(start[1])) * t
    ]);
  }
  return out;
}

function arcPathFromCenter(start, end, center, radiusNm, direction, maxStepDeg = 2) {
  const radiusM = Number(radiusNm) * NM_TO_M;
  const startBearing = bearingDegrees(center, start);
  const endBearing = bearingDegrees(center, end);

  const cwDeltaRaw = normalizeBearing(endBearing - startBearing);
  const ccwDeltaRaw = normalizeBearing(startBearing - endBearing);
  const delta = direction === "R" ? (cwDeltaRaw === 0 ? 360 : cwDeltaRaw) : -(ccwDeltaRaw === 0 ? 360 : ccwDeltaRaw);

  const n = Math.max(2, Math.ceil(Math.abs(delta) / maxStepDeg));
  const points = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const b = normalizeBearing(startBearing + delta * t);
    points.push(destinationPoint(center, b, radiusM));
  }
  return {
    points,
    radiusM,
    startRadiusM: haversineMeters(center, start),
    endRadiusM: haversineMeters(center, end),
    startBearing,
    endBearing
  };
}

function circlePath(center, radiusNm, maxStepDeg = 2) {
  const radiusM = Number(radiusNm) * NM_TO_M;
  const n = Math.max(24, Math.ceil(360 / maxStepDeg));
  const out = [];
  for (let i = 0; i <= n; i++) {
    const b = (360 * i) / n;
    out.push(destinationPoint(center, b, radiusM));
  }
  return out;
}

function appendPath(ring, path) {
  if (!path.length) return;
  if (!ring.length) {
    ring.push(...path);
    return;
  }
  const last = ring[ring.length - 1];
  const first = path[0];
  if (Math.abs(last[0] - first[0]) < 1e-12 && Math.abs(last[1] - first[1]) < 1e-12) ring.push(...path.slice(1));
  else ring.push(...path);
}

/**
 * Reconstruct airspace boundary ring from ordered UC/UR/UF segments.
 * BoundaryVia of record i defines segment from P[i] -> P[i+1] (or origin for E).
 *
 * @param {object[]} orderedSegments
 * @param {{maxArcStepDeg?:number,maxLineStepDeg?:number}} [options]
 * @returns {{coordinates:number[][],segmentMetadata:object[],errors:string[],warnings:string[]}}
 */
export function reconstructAirspaceBoundary(orderedSegments, options = {}) {
  const maxArcStepDeg = Number(options.maxArcStepDeg ?? 2);
  const maxLineStepDeg = Number(options.maxLineStepDeg ?? 2);
  const errors = [];
  const warnings = [];
  const segmentMetadata = [];
  const ring = [];

  const points = orderedSegments.map((s) => [Number(s.lon), Number(s.lat)]);
  if (!points.length) return { coordinates: [], segmentMetadata, errors: ["No segments"], warnings };
  const origin = points[0];

  for (let i = 0; i < orderedSegments.length; i++) {
    const seg = orderedSegments[i];
    const start = points[i];
    if (!isFiniteLonLat(start)) {
      errors.push(`Invalid segment start coordinate at seq=${seg.seq ?? "unknown"}`);
      continue;
    }

    const viaRaw = normalizeVia(seg.boundaryVia);
    const via = baseVia(viaRaw);
    const seq = Number(seg.seq ?? i);
    const next = points[i + 1];
    const end = endsBoundary(viaRaw) ? origin : next;
    if (!isFiniteLonLat(end)) {
      errors.push(`Missing next point for segment at seq=${seq}`);
      continue;
    }

    if (via === "G") {
      const path = greatCirclePath(start, end, maxLineStepDeg);
      appendPath(ring, path);
      segmentMetadata.push({ seq, via, start, end, vertexCount: path.length });
      continue;
    }

    if (via === "H") {
      warnings.push(`Rhumb line segment approximated at seq=${seq}`);
      const path = rhumbApproxPath(start, end, maxLineStepDeg);
      appendPath(ring, path);
      segmentMetadata.push({ seq, via, start, end, approximation: "rhumb-linear", vertexCount: path.length });
      continue;
    }

    if (via === "L" || via === "R") {
      const center = isFiniteLonLat([seg.arcLon, seg.arcLat]) ? [Number(seg.arcLon), Number(seg.arcLat)] : null;
      const radiusNm = Number(seg.arcDistance);
      if (!center) {
        errors.push(`Arc segment missing center fix at seq=${seq}`);
        continue;
      }
      if (!Number.isFinite(radiusNm) || radiusNm <= 0) {
        errors.push(`Arc segment missing radius at seq=${seq}`);
        continue;
      }

      const arc = arcPathFromCenter(start, end, center, radiusNm, via, maxArcStepDeg);
      const expectedM = radiusNm * NM_TO_M;
      const radiusToleranceM = Math.max(150, expectedM * 0.2);
      if (Math.abs(arc.startRadiusM - expectedM) > radiusToleranceM) {
        warnings.push(`Arc start radius mismatch at seq=${seq}`);
      }
      if (Math.abs(arc.endRadiusM - expectedM) > radiusToleranceM) {
        warnings.push(`Arc end radius mismatch at seq=${seq}`);
      }
      if (Number.isFinite(Number(seg.arcBearing))) {
        const expectedBearing = normalizeBearing(Number(seg.arcBearing));
        const deltaBearing = Math.abs(normalizeBearing(arc.startBearing - expectedBearing));
        if (deltaBearing > 25 && deltaBearing < 335) warnings.push(`Arc bearing consistency warning at seq=${seq}`);
      }

      appendPath(ring, arc.points);
      segmentMetadata.push({
        seq,
        via,
        start,
        end,
        center,
        radiusNm,
        direction: via,
        vertexCount: arc.points.length
      });
      continue;
    }

    if (via === "C") {
      const center = isFiniteLonLat([seg.arcLon, seg.arcLat]) ? [Number(seg.arcLon), Number(seg.arcLat)] : null;
      const radiusNm = Number(seg.arcDistance);
      if (!center) {
        errors.push(`Circle segment missing center fix at seq=${seq}`);
        continue;
      }
      if (!Number.isFinite(radiusNm) || radiusNm <= 0) {
        errors.push(`Circle segment missing radius at seq=${seq}`);
        continue;
      }
      const circle = circlePath(center, radiusNm, maxArcStepDeg);
      appendPath(ring, circle);
      segmentMetadata.push({ seq, via, center, radiusNm, vertexCount: circle.length });
      continue;
    }

    if (via === "E") {
      const path = greatCirclePath(start, origin, maxLineStepDeg);
      appendPath(ring, path);
      segmentMetadata.push({ seq, via, start, end: origin, vertexCount: path.length });
      continue;
    }

    if (via === "A") {
      warnings.push(`BoundaryVia A at seq=${seq} is only partially supported; approximating as great-circle chord`);
      const path = greatCirclePath(start, end, maxLineStepDeg);
      appendPath(ring, path);
      segmentMetadata.push({ seq, via, start, end, approximation: "A->great-circle", vertexCount: path.length });
      continue;
    }

    errors.push(`Unsupported BoundaryVia value '${via}' at seq=${seq}`);
  }

  if (ring.length) {
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (Math.abs(first[0] - last[0]) > 1e-12 || Math.abs(first[1] - last[1]) > 1e-12) {
      ring.push([...first]);
    }
  }

  return {
    coordinates: ring,
    segmentMetadata,
    errors,
    warnings
  };
}
