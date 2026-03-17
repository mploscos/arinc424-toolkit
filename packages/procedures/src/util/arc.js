const EARTH_RADIUS_M = 6371008.8;
const NM_TO_M = 1852;

function toRad(d) { return (d * Math.PI) / 180; }
function toDeg(r) { return (r * 180) / Math.PI; }

export function normalizeBearing(bearing) {
  let n = Number(bearing) % 360;
  if (n < 0) n += 360;
  return n;
}

export function haversineMeters(a, b) {
  const [lon1, lat1] = a.map(Number);
  const [lon2, lat2] = b.map(Number);
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const rLat1 = toRad(lat1);
  const rLat2 = toRad(lat2);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function bearingDegrees(from, to) {
  const [lon1, lat1] = [toRad(Number(from[0])), toRad(Number(from[1]))];
  const [lon2, lat2] = [toRad(Number(to[0])), toRad(Number(to[1]))];
  const dLon = lon2 - lon1;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return normalizeBearing(toDeg(Math.atan2(y, x)));
}

export function destinationPoint(center, bearingDeg, distanceMeters) {
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

export function inferArcDirection(start, end, center, turnDir = null) {
  const explicit = String(turnDir ?? "").trim().toUpperCase();
  if (explicit === "L" || explicit === "R") return explicit;
  const startBearing = bearingDegrees(center, start);
  const endBearing = bearingDegrees(center, end);
  const cw = normalizeBearing(endBearing - startBearing);
  const ccw = normalizeBearing(startBearing - endBearing);
  return cw <= ccw ? "R" : "L";
}

export function validateArcRadius(start, end, center, radiusNm, toleranceMeters = null) {
  const expectedM = Number(radiusNm) * NM_TO_M;
  const startRadiusM = haversineMeters(center, start);
  const endRadiusM = haversineMeters(center, end);
  const tol = Number.isFinite(toleranceMeters) ? toleranceMeters : Math.max(150, expectedM * 0.2);
  return {
    expectedM,
    startRadiusM,
    endRadiusM,
    toleranceMeters: tol,
    startOk: Math.abs(startRadiusM - expectedM) <= tol,
    endOk: Math.abs(endRadiusM - expectedM) <= tol
  };
}

export function buildArcFromCenter(start, end, center, direction, options = {}) {
  const radiusNm = Number(options.radiusNm);
  const maxStepDeg = Number(options.maxStepDeg ?? 2);
  const radiusM = radiusNm * NM_TO_M;
  const startBearing = bearingDegrees(center, start);
  const endBearing = bearingDegrees(center, end);

  const cwDeltaRaw = normalizeBearing(endBearing - startBearing);
  const ccwDeltaRaw = normalizeBearing(startBearing - endBearing);
  const delta = direction === "R"
    ? (cwDeltaRaw === 0 ? 360 : cwDeltaRaw)
    : -(ccwDeltaRaw === 0 ? 360 : ccwDeltaRaw);

  const n = Math.max(2, Math.ceil(Math.abs(delta) / maxStepDeg));
  const points = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const bearing = normalizeBearing(startBearing + delta * t);
    points.push(destinationPoint(center, bearing, radiusM));
  }
  if (points.length > 0) {
    points[0] = [Number(start[0]), Number(start[1])];
    points[points.length - 1] = [Number(end[0]), Number(end[1])];
  }

  return {
    points,
    direction,
    radiusNm,
    startBearing,
    endBearing,
    validation: validateArcRadius(start, end, center, radiusNm)
  };
}
