import Map from "https://esm.sh/ol@10.6.1/Map.js";
import View from "https://esm.sh/ol@10.6.1/View.js";
import TileLayer from "https://esm.sh/ol@10.6.1/layer/Tile.js";
import VectorTileLayer from "https://esm.sh/ol@10.6.1/layer/VectorTile.js";
import OSM from "https://esm.sh/ol@10.6.1/source/OSM.js";
import VectorTileSource from "https://esm.sh/ol@10.6.1/source/VectorTile.js";
import GeoJSON from "https://esm.sh/ol@10.6.1/format/GeoJSON.js";
import { createXYZ } from "https://esm.sh/ol@10.6.1/tilegrid.js";
import { Fill, Stroke, Style, Circle as CircleStyle, Text } from "https://esm.sh/ol@10.6.1/style.js";
import { transformExtent, fromLonLat } from "https://esm.sh/ol@10.6.1/proj.js";
import {
  load2DTilesIndex,
  isVisualizationIndex
} from "./visualization-index.js";

const params = new URLSearchParams(window.location.search);
const defaultIndexUrl = params.get("index") || "/data/visualization.index.json";
const labelsEnabled = params.get("labels") !== "0";
const labelsMinZoom = Number(params.get("labelsMinZoom") ?? 7);
const debugEnabled = params.get("debug") === "1";

const statusEl = document.getElementById("status");
const indexUrlEl = document.getElementById("indexUrl");
const loadBtn = document.getElementById("load");
const pickTilesDirBtn = document.getElementById("pickTilesDir");
const pickIndexFileBtn = document.getElementById("pickIndexFile");
const tilesDirInput = document.getElementById("tilesDirInput");
const indexFileInput = document.getElementById("indexFileInput");

indexUrlEl.value = defaultIndexUrl;
const DEBUG_PREFIX = "[arinc-view:ol]";
const debugLog = (...args) => { if (debugEnabled) console.log(DEBUG_PREFIX, ...args); };
const debugWarn = (...args) => { if (debugEnabled) console.warn(DEBUG_PREFIX, ...args); };
const debugError = (...args) => { if (debugEnabled) console.error(DEBUG_PREFIX, ...args); };

const staticLayerStyles = {
  airports: new Style({
    image: new CircleStyle({ radius: 6, fill: new Fill({ color: "#1b4f81" }), stroke: new Stroke({ color: "#ffffff", width: 1.5 }) }),
    zIndex: 90
  }),
  heliports: new Style({
    image: new CircleStyle({ radius: 5, fill: new Fill({ color: "#805300" }), stroke: new Stroke({ color: "#ffffff", width: 1.2 }) }),
    zIndex: 89
  }),
  runways: new Style({
    stroke: new Stroke({ color: "#2b2b2b", width: 3 }),
    zIndex: 80
  }),
  waypoints: new Style({
    image: new CircleStyle({ radius: 3.5, fill: new Fill({ color: "#118a63" }), stroke: new Stroke({ color: "#ffffff", width: 1 }) }),
    zIndex: 95
  }),
  navaids: new Style({
    image: new CircleStyle({ radius: 4.5, fill: new Fill({ color: "#6940b5" }), stroke: new Stroke({ color: "#ffffff", width: 1 }) }),
    zIndex: 94
  }),
  airways: new Style({
    stroke: new Stroke({ color: "#f08c1a", width: 1.8 }),
    zIndex: 40
  }),
  airspaces: new Style({
    fill: new Fill({ color: "rgba(55, 112, 209, 0.10)" }),
    stroke: new Stroke({ color: "rgba(55, 112, 209, 0.95)", width: 1.5 }),
    zIndex: 10
  }),
  procedures: new Style({
    stroke: new Stroke({ color: "#c91a6f", width: 2, lineDash: [8, 4] }),
    zIndex: 70
  }),
  holds: new Style({
    stroke: new Stroke({ color: "#7d4d2a", width: 2, lineDash: [3, 4] }),
    zIndex: 65
  })
};

const restrictedAirspaceStyle = new Style({
  fill: new Fill({ color: "rgba(124, 76, 173, 0.12)" }),
  stroke: new Stroke({ color: "rgba(124, 76, 173, 0.95)", width: 1.4, lineDash: [6, 4] }),
  zIndex: 11
});

const fallbackStyle = new Style({
  stroke: new Stroke({ color: "#234f3f", width: 1.3 }),
  image: new CircleStyle({ radius: 3, fill: new Fill({ color: "#234f3f" }) }),
  zIndex: 1
});
const labelStyleCache = new Map();

