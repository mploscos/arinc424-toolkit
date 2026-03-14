function bboxFromGeometry(geometry) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  function walk(coords) {
    if (!Array.isArray(coords)) return;
    if (typeof coords[0] === "number" && typeof coords[1] === "number") {
      const x = Number(coords[0]);
      const y = Number(coords[1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      return;
    }
    for (const child of coords) walk(child);
  }

  walk(geometry?.coordinates);
  return Number.isFinite(minX) ? [minX, minY, maxX, maxY] : null;
}

function intersects(a, b) {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

/**
 * Approximate bbox filtering by feature/entity envelope.
 * @param {Array<object>} entities
 * @param {number[]} bbox [minX,minY,maxX,maxY]
 * @returns {Array<object>}
 */
export function filterByBbox(entities, bbox) {
  if (!Array.isArray(bbox) || bbox.length !== 4 || !bbox.every(Number.isFinite)) {
    return [...(entities ?? [])];
  }

  return (entities ?? []).filter((item) => {
    const env = Array.isArray(item?.bbox) && item.bbox.length === 4
      ? item.bbox
      : (Array.isArray(item?.coordinates)
        ? (() => {
          let minX = Infinity;
          let minY = Infinity;
          let maxX = -Infinity;
          let maxY = -Infinity;
          for (const p of item.coordinates) {
            if (!Array.isArray(p) || p.length < 2) continue;
            const [x, y] = p;
            if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
          return Number.isFinite(minX) ? [minX, minY, maxX, maxY] : null;
        })()
        : bboxFromGeometry(item.geometry));

    return env ? intersects(env, bbox) : false;
  });
}
