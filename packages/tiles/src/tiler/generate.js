import fs from "node:fs";
import path from "node:path";

const DEFAULT_SIMPLIFY_TOLERANCE = Object.freeze({
  4: 0.1,
  6: 0.01,
  8: 0.001
});

function lon2tile(lon, z) { return Math.floor(((lon + 180) / 360) * Math.pow(2, z)); }
function lat2tile(lat, z) {
  const rad = (lat * Math.PI) / 180;
  return Math.floor((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * Math.pow(2, z));
}

function geomBbox(geometry) {
  const pts = [];
  function walk(c) {
    if (!Array.isArray(c)) return;
    if (typeof c[0] === "number") pts.push(c);
    else for (const x of c) walk(x);
  }
  walk(geometry?.coordinates);
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const [lon, lat] of pts) {
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    minLon = Math.min(minLon, lon);
    minLat = Math.min(minLat, lat);
    maxLon = Math.max(maxLon, lon);
    maxLat = Math.max(maxLat, lat);
  }
  return Number.isFinite(minLon) ? [minLon, minLat, maxLon, maxLat] : null;
}

function intersects(a, b) {
  return !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]);
}

function tileBounds(x, y, z) {
  const n = Math.pow(2, z);
  const lon1 = (x / n) * 360 - 180;
  const lon2 = ((x + 1) / n) * 360 - 180;
  const lat1 = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
  const lat2 = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 1)) / n))) * 180) / Math.PI;
  return [lon1, Math.min(lat1, lat2), lon2, Math.max(lat1, lat2)];
}

function inside(pt, b) {
  return pt[0] >= b[0] && pt[0] <= b[2] && pt[1] >= b[1] && pt[1] <= b[3];
}

function clipSegmentToBbox(a, b, bbox) {
  const LEFT = 1;
  const RIGHT = 2;
  const BOTTOM = 4;
  const TOP = 8;

  function outCode(p) {
    let code = 0;
    if (p[0] < bbox[0]) code |= LEFT;
    else if (p[0] > bbox[2]) code |= RIGHT;
    if (p[1] < bbox[1]) code |= BOTTOM;
    else if (p[1] > bbox[3]) code |= TOP;
    return code;
  }

  let p1 = [...a];
  let p2 = [...b];

  while (true) {
    const c1 = outCode(p1);
    const c2 = outCode(p2);
    if (!(c1 | c2)) return [p1, p2];
    if (c1 & c2) return null;

    const out = c1 ? c1 : c2;
    let x;
    let y;
    if (out & TOP) {
      x = p1[0] + ((p2[0] - p1[0]) * (bbox[3] - p1[1])) / (p2[1] - p1[1]);
      y = bbox[3];
    } else if (out & BOTTOM) {
      x = p1[0] + ((p2[0] - p1[0]) * (bbox[1] - p1[1])) / (p2[1] - p1[1]);
      y = bbox[1];
    } else if (out & RIGHT) {
      y = p1[1] + ((p2[1] - p1[1]) * (bbox[2] - p1[0])) / (p2[0] - p1[0]);
      x = bbox[2];
    } else {
      y = p1[1] + ((p2[1] - p1[1]) * (bbox[0] - p1[0])) / (p2[0] - p1[0]);
      x = bbox[0];
    }

    if (out === c1) p1 = [x, y];
    else p2 = [x, y];
  }
}

function clipLineString(coords, bbox) {
  const parts = [];
  let current = null;
  for (let i = 0; i < coords.length - 1; i++) {
    const clipped = clipSegmentToBbox(coords[i], coords[i + 1], bbox);
    if (!clipped) {
      if (current && current.length > 1) parts.push(current);
      current = null;
      continue;
    }
    const [a, b] = clipped;
    if (!current) current = [a, b];
    else {
      const last = current[current.length - 1];
      if (Math.abs(last[0] - a[0]) < 1e-12 && Math.abs(last[1] - a[1]) < 1e-12) current.push(b);
      else {
        if (current.length > 1) parts.push(current);
        current = [a, b];
      }
    }
  }
  if (current && current.length > 1) parts.push(current);
  if (!parts.length) return null;
  if (parts.length === 1) return { type: "LineString", coordinates: parts[0] };
  return { type: "MultiLineString", coordinates: parts };
}

function intersectEdge(a, b, edge, value) {
  if (edge === "left" || edge === "right") {
    const x = value;
    const y = a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]);
    return [x, y];
  }
  const y = value;
  const x = a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]);
  return [x, y];
}