const map = new Map({
  target: "map",
  layers: [
    new TileLayer({ source: new OSM() })
  ],
  view: new View({ center: [-8250000, 4950000], zoom: 6, minZoom: 2, maxZoom: 15 })
});

let tileLayer = null;
let localTileFiles = new Map();
let localIndexFile = null;

function layerStyle(feature, resolution) {
  return styleByLayer(feature, resolution);
}

function styleByLayer(feature, resolution) {
  const layer = String(feature.get("layer") || "").toLowerCase();
  const layerStyle = staticLayerStyles[layer] || fallbackStyle;
  const out = [layerStyle];

  if (layer === "airspaces") {
    const restrictive = feature.get("restrictiveType");
    if (restrictive) out[0] = restrictedAirspaceStyle;
  }

  if (!labelsEnabled) return out;
  const zoom = map.getView().getZoomForResolution(resolution);
  if (!Number.isFinite(zoom) || zoom < labelsMinZoom) return out;

  const canLabel = layer === "airports" || layer === "airspaces" || layer === "waypoints";
  if (!canLabel) return out;

  const label = String(feature.get("name") || feature.get("ident") || feature.get("id") || "").trim();
  if (!label) return out;

  const key = `${layer}|${label}`;
  let labelStyle = labelStyleCache.get(key);
  if (!labelStyle) {
    labelStyle = new Style({
      text: new Text({
        text: label,
        font: "12px 'Segoe UI', sans-serif",
        fill: new Fill({ color: "#202020" }),
        stroke: new Stroke({ color: "#ffffff", width: 3 }),
        overflow: true
      }),
      zIndex: 120
    });
    labelStyleCache.set(key, labelStyle);
  }
  out.push(labelStyle);
  return out;
}

function setStatus(text) {
  statusEl.textContent = text;
}

function normalizeRelativeUri(basePath, targetUri) {
  const from = String(basePath || "").replaceAll("\\\\", "/").split("/");
  from.pop();
  const parts = String(targetUri || "").replaceAll("\\\\", "/").split("/");
  for (const p of parts) {
    if (!p || p === ".") continue;
    if (p === "..") from.pop();
    else from.push(p);
  }
  return from.join("/");
}

function findLocalFile(uri) {
  if (!uri) return null;
  const clean = String(uri).replaceAll("\\\\", "/");
  return localTileFiles.get(clean) || localTileFiles.get(clean.replace(/^\.\/+/, "")) || localTileFiles.get(clean.split("/").pop());
}

async function load2DTilesIndexFromLocalSelection() {
  const visIndexFile = localIndexFile || findLocalFile("visualization.index.json");
  if (visIndexFile) {
    const vis = JSON.parse(await visIndexFile.text());
    if (isVisualizationIndex(vis)) {
      const out = vis.outputs?.tiles2d;
      if (!out?.index) throw new Error("visualization.index.json does not contain outputs.tiles2d.index");
      const indexPath = normalizeRelativeUri("visualization.index.json", out.index);
      const idxFile = findLocalFile(indexPath) || findLocalFile("tiles/index.json") || findLocalFile("index.json");
      if (!idxFile) throw new Error(`Cannot find local 2D index file referenced by visualization index: ${out.index}`);
      const tilesIndex = JSON.parse(await idxFile.text());
      return {
        visualizationIndex: vis,
        tilesIndex,
        tilesIndexPath: idxFile.webkitRelativePath || idxFile.name || "tiles/index.json"
      };
    }
  }

  const directIdx = localIndexFile || findLocalFile("tiles/index.json") || findLocalFile("index.json");
  if (!directIdx) throw new Error("No local visualization.index.json or tiles/index.json found");
  return {
    visualizationIndex: null,
    tilesIndex: JSON.parse(await directIdx.text()),
    tilesIndexPath: directIdx.webkitRelativePath || directIdx.name || "tiles/index.json"
  };
}

