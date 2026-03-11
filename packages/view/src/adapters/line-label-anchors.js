/**
 * Compute anchor points along a segmented polyline.
 * @template T
 * @param {T[]} points
 * @param {{spacing?: number, maxAnchors?: number, startOffset?: number}} [options]
 * @param {(a: T, b: T) => number} distanceFn
 * @param {(a: T, b: T, t: number) => T} interpolateFn
 * @returns {T[]}
 */
export function anchorsOnSegmentedLine(points, options, distanceFn, interpolateFn) {
  const spacing = options?.spacing ?? 100000;
  const maxAnchors = options?.maxAnchors ?? 6;
  const startOffset = options?.startOffset ?? spacing * 0.5;
  if (!Array.isArray(points) || points.length < 2 || spacing <= 0 || maxAnchors <= 0) return [];

  const segLengths = [];
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const len = Math.max(0, distanceFn(points[i], points[i + 1]));
    segLengths.push(len);
    total += len;
  }
  if (total <= 0) return [];

  /** @type {number[]} */
  const targets = [];
  for (let d = startOffset; d < total && targets.length < maxAnchors; d += spacing) {
    targets.push(d);
  }
  if (!targets.length) targets.push(total * 0.5);

  const anchors = [];
  for (const target of targets) {
    let acc = 0;
    for (let i = 0; i < segLengths.length; i++) {
      const seg = segLengths[i];
      if (seg <= 0) continue;
      const next = acc + seg;
      if (target <= next || i === segLengths.length - 1) {
        const t = Math.min(1, Math.max(0, (target - acc) / seg));
        anchors.push(interpolateFn(points[i], points[i + 1], t));
        break;
      }
      acc = next;
    }
  }
  return anchors;
}

/**
 * Compute anchor points for planar XY coordinates.
 * @param {number[][]} coords
 * @param {{spacing?: number, maxAnchors?: number, startOffset?: number}} [options]
 * @returns {number[][]}
 */
export function anchorsOnXYLine(coords, options) {
  return anchorsOnSegmentedLine(
    coords,
    options,
    (a, b) => Math.hypot((b[0] || 0) - (a[0] || 0), (b[1] || 0) - (a[1] || 0)),
    (a, b, t) => [
      (a[0] || 0) + ((b[0] || 0) - (a[0] || 0)) * t,
      (a[1] || 0) + ((b[1] || 0) - (a[1] || 0)) * t
    ]
  );
}
