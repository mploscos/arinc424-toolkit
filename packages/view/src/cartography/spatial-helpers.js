function mergeBounds(acc, bbox) {
  if (!Array.isArray(bbox) || bbox.length !== 4 || !bbox.every(Number.isFinite)) return acc;
  if (!acc) return [...bbox];
  return [
    Math.min(acc[0], bbox[0]),
    Math.min(acc[1], bbox[1]),
    Math.max(acc[2], bbox[2]),
    Math.max(acc[3], bbox[3])
  ];
}

function collectBoundsFromCoordinates(coords, acc = null) {
  if (!Array.isArray(coords)) return acc;
  if (coords.length >= 2 && coords.every(Number.isFinite)) {
    return mergeBounds(acc, [coords[0], coords[1], coords[0], coords[1]]);
  }
  let out = acc;
  for (const child of coords) out = collectBoundsFromCoordinates(child, out);
  return out;
}

export function getFeatureBBox(feature) {
  const bbox = feature?.bbox ?? feature?.properties?.bbox;
  if (Array.isArray(bbox) && bbox.length === 4 && bbox.every(Number.isFinite)) return [...bbox];
  return collectBoundsFromCoordinates(feature?.geometry?.coordinates, null);
}

export function expandBBox(bbox, marginX, marginY = marginX) {
  if (!Array.isArray(bbox) || bbox.length !== 4 || !bbox.every(Number.isFinite)) return null;
  return [
    bbox[0] - marginX,
    bbox[1] - marginY,
    bbox[2] + marginX,
    bbox[3] + marginY
  ];
}

export function bboxIntersects(a, b) {
  if (!a || !b) return false;
  return !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]);
}

export function bboxContainsPoint(bbox, point) {
  if (!bbox || !Array.isArray(point) || point.length < 2) return false;
  return point[0] >= bbox[0] && point[0] <= bbox[2] && point[1] >= bbox[1] && point[1] <= bbox[3];
}

export function buildAirportFocusBBox({ airportBBox, runwayBBoxes = [], airportMargin = 0.35, runwayMargin = 0.12 } = {}) {
  let merged = mergeBounds(null, airportBBox);
  for (const runwayBBox of runwayBBoxes) merged = mergeBounds(merged, runwayBBox);
  if (!merged) return null;
  const baseMargin = runwayBBoxes.length > 0 ? runwayMargin : airportMargin;
  return expandBBox(merged, baseMargin, baseMargin);
}

export function buildProcedureFocusBBox({
  procedureBBox,
  procedureLegBBoxes = [],
  fallbackBBox = null,
  margin = 0.18
} = {}) {
  let merged = mergeBounds(null, procedureBBox);
  for (const bbox of procedureLegBBoxes) merged = mergeBounds(merged, bbox);
  if (!merged) merged = mergeBounds(null, fallbackBBox);
  if (!merged) return null;
  return expandBBox(merged, margin, margin);
}

export function mergeBBoxes(bboxes = []) {
  let merged = null;
  for (const bbox of bboxes) merged = mergeBounds(merged, bbox);
  return merged;
}