function createTileLayer(config) {
  const renderTileUrl = (z, x, y) => config.remoteTemplate
    .replace("{z}", String(z))
    .replace("{x}", String(x))
    .replace("{y}", String(y));
  const toXyzY = (tileCoordY) => (tileCoordY < 0 ? -tileCoordY - 1 : tileCoordY);
  const tileFormat = new GeoJSON({ dataProjection: "EPSG:4326", featureProjection: "EPSG:3857" });

  const tileGrid = createXYZ({
    minZoom: Number.isFinite(config.minZoom) ? config.minZoom : 0,
    maxZoom: Number.isFinite(config.maxZoom) ? config.maxZoom : 14
  });

  const source = new VectorTileSource({
    tileGrid,
    format: tileFormat,
    tileUrlFunction: ([z, x, y]) => {
      const xyzY = toXyzY(y);
      if (config.remoteTemplate) {
        return renderTileUrl(z, x, xyzY);
      }
      return `local://${z}/${x}/${xyzY}.json`;
    },
    tileLoadFunction: async (tile, url) => {
      tile.setLoader(async (_extent, _resolution, projection) => {
        const [z, x, y] = tile.getTileCoord();
        const xyzY = toXyzY(y);
        const maxIndex = (2 ** z) - 1;
        const requestUrl = config.remoteTemplate ? renderTileUrl(z, x, xyzY) : url;
        debugLog("tile request", { z, x, y: xyzY, url: requestUrl });
        if (!Number.isFinite(xyzY) || xyzY < 0 || xyzY > maxIndex) {
          tile.setFeatures([]);
          return;
        }
        try {
          if (config.localMode) {
            const tilePath = `${z}/${x}/${xyzY}.json`;
            const file = findLocalFile(tilePath) || findLocalFile(`tiles/${tilePath}`);
            if (!file) {
              tile.setFeatures([]);
              return;
            }
            const json = JSON.parse(await file.text());
            const features = tileFormat.readFeatures(json, {
              dataProjection: "EPSG:4326",
              featureProjection: projection ?? "EPSG:3857"
            });
            tile.setFeatures(features);
            debugLog("tile loaded (local)", { z, x, y: xyzY, featureCount: features.length });
            return;
          }

          const candidateUrl = config.remoteTemplate ? renderTileUrl(z, x, xyzY) : url;
          const r = await fetch(candidateUrl);
          if (r.status === 404) {
            debugWarn("tile 404 treated as empty", { z, x, y: xyzY, url: candidateUrl });
            tile.setFeatures([]);
            return;
          }
          if (!r.ok) {
            throw new Error(`HTTP ${r.status} for tile ${z}/${x}/${xyzY}`);
          }
          const json = await r.json();
          const features = tileFormat.readFeatures(json, {
            dataProjection: "EPSG:4326",
            featureProjection: projection ?? "EPSG:3857"
          });
          tile.setFeatures(features);
          debugLog("tile loaded", { z, x, y: xyzY, url: candidateUrl, featureCount: features.length });
        } catch (err) {
          debugError("tile load failure", { z, x, y: xyzY, error: err?.message || String(err) });
          tile.setFeatures([]);
        }
      });
    },
    wrapX: false
  });

  if (config.recenterOnFirstFeature) {
    let recentered = false;
    source.on("tileloadend", (evt) => {
      if (recentered) return;
      const tile = evt.tile;
      const features = tile?.getFeatures?.();
      if (!Array.isArray(features) || features.length === 0) return;
      const [z, x, tileY] = tile.getTileCoord();
      const xyzY = toXyzY(tileY);
      recenterToTile(z, x, xyzY, Number(config.minZoom));
      recentered = true;
    });
  }

  return new VectorTileLayer({ source, style: layerStyle, declutter: true });
}

function resolveTileTemplateUrl(indexUrl, tileTemplate) {
  if (!tileTemplate) throw new Error("Missing tileTemplate");
  if (/^https?:\/\//i.test(tileTemplate) || tileTemplate.startsWith("/")) return tileTemplate;
  const fallbackBase = (typeof window !== "undefined" && window.location) ? window.location.href : "http://localhost/";
  const baseDir = new URL(".", new URL(indexUrl, fallbackBase)).toString();
  return `${baseDir}${String(tileTemplate).replace(/^\.\/+/, "")}`;
}

function isGlobalLikeBounds(bounds) {
  if (!Array.isArray(bounds) || bounds.length !== 4) return false;
  const [minLon, minLat, maxLon, maxLat] = bounds;
  if (![minLon, minLat, maxLon, maxLat].every((n) => Number.isFinite(n))) return false;
  return (maxLon - minLon) > 300 || (maxLat - minLat) > 140;
}

function tileCenterLonLat(z, x, y) {
  const n = 2 ** z;
  const lon = ((x + 0.5) / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 0.5) / n)));
  const lat = (latRad * 180) / Math.PI;
  return [lon, lat];
}

