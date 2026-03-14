function collectVerticesFromCoords(coords, out) {
  if (!Array.isArray(coords)) return;
  if (typeof coords[0] === "number" && typeof coords[1] === "number") {
    out.push([Number(coords[0]), Number(coords[1])]);
    return;
  }
  for (const child of coords) collectVerticesFromCoords(child, out);
}

function dedupePoints(points) {
  const seen = new Set();
  const out = [];
  for (const p of points) {
    const key = `${p[0].toFixed(9)},${p[1].toFixed(9)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

function pickArrayPath(obj, path) {
  const parts = path.split(".");
  let cur = obj;
  for (const p of parts) cur = cur?.[p];
  return Array.isArray(cur) ? cur : [];
}

export function extractSegmentPoints(feature) {
  const geom = feature?.getGeometry?.();
  const vertices = [];
  collectVerticesFromCoords(geom?.getCoordinates?.(), vertices);
  return dedupePoints(vertices);
}

export function extractArcCenters(feature) {
  const props = feature?.getProperties?.() ?? {};
  const segmentMeta = [
    ...asArray(props.segmentMetadata),
    ...pickArrayPath(props, "reconstruction.segmentMetadata"),
    ...pickArrayPath(props, "reconstructionMetadata.segmentMetadata")
  ];
  const out = [];
  for (const s of segmentMeta) {
    const center = s?.center;
    if (Array.isArray(center) && center.length >= 2) {
      const lon = Number(center[0]);
      const lat = Number(center[1]);
      if (Number.isFinite(lon) && Number.isFinite(lat)) out.push([lon, lat]);
    }
  }
  return dedupePoints(out);
}

export function computeGeometryStats(feature) {
  const vertices = extractSegmentPoints(feature);
  const props = feature?.getProperties?.() ?? {};
  const segmentMeta = [
    ...asArray(props.segmentMetadata),
    ...pickArrayPath(props, "reconstruction.segmentMetadata"),
    ...pickArrayPath(props, "reconstructionMetadata.segmentMetadata")
  ];
  return {
    vertexCount: vertices.length,
    segmentCount: segmentMeta.length || null,
    arcCenterCount: extractArcCenters(feature).length
  };
}