function clipRingToBbox(ring, bbox) {
  const edges = [
    { name: "left", test: (p) => p[0] >= bbox[0], value: bbox[0] },
    { name: "right", test: (p) => p[0] <= bbox[2], value: bbox[2] },
    { name: "bottom", test: (p) => p[1] >= bbox[1], value: bbox[1] },
    { name: "top", test: (p) => p[1] <= bbox[3], value: bbox[3] }
  ];

  let output = ring;
  for (const edge of edges) {
    const input = output;
    output = [];
    if (!input.length) break;
    let prev = input[input.length - 1];
    for (const curr of input) {
      const prevInside = edge.test(prev);
      const currInside = edge.test(curr);
      if (currInside) {
        if (!prevInside) output.push(intersectEdge(prev, curr, edge.name, edge.value));
        output.push(curr);
      } else if (prevInside) {
        output.push(intersectEdge(prev, curr, edge.name, edge.value));
      }
      prev = curr;
    }
  }

  if (output.length < 3) return null;
  const first = output[0];
  const last = output[output.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) output.push([...first]);
  return output.length >= 4 ? output : null;
}

function clipGeometryToTile(geometry, bbox) {
  if (!geometry) return null;
  const t = geometry.type;
  if (t === "Point") return inside(geometry.coordinates, bbox) ? geometry : null;
  if (t === "LineString") return clipLineString(geometry.coordinates, bbox);
  if (t === "Polygon") {
    const rings = geometry.coordinates.map((r) => clipRingToBbox(r, bbox)).filter(Boolean);
    if (!rings.length) return null;
    return { type: "Polygon", coordinates: rings };
  }
  if (t === "MultiPolygon") {
    const polys = geometry.coordinates
      .map((poly) => poly.map((r) => clipRingToBbox(r, bbox)).filter(Boolean))
      .filter((rings) => rings.length > 0);
    if (!polys.length) return null;
    return { type: "MultiPolygon", coordinates: polys };
  }
  return null;
}

function sqDist(a, b) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
}

function sqSegDist(p, a, b) {
  let x = a[0];
  let y = a[1];
  let dx = b[0] - x;
  let dy = b[1] - y;

  if (dx !== 0 || dy !== 0) {
    const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = b[0];
      y = b[1];
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }

  dx = p[0] - x;
  dy = p[1] - y;
  return dx * dx + dy * dy;
}

function simplifyDPStep(points, first, last, sqTolerance, simplified) {
  let maxSqDist = sqTolerance;
  let index = -1;

  for (let i = first + 1; i < last; i++) {
    const sq = sqSegDist(points[i], points[first], points[last]);
    if (sq > maxSqDist) {
      index = i;
      maxSqDist = sq;
    }
  }

  if (index > 0) {
    if (index - first > 1) simplifyDPStep(points, first, index, sqTolerance, simplified);
    simplified.push(points[index]);
    if (last - index > 1) simplifyDPStep(points, index, last, sqTolerance, simplified);
  }
}

function simplifyLine(points, tolerance) {
  if (!Array.isArray(points) || points.length <= 2 || !(tolerance > 0)) return points;

  const sqTolerance = tolerance * tolerance;
  const simplified = [points[0]];
  simplifyDPStep(points, 0, points.length - 1, sqTolerance, simplified);
  simplified.push(points[points.length - 1]);

  // Remove duplicate consecutive points produced by recursion boundaries.
  const out = [];
  for (const p of simplified) {
    const prev = out[out.length - 1];
    if (!prev || sqDist(prev, p) > 1e-24) out.push(p);
  }
  return out.length >= 2 ? out : points;
}

function simplifyRing(ring, tolerance) {
  if (!Array.isArray(ring) || ring.length < 4 || !(tolerance > 0)) return ring;
  const open = ring.slice(0, -1);
  const simplified = simplifyLine(open, tolerance);
  if (simplified.length < 3) return ring;
  const closed = [...simplified, [...simplified[0]]];
  return closed.length >= 4 ? closed : ring;
}

function simplifyGeometry(geometry, tolerance) {
  if (!geometry || !(tolerance > 0)) return geometry;
  const t = geometry.type;

  if (t === "LineString") {
    const coords = simplifyLine(geometry.coordinates, tolerance);
    return coords.length >= 2 ? { type: t, coordinates: coords } : null;
  }
  if (t === "MultiLineString") {
    const lines = geometry.coordinates
      .map((line) => simplifyLine(line, tolerance))
      .filter((line) => line.length >= 2);
    return lines.length ? { type: t, coordinates: lines } : null;
  }
  if (t === "Polygon") {
    const rings = geometry.coordinates
      .map((ring) => simplifyRing(ring, tolerance))
      .filter((ring) => ring.length >= 4);
    return rings.length ? { type: t, coordinates: rings } : null;
  }
  if (t === "MultiPolygon") {
    const polys = geometry.coordinates
      .map((poly) => poly.map((ring) => simplifyRing(ring, tolerance)).filter((ring) => ring.length >= 4))
      .filter((poly) => poly.length > 0);
    return polys.length ? { type: t, coordinates: polys } : null;
  }

  return geometry;
}

