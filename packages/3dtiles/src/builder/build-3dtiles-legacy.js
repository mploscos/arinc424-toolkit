#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import earcut from "earcut";

const WGS84_A = 6378137.0;
const WGS84_F = 1 / 298.257223563;
const WGS84_E2 = WGS84_F * (2 - WGS84_F);

function parseArgs(argv) {
  const args = {
    in: "out",
    out: "examples/data/airspace-3d",
    file: "airspace-extrusion.geojson",
    layers: ["UC", "UR", "UF"],
    bbox: null,
    mode: "geojson", // geojson | tileset | both
    tileDepth: 0,
    tileMaxFeatures: 200,
    outlines: true
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--in") args.in = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--file") args.file = argv[++i];
    else if (a === "--layers") {
      args.layers = String(argv[++i] || "")
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
    } else if (a === "--mode") {
      args.mode = String(argv[++i] || "geojson").trim().toLowerCase();
    } else if (a === "--bbox") {
      const raw = String(argv[++i] || "");
      const parts = raw.split(",").map((s) => Number(s.trim()));
      if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
        throw new Error(`Invalid --bbox. Expected "minLon,minLat,maxLon,maxLat", got: ${raw}`);
      }
      const [minLon, minLat, maxLon, maxLat] = parts;
      args.bbox = [
        Math.min(minLon, maxLon),
        Math.min(minLat, maxLat),
        Math.max(minLon, maxLon),
        Math.max(minLat, maxLat)
      ];
    } else if (a === "--tile-depth") {
      args.tileDepth = Math.max(0, Number(argv[++i] || 0));
    } else if (a === "--tile-max-features") {
      args.tileMaxFeatures = Math.max(1, Number(argv[++i] || 200));
    } else if (a === "--no-outlines") {
      args.outlines = false;
    }
  }
  if (!["geojson", "tileset", "both"].includes(args.mode)) {
    throw new Error(`Invalid --mode: ${args.mode}. Expected geojson | tileset | both`);
  }
  return args;
}

function readFeatureCollection(file) {
  const raw = fs.readFileSync(file, "utf8");
  const json = JSON.parse(raw);
  if (!json || json.type !== "FeatureCollection" || !Array.isArray(json.features)) {
    throw new Error(`Invalid GeoJSON FeatureCollection: ${file}`);
  }
  return json;
}

function flattenCoords(geom, out) {
  if (!geom) return out;
  const { type, coordinates } = geom;
  if (!coordinates) return out;
  if (type === "Polygon") {
    for (const ring of coordinates) for (const p of ring) out.push(p);
  } else if (type === "MultiPolygon") {
    for (const poly of coordinates) for (const ring of poly) for (const p of ring) out.push(p);
  }
  return out;
}

function updateBbox(bbox, geom) {
  const pts = flattenCoords(geom, []);
  for (const p of pts) {
    const x = Number(p?.[0]);
    const y = Number(p?.[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (x < bbox[0]) bbox[0] = x;
    if (y < bbox[1]) bbox[1] = y;
    if (x > bbox[2]) bbox[2] = x;
    if (y > bbox[3]) bbox[3] = y;
  }
}

function geomBbox(geom) {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  updateBbox(b, geom);
  return Number.isFinite(b[0]) ? b : null;
}

function bboxIntersects(a, b) {
  if (!a || !b) return true;
  return !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]);
}

function effectiveHeights(props) {
  const lower = Number(props?.lower_m_effective ?? props?.lower_m ?? 0);
  const upper = Number(props?.upper_m_effective ?? props?.upper_m ?? props?.fir_upper_m ?? 0);
  return {
    lower_m_effective: Number.isFinite(lower) ? lower : 0,
    upper_m_effective: Number.isFinite(upper) ? upper : 0
  };
}

function colorHint(props) {
  const t = String(props?.type || "").toUpperCase();
  if (t === "UF") return "#6b4fb3";
  if (t === "UC") return "#1d78b5";
  if (t === "UR") {
    const rt = String(props?.restrictiveType || "").toUpperCase();
    if (rt === "P") return "#b71c1c";
    if (rt === "R") return "#a43686";
    if (rt === "D") return "#a14f87";
    if (rt === "W") return "#bf7a00";
    if (rt === "M") return "#8a5d2f";
    return "#a56f2c";
  }
  return "#3f86b5";
}

