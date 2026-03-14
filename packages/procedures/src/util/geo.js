export function lineString(start, end) {
  if (!Array.isArray(start) || !Array.isArray(end)) return null;
  if (start.length < 2 || end.length < 2) return null;
  return {
    type: "LineString",
    coordinates: [
      [Number(start[0]), Number(start[1])],
      [Number(end[0]), Number(end[1])]
    ]
  };
}

export function bboxFromCoords(coords) {
  if (!Array.isArray(coords) || coords.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const coord of coords) {
    if (!Array.isArray(coord) || coord.length < 2) continue;
    const x = Number(coord[0]);
    const y = Number(coord[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return Number.isFinite(minX) ? [minX, minY, maxX, maxY] : null;
}

export function mergeBboxes(boxes) {
  let out = null;
  for (const box of boxes) {
    if (!Array.isArray(box) || box.length !== 4) continue;
    if (!out) out = [...box];
    else {
      out[0] = Math.min(out[0], box[0]);
      out[1] = Math.min(out[1], box[1]);
      out[2] = Math.max(out[2], box[2]);
      out[3] = Math.max(out[3], box[3]);
    }
  }
  return out;
}

export function coordDistance(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return Infinity;
  if (a.length < 2 || b.length < 2) return Infinity;
  const dx = Number(a[0]) - Number(b[0]);
  const dy = Number(a[1]) - Number(b[1]);
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return Infinity;
  return Math.hypot(dx, dy);
}

export function coordsMatchWithin(a, b, tolerance = 1e-9) {
  return coordDistance(a, b) <= tolerance;
}