function recenterToTile(z, x, y, minZoomHint) {
  const [lon, lat] = tileCenterLonLat(z, x, y);
  const view = map.getView();
  view.setCenter(fromLonLat([lon, lat]));
  if (Number.isFinite(minZoomHint)) view.setZoom(Math.max(minZoomHint, z));
}

function fitBoundsIfPresent(bounds, minZoomHint) {
  if (!Array.isArray(bounds) || bounds.length !== 4) return;
  const [minLon, minLatRaw, maxLon, maxLatRaw] = bounds;
  const minLat = Math.max(-85.05112878, Math.min(85.05112878, minLatRaw));
  const maxLat = Math.max(-85.05112878, Math.min(85.05112878, maxLatRaw));
  if (![minLon, minLat, maxLon, maxLat].every((n) => Number.isFinite(n))) return;

  const extent = transformExtent([minLon, minLat, maxLon, maxLat], "EPSG:4326", "EPSG:3857");
  const view = map.getView();
  debugLog("fit extent", {
    bounds4326: [minLon, minLat, maxLon, maxLat],
    extent3857: extent,
    minZoomHint
  });
  view.fit(extent, { duration: 700, padding: [40, 40, 40, 40], maxZoom: 11 });
  if (Number.isFinite(minZoomHint)) {
    const z = view.getZoom();
    if (Number.isFinite(z) && z < minZoomHint) view.setZoom(minZoomHint);
  }
}

async function findBootstrapTile(remoteTemplate, z) {
  const n = 2 ** z;
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) {
      const url = remoteTemplate.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));
      debugLog("bootstrap probe", { z, x, y, url });
      try {
        const r = await fetch(url);
        if (r.status === 404) continue;
        if (!r.ok) continue;
        const json = await r.json();
        const featureCount = Array.isArray(json?.features) ? json.features.length : 0;
        if (featureCount > 0) {
          debugLog("bootstrap tile found", { z, x, y, featureCount, url });
          return { z, x, y };
        }
      } catch {
        // ignore and continue probing
      }
    }
  }
  debugWarn("bootstrap tile not found", { z });
  return null;
}

async function loadFromRemoteIndex(indexUrl) {
  const loaded = await load2DTilesIndex(indexUrl);
  const { tilesIndex, tilesIndexUrl } = loaded;
  const remoteTemplate = resolveTileTemplateUrl(tilesIndexUrl, tilesIndex.tileTemplate);
  const globalLike = isGlobalLikeBounds(tilesIndex.bounds);
  debugLog("index loaded", {
    source: loaded.source,
    tilesIndexUrl,
    tileTemplate: tilesIndex.tileTemplate,
    resolvedTemplate: remoteTemplate,
    minZoom: tilesIndex.minZoom,
    maxZoom: tilesIndex.maxZoom,
    bounds: tilesIndex.bounds
  });

  if (tileLayer) map.removeLayer(tileLayer);
  const view = map.getView();
  if (Number.isFinite(Number(tilesIndex.minZoom))) view.setMinZoom(Number(tilesIndex.minZoom));
  if (Number.isFinite(Number(tilesIndex.maxZoom))) {
    // Keep tile maxZoom semantics, but do not block map inspection at closer zooms.
    view.setMaxZoom(Math.max(Number(tilesIndex.maxZoom) + 6, 18));
  }
  tileLayer = createTileLayer({
    localMode: false,
    remoteTemplate,
    minZoom: tilesIndex.minZoom,
    maxZoom: tilesIndex.maxZoom,
    recenterOnFirstFeature: globalLike
  });
  map.addLayer(tileLayer);

  if (globalLike) {
    if (Number.isFinite(Number(tilesIndex.minZoom))) view.setZoom(Number(tilesIndex.minZoom));
    const t = await findBootstrapTile(remoteTemplate, Number(tilesIndex.minZoom) || 4);
    if (t) recenterToTile(t.z, t.x, t.y, Number(tilesIndex.minZoom));
  } else {
    fitBoundsIfPresent(tilesIndex.bounds, Number(tilesIndex.minZoom));
  }
  setStatus(`Loaded 2D tiles index (${loaded.source}): ${tilesIndexUrl}`);
}