function colorRGBA(props) {
  const hex = String(props?.fillColor || colorHint(props) || "#3f86b5").trim();
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  let r = 0x3f, g = 0x86, b = 0xb5;
  if (m) {
    const n = Number.parseInt(m[1], 16);
    r = (n >> 16) & 255;
    g = (n >> 8) & 255;
    b = n & 255;
  }
  const t = String(props?.type || "").toUpperCase();
  const rt = String(props?.restrictiveType || "").toUpperCase();
  const a =
    t === "UF" ? 24 :
    t === "UC" ? 56 :
    (rt === "P" || rt === "R") ? 78 :
    62;
  return [r, g, b, a];
}

function degToRad(d) {
  return (d * Math.PI) / 180;
}

function wgs84ToEcef(lonDeg, latDeg, hMeters) {
  const lon = degToRad(lonDeg);
  const lat = degToRad(latDeg);
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const sinLon = Math.sin(lon);
  const cosLon = Math.cos(lon);
  const N = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
  const x = (N + hMeters) * cosLat * cosLon;
  const y = (N + hMeters) * cosLat * sinLon;
  const z = (N * (1 - WGS84_E2) + hMeters) * sinLat;
  return [x, y, z];
}

function cleanRing(ring) {
  if (!Array.isArray(ring)) return [];
  const out = [];
  for (const p of ring) {
    const lon = Number(p?.[0]);
    const lat = Number(p?.[1]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    out.push([lon, lat]);
  }
  if (out.length >= 2) {
    const a = out[0];
    const b = out[out.length - 1];
    if (a[0] === b[0] && a[1] === b[1]) out.pop();
  }
  return out.length >= 3 ? out : [];
}

function polygonsFromGeometry(geom) {
  if (!geom) return [];
  if (geom.type === "Polygon") return [geom.coordinates];
  if (geom.type === "MultiPolygon") return geom.coordinates;
  return [];
}

function buildMergedAirspace(args) {
  fs.mkdirSync(args.out, { recursive: true });
  const merged = { type: "FeatureCollection", features: [] };
  const bbox = [Infinity, Infinity, -Infinity, -Infinity];
  const stats = { total: 0, skippedGeometry: 0, skippedHeight: 0, skippedBbox: 0, byType: {} };
  let minHeight = Infinity;
  let maxHeight = -Infinity;

  for (const layer of args.layers) {
    const file = path.join(args.in, `${layer}.geojson`);
    if (!fs.existsSync(file)) continue;
    const fc = readFeatureCollection(file);
    for (const f of fc.features) {
      const g = f?.geometry;
      if (!g || (g.type !== "Polygon" && g.type !== "MultiPolygon")) {
        stats.skippedGeometry++;
        continue;
      }
      if (args.bbox && !bboxIntersects(geomBbox(g), args.bbox)) {
        stats.skippedBbox++;
        continue;
      }
      const props = { ...(f.properties || {}) };
      const h = effectiveHeights(props);
      if (!(h.upper_m_effective > h.lower_m_effective)) {
        stats.skippedHeight++;
        continue;
      }
      props.lower_m_effective = h.lower_m_effective;
      props.upper_m_effective = h.upper_m_effective;
      props.extrude = true;
      props.height_m = h.lower_m_effective;
      props.extrudedHeight_m = h.upper_m_effective;
      props.fillColor = colorHint(props);
      merged.features.push({ type: "Feature", geometry: g, properties: props });
      updateBbox(bbox, g);
      stats.total++;
      minHeight = Math.min(minHeight, h.lower_m_effective);
      maxHeight = Math.max(maxHeight, h.upper_m_effective);
      const t = String(props.type || layer).toUpperCase();
      stats.byType[t] = (stats.byType[t] || 0) + 1;
    }
  }

  return {
    merged,
    bbox: Number.isFinite(bbox[0]) ? bbox : null,
    minHeight: Number.isFinite(minHeight) ? minHeight : 0,
    maxHeight: Number.isFinite(maxHeight) ? maxHeight : 0,
    stats
  };
}

function align4(n) { return (n + 3) & ~3; }
function align8(n) { return (n + 7) & ~7; }

function appendBuffer(chunks, buf, align = 4) {
  let offset = 0;
  for (const c of chunks) offset += c.length;
  chunks.push(buf);
  const padded = align > 1 ? align4(buf.length) : buf.length;
  if (padded > buf.length) chunks.push(Buffer.alloc(padded - buf.length));
  return { byteOffset: offset, byteLength: buf.length };
}

function buildAirspaceMesh(features, globalBbox, minHeight, maxHeight, options = {}) {
  const includeOutlines = options.outlines !== false;
  if (!features.length || !globalBbox) return null;

  const centerLon = (globalBbox[0] + globalBbox[2]) / 2;
  const centerLat = (globalBbox[1] + globalBbox[3]) / 2;
  const centerH = (minHeight + maxHeight) / 2;
  const rtcCenter = wgs84ToEcef(centerLon, centerLat, centerH);

  const positions = [];
  const colors = [];
  const batchIds = [];
  const indices = [];
  const lineIndices = [];
  const batchTable = {
    name: [],
    type: [],
    classification: [],
    restrictiveType: [],
    icao: [],
    lower_m_effective: [],
    upper_m_effective: []
  };

  function addVertex(lon, lat, h, rgba, batchId) {
    const [x, y, z] = wgs84ToEcef(lon, lat, h);
    positions.push(x - rtcCenter[0], y - rtcCenter[1], z - rtcCenter[2]);
    colors.push(rgba[0], rgba[1], rgba[2], rgba[3]);
    batchIds.push(batchId >>> 0);
    return (positions.length / 3) - 1;
  }

  for (const feature of features) {
    const props = feature.properties || {};
    const lower = Number(props.lower_m_effective ?? props.height_m ?? 0);
    const upper = Number(props.upper_m_effective ?? props.extrudedHeight_m ?? 0);
    if (!(upper > lower)) continue;
    const rgba = colorRGBA(props);
    const batchId = batchTable.name.length;
    batchTable.name.push(String(props.name || props.ident || props.icao || props.airspaceCenter || ""));
    batchTable.type.push(String(props.type || ""));
    batchTable.classification.push(String(props.classification || ""));
    batchTable.restrictiveType.push(String(props.restrictiveType || ""));
    batchTable.icao.push(String(props.icao || ""));
    batchTable.lower_m_effective.push(Number.isFinite(lower) ? lower : 0);
    batchTable.upper_m_effective.push(Number.isFinite(upper) ? upper : 0);

    for (const polyCoords of polygonsFromGeometry(feature.geometry)) {
      const rings = (polyCoords || []).map(cleanRing).filter((r) => r.length >= 3);
      if (!rings.length) continue;

      const flat = [];
      const holes = [];
      const ringOffsets = [];
      let vertexCursor = 0;
      for (let r = 0; r < rings.length; r++) {
        const ring = rings[r];
        ringOffsets.push(vertexCursor);
        if (r > 0) holes.push(vertexCursor);
        for (const [lon, lat] of ring) {
          flat.push(lon, lat);
          vertexCursor++;
        }
      }
      if (vertexCursor < 3) continue;

      const tris = earcut(flat, holes, 2);
      const bottomIdx = new Array(vertexCursor);
      const topIdx = new Array(vertexCursor);

      for (let i = 0; i < vertexCursor; i++) {
        const lon = flat[i * 2];
        const lat = flat[i * 2 + 1];
        bottomIdx[i] = addVertex(lon, lat, lower, rgba, batchId);
        topIdx[i] = addVertex(lon, lat, upper, rgba, batchId);
      }

      for (let i = 0; i < tris.length; i += 3) {
        const a = tris[i];
        const b = tris[i + 1];
        const c = tris[i + 2];
        indices.push(topIdx[a], topIdx[b], topIdx[c]);      // top
        indices.push(bottomIdx[c], bottomIdx[b], bottomIdx[a]); // bottom reversed
      }

      for (let r = 0; r < rings.length; r++) {
        const ring = rings[r];
        const off = ringOffsets[r];
        for (let i = 0; i < ring.length; i++) {
          const a = off + i;
          const b = off + ((i + 1) % ring.length);
          const b0 = bottomIdx[a];
          const b1 = bottomIdx[b];
          const t0 = topIdx[a];
          const t1 = topIdx[b];
          indices.push(b0, b1, t1);
          indices.push(b0, t1, t0);
          // Outline: top/bottom edges + vertical edges improve volume readability in Cesium.
          if (includeOutlines) {
            lineIndices.push(b0, b1);
            lineIndices.push(t0, t1);
            lineIndices.push(b0, t0);
          }
        }
      }
    }
  }

  if (!positions.length || !indices.length) return null;

  return {
    rtcCenter,
    positions: new Float32Array(positions),
    colors: new Uint8Array(colors),
    batchIds: (batchTable.name.length < 65536 ? new Uint16Array(batchIds) : new Uint32Array(batchIds)),
    indices: new Uint32Array(indices),
    lineIndices: new Uint32Array(lineIndices),
    batchTable,
    batchLength: batchTable.name.length
  };
}

function minMaxVec3(float32Positions) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < float32Positions.length; i += 3) {
    const x = float32Positions[i];
    const y = float32Positions[i + 1];
    const z = float32Positions[i + 2];
    if (x < min[0]) min[0] = x; if (y < min[1]) min[1] = y; if (z < min[2]) min[2] = z;
    if (x > max[0]) max[0] = x; if (y > max[1]) max[1] = y; if (z > max[2]) max[2] = z;
  }
  return { min, max };
}

