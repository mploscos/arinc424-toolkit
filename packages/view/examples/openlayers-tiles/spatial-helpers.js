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

export function mergeBBoxes(bboxes = []) {
  let merged = null;
  for (const bbox of bboxes) merged = mergeBounds(merged, bbox);
  return merged;
}

export function getFeatureBBox(feature) {
  const propBbox = feature?.get?.("bbox");
  if (Array.isArray(propBbox) && propBbox.length === 4 && propBbox.every(Number.isFinite)) return [...propBbox];
  const extent = feature?.getGeometry?.()?.getExtent?.();
  if (Array.isArray(extent) && extent.length === 4 && extent.every(Number.isFinite)) return [...extent];
  return null;
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

export function buildAirportFocusBBox({ airportBBox, runwayBBoxes = [], airportMargin = 35000, runwayMargin = 18000 } = {}) {
  let merged = mergeBounds(null, airportBBox);
  for (const bbox of runwayBBoxes) merged = mergeBounds(merged, bbox);
  if (!merged) return null;
  return expandBBox(merged, runwayBBoxes.length > 0 ? runwayMargin : airportMargin);
}

export function buildProcedureFocusBBox({
  procedureBBox,
  procedureLegBBoxes = [],
  fallbackBBox = null,
  margin = 22000
} = {}) {
  let merged = mergeBounds(null, procedureBBox);
  for (const bbox of procedureLegBBoxes) merged = mergeBounds(merged, bbox);
  if (!merged) merged = mergeBounds(null, fallbackBBox);
  if (!merged) return null;
  return expandBBox(merged, margin);
}