async function loadFromLocalSelection() {
  const loaded = await load2DTilesIndexFromLocalSelection();
  const { tilesIndex } = loaded;
  const globalLike = isGlobalLikeBounds(tilesIndex.bounds);
  debugLog("local index loaded", {
    minZoom: tilesIndex.minZoom,
    maxZoom: tilesIndex.maxZoom,
    tileTemplate: tilesIndex.tileTemplate,
    bounds: tilesIndex.bounds
  });

  if (tileLayer) map.removeLayer(tileLayer);
  const view = map.getView();
  if (Number.isFinite(Number(tilesIndex.minZoom))) view.setMinZoom(Number(tilesIndex.minZoom));
  if (Number.isFinite(Number(tilesIndex.maxZoom))) {
    // Keep tile maxZoom semantics, but do not block map inspection at closer zooms.
    view.setMaxZoom(Math.max(Number(tilesIndex.maxZoom) + 6, 18));
  }
  tileLayer = createTileLayer({
    localMode: true,
    remoteTemplate: null,
    minZoom: tilesIndex.minZoom,
    maxZoom: tilesIndex.maxZoom,
    recenterOnFirstFeature: globalLike
  });
  map.addLayer(tileLayer);

  if (globalLike) {
    if (Number.isFinite(Number(tilesIndex.minZoom))) view.setZoom(Number(tilesIndex.minZoom));
    let recentered = false;
    for (const key of localTileFiles.keys()) {
      const m = /^(\d+)\/(\d+)\/(\d+)\.json$/.exec(key) || /^tiles\/(\d+)\/(\d+)\/(\d+)\.json$/.exec(key);
      if (!m) continue;
      const z = Number(m[1]);
      const x = Number(m[2]);
      const y = Number(m[3]);
      if (!Number.isFinite(z) || z !== Number(tilesIndex.minZoom)) continue;
      const file = findLocalFile(`${z}/${x}/${y}.json`) || findLocalFile(`tiles/${z}/${x}/${y}.json`);
      if (!file) continue;
      try {
        const json = JSON.parse(await file.text());
        const c = Array.isArray(json?.features) ? json.features.length : 0;
        if (c > 0) {
          recenterToTile(z, x, y, Number(tilesIndex.minZoom));
          debugLog("local bootstrap tile found", { z, x, y, featureCount: c });
          recentered = true;
          break;
        }
      } catch {
        // continue
      }
    }
    if (!recentered) debugWarn("local bootstrap tile not found at minZoom", { minZoom: tilesIndex.minZoom });
  } else {
    fitBoundsIfPresent(tilesIndex.bounds, Number(tilesIndex.minZoom));
  }
  setStatus(`Loaded local 2D index with ${localTileFiles.size} files.`);
}

async function loadTiles() {
  try {
    if (localTileFiles.size > 0) {
      await loadFromLocalSelection();
      return;
    }
    const indexUrl = indexUrlEl.value.trim();
    if (!indexUrl) {
      setStatus("Missing index URL (visualization.index.json or tiles/index.json)");
      return;
    }
    await loadFromRemoteIndex(indexUrl);
  } catch (err) {
    setStatus(`Failed to load index: ${err?.message || err}`);
  }
}

loadBtn.addEventListener("click", () => {
  void loadTiles();
});

pickTilesDirBtn.addEventListener("click", () => {
  tilesDirInput.value = "";
  tilesDirInput.click();
});

pickIndexFileBtn.addEventListener("click", () => {
  indexFileInput.value = "";
  indexFileInput.click();
});

tilesDirInput.addEventListener("change", async (ev) => {
  const files = Array.from(ev.target.files || []);
  localTileFiles = new Map();

  for (const f of files) {
    const relRaw = String(f.webkitRelativePath || f.name).replaceAll("\\\\", "/");
    const relNoRoot = relRaw.includes("/") ? relRaw.slice(relRaw.indexOf("/") + 1) : relRaw;
    localTileFiles.set(relNoRoot, f);
    localTileFiles.set(f.name, f);

    if (/visualization\.index\.json$/i.test(relNoRoot) || /(^|\/)tiles\/index\.json$/i.test(relNoRoot)) {
      localIndexFile = f;
    }
  }

  if (localTileFiles.size === 0) {
    setStatus("No files found in selected folder.");
    return;
  }
  const indexName = localIndexFile?.name || "none";
  setStatus(`Selected local folder with ${files.length} files (index: ${indexName}).`);
  void loadTiles();
});

indexFileInput.addEventListener("change", async (ev) => {
  const file = ev.target.files?.[0];
  if (!file) return;
  localIndexFile = file;
  try {
    JSON.parse(await file.text());
    setStatus(`Loaded local index file: ${file.name}`);
  } catch (err) {
    setStatus(`Invalid index file: ${err?.message || err}`);
    return;
  }
  void loadTiles();
});

void loadTiles();