function boundingSphereFromPositions(float32Positions) {
  let maxR2 = 0;
  for (let i = 0; i < float32Positions.length; i += 3) {
    const x = float32Positions[i];
    const y = float32Positions[i + 1];
    const z = float32Positions[i + 2];
    const r2 = x * x + y * y + z * z;
    if (r2 > maxR2) maxR2 = r2;
  }
  return Math.sqrt(maxR2);
}

function buildGlbFromMesh(mesh) {
  const chunks = [];
  const hasLines = !!(mesh.lineIndices && mesh.lineIndices.length);
  const posBuf = Buffer.from(mesh.positions.buffer, mesh.positions.byteOffset, mesh.positions.byteLength);
  const colBuf = Buffer.from(mesh.colors.buffer, mesh.colors.byteOffset, mesh.colors.byteLength);
  const batchBuf = Buffer.from(mesh.batchIds.buffer, mesh.batchIds.byteOffset, mesh.batchIds.byteLength);
  const idxBuf = Buffer.from(mesh.indices.buffer, mesh.indices.byteOffset, mesh.indices.byteLength);
  const lineIdxBuf = hasLines
    ? Buffer.from(mesh.lineIndices.buffer, mesh.lineIndices.byteOffset, mesh.lineIndices.byteLength)
    : null;

  const posView = appendBuffer(chunks, posBuf, 4);
  const colView = appendBuffer(chunks, colBuf, 4);
  const batchView = appendBuffer(chunks, batchBuf, 4);
  const idxView = appendBuffer(chunks, idxBuf, 4);
  const lineIdxView = hasLines ? appendBuffer(chunks, lineIdxBuf, 4) : null;
  const binBuffer = Buffer.concat(chunks);
  const { min, max } = minMaxVec3(mesh.positions);

  const primitives = [{
    attributes: { POSITION: 0, COLOR_0: 1, _BATCHID: 2 },
    indices: 3,
    material: 0
  }];
  if (hasLines) {
    primitives.push({
      attributes: { POSITION: 0, _BATCHID: 2 },
      indices: 4,
      material: 1,
      mode: 1
    });
  }

  const bufferViews = [
    { buffer: 0, byteOffset: posView.byteOffset, byteLength: posView.byteLength, target: 34962 },
    { buffer: 0, byteOffset: colView.byteOffset, byteLength: colView.byteLength, target: 34962 },
    { buffer: 0, byteOffset: batchView.byteOffset, byteLength: batchView.byteLength, target: 34962 },
    { buffer: 0, byteOffset: idxView.byteOffset, byteLength: idxView.byteLength, target: 34963 }
  ];
  if (hasLines) {
    bufferViews.push({ buffer: 0, byteOffset: lineIdxView.byteOffset, byteLength: lineIdxView.byteLength, target: 34963 });
  }

  const accessors = [
    {
      bufferView: 0,
      byteOffset: 0,
      componentType: 5126,
      count: mesh.positions.length / 3,
      type: "VEC3",
      min,
      max
    },
    {
      bufferView: 1,
      byteOffset: 0,
      componentType: 5121,
      normalized: true,
      count: mesh.colors.length / 4,
      type: "VEC4"
    },
    {
      bufferView: 2,
      byteOffset: 0,
      componentType: mesh.batchIds.BYTES_PER_ELEMENT === 2 ? 5123 : 5125,
      count: mesh.batchIds.length,
      type: "SCALAR"
    },
    {
      bufferView: 3,
      byteOffset: 0,
      componentType: 5125,
      count: mesh.indices.length,
      type: "SCALAR"
    }
  ];
  if (hasLines) {
    accessors.push({
      bufferView: 4,
      byteOffset: 0,
      componentType: 5125,
      count: mesh.lineIndices.length,
      type: "SCALAR"
    });
  }

  const gltf = {
    asset: { version: "2.0", generator: "aip-toolkit build-3dtiles.js" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{
      primitives
    }],
    materials: [{
      pbrMetallicRoughness: {
        baseColorFactor: [1, 1, 1, 1],
        metallicFactor: 0,
        roughnessFactor: 1
      },
      alphaMode: "BLEND",
      doubleSided: true
    }, {
      pbrMetallicRoughness: {
        baseColorFactor: [0.04, 0.04, 0.04, 0.96],
        metallicFactor: 0,
        roughnessFactor: 1
      },
      alphaMode: "BLEND",
      doubleSided: true
    }],
    buffers: [{ byteLength: binBuffer.length }],
    bufferViews,
    accessors
  };

  let jsonChunk = Buffer.from(JSON.stringify(gltf), "utf8");
  const jsonPadded = align4(jsonChunk.length);
  if (jsonPadded > jsonChunk.length) {
    jsonChunk = Buffer.concat([jsonChunk, Buffer.alloc(jsonPadded - jsonChunk.length, 0x20)]);
  }
  let binChunk = binBuffer;
  const binPadded = align4(binChunk.length);
  if (binPadded > binChunk.length) {
    binChunk = Buffer.concat([binChunk, Buffer.alloc(binPadded - binChunk.length)]);
  }

  const totalLen = 12 + 8 + jsonChunk.length + 8 + binChunk.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); // glTF
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLen, 8);

  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonChunk.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4); // JSON
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binChunk.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4); // BIN

  return Buffer.concat([header, jsonHeader, jsonChunk, binHeader, binChunk]);
}