function resolveSimplifyTolerance(zoom, toleranceByZoom) {
  const entries = Object.entries(toleranceByZoom ?? {})
    .map(([z, tol]) => [Number(z), Number(tol)])
    .filter(([z, tol]) => Number.isFinite(z) && Number.isFinite(tol) && tol >= 0)
    .sort((a, b) => a[0] - b[0]);
  if (!entries.length) return 0;

  let current = entries[0][1];
  for (const [z, tol] of entries) {
    if (zoom >= z) current = tol;
    else break;
  }
  return current;
}

/**
 * Generate tiled GeoJSON output at z/x/y.json.
 * Includes basic geometry clipping (Point/LineString/Polygon/MultiPolygon).
 * @param {{features: object[]}} featureModel
 * @param {{outDir:string,minZoom?:number,maxZoom?:number,generatedAt?:string|null,simplify?:boolean,simplifyTolerance?:Record<number,number>}} options
 * @returns {{tileCount:number,manifest:object}}
 */
export function generateTiles(featureModel, options) {
  const minZoom = options.minZoom ?? 4;
  const maxZoom = options.maxZoom ?? 10;
  const simplify = Boolean(options.simplify);
  const simplifyTolerance = options.simplifyTolerance ?? DEFAULT_SIMPLIFY_TOLERANCE;
  fs.mkdirSync(options.outDir, { recursive: true });

  const tiles = new Map();
  const sortedFeatures = [...(featureModel.features ?? [])].sort((a, b) => a.id.localeCompare(b.id));

  for (const feature of sortedFeatures) {
    const bbox = feature.bbox ?? geomBbox(feature.geometry);
    if (!bbox) continue;

    for (let z = minZoom; z <= maxZoom; z++) {
      const layerMin = feature.minZoom ?? minZoom;
      const layerMax = feature.maxZoom ?? maxZoom;
      if (z < layerMin || z > layerMax) continue;

      const xMin = Math.max(0, lon2tile(bbox[0], z));
      const xMax = Math.max(0, lon2tile(bbox[2], z));
      const yMin = Math.max(0, lat2tile(bbox[3], z));
      const yMax = Math.max(0, lat2tile(bbox[1], z));

      for (let x = Math.min(xMin, xMax); x <= Math.max(xMin, xMax); x++) {
        for (let y = Math.min(yMin, yMax); y <= Math.max(yMin, yMax); y++) {
          const tb = tileBounds(x, y, z);
          if (!intersects(bbox, tb)) continue;
          const clipped = clipGeometryToTile(feature.geometry, tb);
          if (!clipped) continue;
          const tolerance = simplify ? resolveSimplifyTolerance(z, simplifyTolerance) : 0;
          const maybeSimplified = simplifyGeometry(clipped, tolerance);
          if (!maybeSimplified) continue;
          const key = `${z}/${x}/${y}`;
          const list = tiles.get(key) ?? [];
          list.push({
            type: "Feature",
            id: feature.id,
            geometry: maybeSimplified,
            properties: { ...feature.properties, layer: feature.layer }
          });
          tiles.set(key, list);
        }
      }
    }
  }

  const sortedKeys = [...tiles.keys()].sort((a, b) => {
    const [za, xa, ya] = a.split("/").map(Number);
    const [zb, xb, yb] = b.split("/").map(Number);
    return za - zb || xa - xb || ya - yb;
  });

  for (const key of sortedKeys) {
    const features = [...(tiles.get(key) ?? [])].sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const file = path.join(options.outDir, `${key}.json`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify({ type: "FeatureCollection", features })}\n`, "utf8");
  }

  const manifest = {
    schema: "arinc-tiles-manifest",
    schemaVersion: "1.0.0",
    generatedAt: options.generatedAt ?? null,
    minZoom,
    maxZoom,
    tileCount: tiles.size,
    layers: [...new Set(sortedFeatures.map((f) => f.layer))].sort(),
    simplify,
    simplifyTolerance: simplify ? simplifyTolerance : null
  };

  return { tileCount: tiles.size, manifest };
}

export function writeTileManifest(manifest, outFile) {
  fs.writeFileSync(outFile, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return outFile;
}