function padJsonForB3dm(obj) {
  let buf = Buffer.from(JSON.stringify(obj), "utf8");
  const padded = align8(buf.length);
  if (padded > buf.length) buf = Buffer.concat([buf, Buffer.alloc(padded - buf.length, 0x20)]);
  return buf;
}

function buildB3dm(glb, rtcCenter, mesh = null) {
  const batchLength = Number(mesh?.batchLength || 0);
  const featureTableJson = padJsonForB3dm({
    BATCH_LENGTH: batchLength,
    RTC_CENTER: rtcCenter
  });
  const batchTableJson = batchLength > 0 ? padJsonForB3dm(mesh.batchTable || {}) : Buffer.alloc(0);
  const header = Buffer.alloc(28);
  header.write("b3dm", 0, 4, "ascii");
  header.writeUInt32LE(1, 4);
  const byteLength = 28 + featureTableJson.length + batchTableJson.length + glb.length;
  header.writeUInt32LE(byteLength, 8);
  header.writeUInt32LE(featureTableJson.length, 12);
  header.writeUInt32LE(0, 16); // feature table binary
  header.writeUInt32LE(batchTableJson.length, 20); // batch table json
  header.writeUInt32LE(0, 24); // batch table binary
  return Buffer.concat([header, featureTableJson, batchTableJson, glb]);
}

function buildTilesetJson(globalBbox, minHeight, maxHeight, mesh = null) {
  const [west, south, east, north] = globalBbox;
  const lonSpan = Math.max(0, east - west);
  const latSpan = Math.max(0, north - south);
  const hSpan = Math.max(0, maxHeight - minHeight);
  const lonPad = Math.max(lonSpan * 0.02, 0.01);
  const latPad = Math.max(latSpan * 0.02, 0.01);
  const hPad = Math.max(hSpan * 0.15, 500);
  const region = [
    degToRad(west - lonPad),
    degToRad(south - latPad),
    degToRad(east + lonPad),
    degToRad(north + latPad),
    minHeight - hPad,
    maxHeight + hPad
  ];
  const sphere = mesh
    ? [
        mesh.rtcCenter[0],
        mesh.rtcCenter[1],
        mesh.rtcCenter[2],
        boundingSphereFromPositions(mesh.positions) + 2000
      ]
    : null;
  return {
    asset: { version: "1.0", gltfUpAxis: "Z" },
    geometricError: 200,
    root: {
      boundingVolume: sphere ? { sphere } : { region },
      geometricError: 0,
      refine: "ADD",
      content: {
        uri: "airspace.b3dm",
        boundingVolume: sphere ? { sphere } : { region }
      }
    }
  };
}

function nodeRegionAndSphere(globalBbox, minHeight, maxHeight, mesh = null) {
  const [west, south, east, north] = globalBbox;
  const lonSpan = Math.max(0, east - west);
  const latSpan = Math.max(0, north - south);
  const hSpan = Math.max(0, maxHeight - minHeight);
  const lonPad = Math.max(lonSpan * 0.02, 0.01);
  const latPad = Math.max(latSpan * 0.02, 0.01);
  const hPad = Math.max(hSpan * 0.15, 500);
  const region = [
    degToRad(west - lonPad),
    degToRad(south - latPad),
    degToRad(east + lonPad),
    degToRad(north + latPad),
    minHeight - hPad,
    maxHeight + hPad
  ];
  const sphere = mesh
    ? [
        mesh.rtcCenter[0],
        mesh.rtcCenter[1],
        mesh.rtcCenter[2],
        boundingSphereFromPositions(mesh.positions) + 2000
      ]
    : null;
  return { region, sphere };
}

function buildTilesetJsonFromRoot(rootNode, geometricError = 500) {
  return {
    asset: { version: "1.0", gltfUpAxis: "Z" },
    geometricError,
    root: rootNode
  };
}

function writeGeojsonAndManifest(args, mergedResult) {
  const { merged, bbox, stats } = mergedResult;
  const outGeojson = path.join(args.out, args.file);
  fs.writeFileSync(outGeojson, JSON.stringify(merged));
  return outGeojson;
}

function writeManifest(args, mergedResult, extra = {}) {
  const { bbox, stats } = mergedResult;
  const manifest = {
    schema: "aip-toolkit-3d-ready",
    generatedAt: new Date().toISOString(),
    sourceDir: args.in,
    clipBbox: args.bbox,
    output: args.file,
    bbox,
    stats,
    ...extra
  };
  fs.writeFileSync(path.join(args.out, "manifest.json"), JSON.stringify(manifest, null, 2));
}

function labelTextForFeature(feature) {
  const p = feature?.properties || {};
  const type = String(p.type || "").toUpperCase();
  const name = String(p.name || p.ident || p.icao || p.airspaceCenter || "").trim();
  if (!name) return "";
  if (type === "UF") return name;
  if (type === "UC") {
    const cls = String(p.classification || "").trim();
    return cls ? `${name} (${cls})` : name;
  }
  if (type === "UR") {
    const rt = String(p.restrictiveType || "").trim();
    return rt ? `${name} (${rt})` : name;
  }
  return name;
}

function labelAnchorLonLat(geom) {
  const b = geomBbox(geom);
  if (!b || !b.every(Number.isFinite)) return null;
  return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
}

function writeAirspaceLabels(args, mergedResult) {
  const features = mergedResult?.merged?.features || [];
  const labels = [];
  const seen = new Set();
  for (const f of features) {
    const p = f.properties || {};
    const type = String(p.type || "").toUpperCase();
    if (!["UF", "UC", "UR"].includes(type)) continue;
    const text = labelTextForFeature(f);
    if (!text) continue;
    const anchor = labelAnchorLonLat(f.geometry);
    if (!anchor) continue;
    const [lo, hi] = featureHeightSpan(f);
    const height = Math.max(0, (lo + hi) / 2 + (type === "UF" ? 1200 : 400));
    const key = `${type}|${text}|${anchor[0].toFixed(3)}|${anchor[1].toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    labels.push({
      type,
      text,
      lon: anchor[0],
      lat: anchor[1],
      height_m: height,
      lower_m: lo,
      upper_m: hi
    });
  }
  fs.writeFileSync(
    path.join(args.out, "airspace-labels.json"),
    JSON.stringify(
      {
        schema: "aip-toolkit-3d-labels",
        generatedAt: new Date().toISOString(),
        labels
      },
      null,
      2
    )
  );
  return labels.length;
}

function splitBboxQuad(b) {
  const [w, s, e, n] = b;
  const mx = (w + e) / 2;
  const my = (s + n) / 2;
  return [
    [w, s, mx, my], // SW
    [mx, s, e, my], // SE
    [w, my, mx, n], // NW
    [mx, my, e, n]  // NE
  ];
}

function featureHeightSpan(feature) {
  const p = feature.properties || {};
  const lo = Number(p.lower_m_effective ?? p.height_m ?? 0);
  const hi = Number(p.upper_m_effective ?? p.extrudedHeight_m ?? 0);
  return [Number.isFinite(lo) ? lo : 0, Number.isFinite(hi) ? hi : 0];
}

function subsetHeightExtents(features) {
  let minH = Infinity;
  let maxH = -Infinity;
  for (const f of features) {
    const [lo, hi] = featureHeightSpan(f);
    minH = Math.min(minH, lo);
    maxH = Math.max(maxH, hi);
  }
  return [Number.isFinite(minH) ? minH : 0, Number.isFinite(maxH) ? maxH : 0];
}

function geometricErrorForDepth(depth, maxDepth) {
  const base = 200;
  return depth >= maxDepth ? 0 : base / Math.pow(2, depth);
}

function buildQuadtreeTileset({ outDir, features, rootBbox, maxDepth, tileMaxFeatures, outlines = true }) {
  const featuresWithBbox = features.map((f, idx) => ({
    idx,
    feature: f,
    bbox: geomBbox(f.geometry)
  }));
  const tilesDir = path.join(outDir, "tiles");
  fs.mkdirSync(tilesDir, { recursive: true });

  let tileCount = 0;
  let leafCount = 0;
  let maxLeafFeatures = 0;

  function makeNode(subset, bbox, depth, key) {
    if (!subset.length) return null;
    tileCount++;

    const childBboxes = depth < maxDepth ? splitBboxQuad(bbox) : [];
    const children = [];

    if (depth < maxDepth && subset.length > tileMaxFeatures) {
      for (let i = 0; i < childBboxes.length; i++) {
        const cb = childBboxes[i];
        const childSubset = subset.filter((x) => bboxIntersects(x.bbox, cb));
        const child = makeNode(childSubset, cb, depth + 1, `${key}${i}`);
        if (child) children.push(child);
      }
    }

    const isLeaf = children.length === 0;
    const subsetFeatures = subset.map((x) => x.feature);
    const [minH, maxH] = subsetHeightExtents(subsetFeatures);

    let mesh = null;
    let content = undefined;
    if (isLeaf) {
      mesh = buildAirspaceMesh(subsetFeatures, bbox, minH, maxH, { outlines });
      if (!mesh) return null;
      const glb = buildGlbFromMesh(mesh);
      const b3dm = buildB3dm(glb, mesh.rtcCenter, mesh);
      const filename = `${key || "root"}.b3dm`;
      fs.writeFileSync(path.join(tilesDir, filename), b3dm);
      content = { uri: `tiles/${filename}` };
      leafCount++;
      maxLeafFeatures = Math.max(maxLeafFeatures, subset.length);
    }

    const { region, sphere } = nodeRegionAndSphere(bbox, minH, maxH, mesh);
    const node = {
      boundingVolume: sphere ? { sphere } : { region },
      geometricError: geometricErrorForDepth(depth, maxDepth),
      refine: "ADD"
    };
    if (content) {
      node.content = {
        ...content,
        boundingVolume: sphere ? { sphere } : { region }
      };
    }
    if (children.length) node.children = children;
    return node;
  }

  const rootSubset = featuresWithBbox.filter((x) => bboxIntersects(x.bbox, rootBbox));
  const root = makeNode(rootSubset, rootBbox, 0, "r");
  if (!root) throw new Error("Failed to build quadtree root tile.");

  return {
    tileset: buildTilesetJsonFromRoot(root, geometricErrorForDepth(0, maxDepth)),
    stats: { tileCount, leafCount, maxLeafFeatures }
  };
}

function main() {
  const args = parseArgs(process.argv);
  fs.mkdirSync(args.out, { recursive: true });

  const mergedResult = buildMergedAirspace(args);
  const { merged, bbox, minHeight, maxHeight, stats } = mergedResult;
  if (!bbox || !merged.features.length) {
    throw new Error("No airspace polygon features available after filtering. Check input directory / --layers / --bbox.");
  }

  const outGeojson = writeGeojsonAndManifest(args, mergedResult);
  let builtTileset = false;
  let tilesetStats = null;

  if (args.mode === "tileset" || args.mode === "both") {
    if (args.tileDepth > 0) {
      const qt = buildQuadtreeTileset({
        outDir: args.out,
        features: merged.features,
        rootBbox: bbox,
        maxDepth: args.tileDepth,
        tileMaxFeatures: args.tileMaxFeatures,
        outlines: args.outlines
      });
      fs.writeFileSync(path.join(args.out, "tileset.json"), JSON.stringify(qt.tileset, null, 2));
      builtTileset = true;
      tilesetStats = {
        mode: "quadtree",
        tileDepth: args.tileDepth,
        tileMaxFeatures: args.tileMaxFeatures,
        ...qt.stats
      };
    } else {
      const mesh = buildAirspaceMesh(merged.features, bbox, minHeight, maxHeight, { outlines: args.outlines });
      if (!mesh) throw new Error("Failed to build mesh from filtered features.");
      const glb = buildGlbFromMesh(mesh);
      const b3dm = buildB3dm(glb, mesh.rtcCenter, mesh);
      fs.writeFileSync(path.join(args.out, "airspace.b3dm"), b3dm);
      fs.writeFileSync(path.join(args.out, "tileset.json"), JSON.stringify(buildTilesetJson(bbox, minHeight, maxHeight, mesh), null, 2));
      builtTileset = true;
      tilesetStats = {
        mode: "single-tile",
        vertices: mesh.positions.length / 3,
        triangles: mesh.indices.length / 3,
        glbBytes: glb.length,
        b3dmBytes: b3dm.length
      };
    }
  }

  writeManifest(args, mergedResult, {
    mode: args.mode,
    outlines: args.outlines,
    geojsonOutput: path.basename(outGeojson),
    tileset: builtTileset ? {
      tilesetJson: "tileset.json",
      content: "airspace.b3dm",
      stats: tilesetStats
    } : null,
    note: builtTileset
      ? "MVP 3D Tiles generated (single-tile by default, or quadtree if --tile-depth > 0)."
      : "Cesium-ready extruded GeoJSON generated. Use --mode tileset or --mode both to build an MVP 3D Tiles tileset."
  });

  console.log(
    "Done:",
    stats.total,
    "polygon features ->",
    outGeojson,
    `(types: ${Object.entries(stats.byType).map(([k, v]) => `${k}=${v}`).join(", ") || "none"})`
  );
  if (builtTileset) {
    console.log(
      "3D Tiles:",
      tilesetStats.mode === "quadtree"
        ? `tileset.json + ${tilesetStats.leafCount} leaf b3dm tiles`
        : `tileset.json + airspace.b3dm`,
      tilesetStats.mode === "quadtree"
        ? `(tileDepth=${tilesetStats.tileDepth}, tileCount=${tilesetStats.tileCount}, leaves=${tilesetStats.leafCount}, maxLeafFeatures=${tilesetStats.maxLeafFeatures}, outlines=${args.outlines})`
        : `(vertices=${tilesetStats.vertices}, triangles=${tilesetStats.triangles}, b3dm=${tilesetStats.b3dmBytes} bytes, outlines=${args.outlines})`
    );
  } else {
    console.log("Note: Generated Cesium-ready extruded GeoJSON only. Use --mode tileset or --mode both for an MVP 3D Tiles tileset.");
  }
}

main();
