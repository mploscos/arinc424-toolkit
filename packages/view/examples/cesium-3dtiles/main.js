import {
  load3DTilesIndex,
  isVisualizationIndex,
  resolveRelativeAssetUrl
} from "./visualization-index.js";
const params = new URLSearchParams(window.location.search);
const defaultIndexUrl = params.get("index") || "";
const debugEnabled = params.get("debug") === "1";
const basemapMode = params.get("basemap") || "muted";
let activeRemoteIndexUrl = defaultIndexUrl.trim();

const loadBtn = document.getElementById("load");
const statusEl = document.getElementById("status");
const indexFileInput = document.getElementById("indexFileInput");

const viewer = new Cesium.Viewer("cesiumContainer", {
  timeline: false,
  animation: false,
  selectionIndicator: true,
  geocoder: false,
  homeButton: true,
  sceneModePicker: true,
  navigationHelpButton: false,
  baseLayerPicker: false,
  baseLayer: false
});
viewer.imageryLayers.removeAll();
const basemapLayer = viewer.imageryLayers.addImageryProvider(new Cesium.OpenStreetMapImageryProvider({
  url: "https://tile.openstreetmap.org/"
}));

function applyBasemapMode(layer, mode) {
  if (!layer) return;
  if (mode === "standard") {
    layer.alpha = 1;
    layer.brightness = 1;
    layer.contrast = 1;
    layer.saturation = 1;
    layer.gamma = 1;
    return;
  }
  layer.alpha = 0.82;
  layer.brightness = 1.06;
  layer.contrast = 0.86;
  layer.saturation = 0.2;
  layer.gamma = 1.02;
}

applyBasemapMode(basemapLayer, basemapMode);

let activeTileset = null;
let local3dFiles = new Map();
let localIndexFile = null;
let localBlobUrls = [];
let rewrittenJsonByPath = new Map();
const DEBUG_PREFIX = "[arinc-view:cesium]";
const debugLog = (...args) => { if (debugEnabled) console.log(DEBUG_PREFIX, ...args); };
const debugWarn = (...args) => { if (debugEnabled) console.warn(DEBUG_PREFIX, ...args); };
const debugError = (...args) => { if (debugEnabled) console.error(DEBUG_PREFIX, ...args); };
const SEMANTIC_AIRSPACE_PALETTE = Object.freeze({
  controlledMajorFill: "rgba(58, 101, 168, 0.055)"
});

function rgbaStringToCesiumCss(rgba, alphaOverride = null) {
  const match = /^rgba\(([^,]+),([^,]+),([^,]+),([^)]+)\)$/.exec(String(rgba));
  if (!match) return rgba;
  const alpha = alphaOverride ?? Number(match[4]);
  return `rgba(${match[1].trim()},${match[2].trim()},${match[3].trim()},${alpha})`;
}

function setStatus(msg) {
  statusEl.textContent = msg;
}

async function pickReachableIndexUrl(candidates) {
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const r = await fetch(candidate);
      if (r.ok) return candidate;
    } catch {
      // try next
    }
  }
  return null;
}

async function resolveRemoteIndexUrlFromSelectedJson(doc) {
  const explicit = String(
    doc?.servedVisualizationIndexUrl
    || doc?.paths?.servedVisualizationIndexUrl
    || doc?.servedPaths?.visualizationIndex
    || ""
  ).trim();
  if (explicit) return explicit;

  const candidates = [];
  const dataset = String(doc?.dataset || "").trim();
  if (dataset) {
    candidates.push(`/artifacts/${dataset}/visualization.index.json`);
    candidates.push(`/artifacts/${dataset.toLowerCase()}/visualization.index.json`);
    candidates.push(`/artifacts/${dataset.toUpperCase()}/visualization.index.json`);
    candidates.push(`/data/${dataset}/visualization.index.json`);
    candidates.push(`/data/${dataset.toLowerCase()}/visualization.index.json`);
    candidates.push(`/data/${dataset.toUpperCase()}/visualization.index.json`);
  }
  candidates.push("/artifacts/visualization.index.json", "/data/visualization.index.json");
  return pickReachableIndexUrl(candidates);
}

// TODO (future Cesium procedure work):
// Represent only selected high-value procedures as 3D-friendly ribbons/corridors or similar forms.
// Avoid reintroducing dense generic ground-clamped procedure polyline overlays here.

function clearBlobUrls() {
  for (const u of localBlobUrls) URL.revokeObjectURL(u);
  localBlobUrls = [];
  rewrittenJsonByPath = new Map();
}

async function makeBlobUrl(fileEntry) {
  const url = URL.createObjectURL(await fileEntry.getFile());
  localBlobUrls.push(url);
  return url;
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

function findLocal3dFile(uri) {
  if (!uri) return null;
  const clean = String(uri).replaceAll("\\\\", "/");
  return local3dFiles.get(clean) || local3dFiles.get(clean.replace(/^\.\/+/, "")) || local3dFiles.get(clean.split("/").pop());
}

function createLocal3dEntry(pathKey, source) {
  const relativePath = String(pathKey || source?.webkitRelativePath || source?.name || "")
    .replaceAll("\\\\", "/")
    .replace(/^\/+/, "");
  const name = relativePath.split("/").pop() || String(source?.name || "");
  return {
    name,
    webkitRelativePath: relativePath,
    async getFile() {
      if (source && typeof source.getFile === "function") return source.getFile();
      return source;
    },
    async text() {
      const file = await this.getFile();
      return file.text();
    }
  };
}

async function ingest3dDirectoryHandle(dirHandle, relativeBase = "") {
  for await (const [entryName, handle] of dirHandle.entries()) {
    const nextPath = relativeBase ? `${relativeBase}/${entryName}` : entryName;
    if (handle.kind === "directory") {
      await ingest3dDirectoryHandle(handle, nextPath);
      continue;
    }
    const entry = createLocal3dEntry(nextPath, handle);
    const clean = entry.webkitRelativePath.replace(/^\.\/+/, "");
    local3dFiles.set(clean, entry);
    local3dFiles.set(entry.name, entry);
    if (entry.name === "visualization.index.json" && !localIndexFile) localIndexFile = entry;
  }
}

async function pickLocal3dDirectory() {
  if (typeof window.showDirectoryPicker === "function") {
    const dirHandle = await window.showDirectoryPicker({ mode: "read" });
    local3dFiles = new Map();
    localIndexFile = null;
    await ingest3dDirectoryHandle(dirHandle);
    return;
  }
  indexFileInput.value = "";
  indexFileInput.click();
}

function setLocal3dSelection(files = []) {
  local3dFiles = new Map();
  localIndexFile = null;
  for (const file of files) {
    if (!file) continue;
    const entry = createLocal3dEntry(file.webkitRelativePath || file.name || "", file);
    const clean = entry.webkitRelativePath.replace(/^\.\/+/, "");
    if (!clean) continue;
    local3dFiles.set(clean, entry);
    local3dFiles.set(entry.name, entry);
    if (entry.name === "visualization.index.json" && !localIndexFile) localIndexFile = entry;
  }
}

function isLikelyJsonPath(p) {
  return /\.json$/i.test(String(p || ""));
}

async function rewriteContentRef(basePath, refObj, key) {
  const original = refObj?.[key];
  if (!original) return;
  const resolvedPath = normalizeRelativeUri(basePath, original);
  const f = findLocal3dFile(resolvedPath) || findLocal3dFile(original);
  if (!f) return;

  if (isLikelyJsonPath(resolvedPath) || isLikelyJsonPath(f.name)) {
    refObj[key] = await buildRewrittenTilesetUrl(f, resolvedPath);
    return;
  }
  refObj[key] = await makeBlobUrl(f);
}

async function rewriteTilesetObject(json, basePath) {
  if (!json || typeof json !== "object") return;

  async function visitNode(node) {
    if (!node || typeof node !== "object") return;

    if (node.content && typeof node.content === "object") {
      await rewriteContentRef(basePath, node.content, "uri");
      await rewriteContentRef(basePath, node.content, "url");
    }
    if (Array.isArray(node.contents)) {
      for (const c of node.contents) {
        if (!c || typeof c !== "object") continue;
        await rewriteContentRef(basePath, c, "uri");
        await rewriteContentRef(basePath, c, "url");
      }
    }
    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        await visitNode(child);
      }
    }
  }

  await visitNode(json.root);
}

async function buildRewrittenTilesetUrl(file, filePathKey) {
  const key = String(filePathKey || file.name || "tileset.json").replaceAll("\\\\", "/");
  const cached = rewrittenJsonByPath.get(key);
  if (cached) return cached;

  const json = JSON.parse(await file.text());
  await rewriteTilesetObject(json, key);
  const blob = new Blob([JSON.stringify(json)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  localBlobUrls.push(url);
  rewrittenJsonByPath.set(key, url);
  return url;
}

async function deriveAndLoadBoundsFromArray(bounds) {
  if (!Array.isArray(bounds) || bounds.length !== 4) return false;
  const [minLon, minLat, maxLon, maxLat] = bounds;
  if (![minLon, minLat, maxLon, maxLat].every((n) => Number.isFinite(n))) return false;
  const lonSpan = maxLon - minLon;
  const latSpan = maxLat - minLat;
  // Ignore near-global extents from coarse manifests; they hide local 3D tiles.
  if (lonSpan > 300 || latSpan > 140) {
    debugWarn("bounds ignored (near-global)", { bounds, lonSpan, latSpan });
    return false;
  }
  const rect = Cesium.Rectangle.fromDegrees(minLon, minLat, maxLon, maxLat);
  await viewer.camera.flyTo({ destination: rect, duration: 1.1 });
  debugLog("camera fitted to bounds", { bounds });
  return true;
}

async function resolveLocalTilesetSelection() {
  const maybeVis = localIndexFile || findLocal3dFile("visualization.index.json");
  if (maybeVis) {
    try {
      const vis = JSON.parse(await maybeVis.text());
      if (isVisualizationIndex(vis)) {
        const ref = vis.outputs?.tiles3d;
        if (ref?.index) {
          const idxPath = normalizeRelativeUri("visualization.index.json", ref.index);
          const idxFile = findLocal3dFile(idxPath) || findLocal3dFile("3dtiles/index.json") || findLocal3dFile("index.json");
          if (idxFile) {
            const idx = JSON.parse(await idxFile.text());
            const tilesetRel = idx.tileset || "./tileset.json";
            const tilesetPath = normalizeRelativeUri(idxFile.webkitRelativePath || idxFile.name || "3dtiles/index.json", tilesetRel);
            const tilesetFile = findLocal3dFile(tilesetPath) || findLocal3dFile("tileset.json");
            if (tilesetFile) {
              return {
                tilesetUrl: await buildRewrittenTilesetUrl(tilesetFile, tilesetFile.webkitRelativePath || tilesetFile.name || "tileset.json"),
                bounds: idx.bounds,
                visualizationIndex: vis,
                threeDTilesIndex: idx
              };
            }
          }
        }
      }
    } catch {
      // Continue with fallback resolution.
    }
  }

  const directIdx = localIndexFile || findLocal3dFile("3dtiles/index.json") || findLocal3dFile("index.json");
  if (directIdx) {
    try {
      const idx = JSON.parse(await directIdx.text());
      if (idx?.type === "3dtiles" && typeof idx.tileset === "string") {
        const tilesetPath = normalizeRelativeUri(directIdx.webkitRelativePath || directIdx.name || "3dtiles/index.json", idx.tileset);
        const tilesetFile = findLocal3dFile(tilesetPath) || findLocal3dFile("tileset.json");
        if (tilesetFile) {
          return {
            tilesetUrl: await buildRewrittenTilesetUrl(tilesetFile, tilesetFile.webkitRelativePath || tilesetFile.name || "tileset.json"),
            bounds: idx.bounds,
            visualizationIndex: null,
            threeDTilesIndex: idx
          };
        }
      }
    } catch {
      // Continue with fallback resolution.
    }
  }

  const tilesetFile = findLocal3dFile("tileset.json");
  if (!tilesetFile) throw new Error("No local tileset.json found in selected files");
  return {
    tilesetUrl: await buildRewrittenTilesetUrl(tilesetFile, tilesetFile.webkitRelativePath || tilesetFile.name || "tileset.json"),
    bounds: null,
    visualizationIndex: null,
    threeDTilesIndex: null
  };
}

async function loadTileset() {
  clearBlobUrls();
  const hasLocal = local3dFiles.size > 0;

  try {
    if (activeTileset) {
      viewer.scene.primitives.remove(activeTileset);
      activeTileset = null;
    }

    let tilesetUrl = "";
    let bounds = null;
    let statusSource = "";
    let remoteLoaded = null;
    let localSelection = null;

    if (hasLocal) {
      localSelection = await resolveLocalTilesetSelection();
      tilesetUrl = localSelection.tilesetUrl;
      bounds = localSelection.bounds;
      statusSource = "local selection";
      debugLog("local tileset resolved", { tilesetUrl, bounds });
    } else {
      if (!activeRemoteIndexUrl) {
        setStatus("Select visualization.index.json.");
        return;
      }

      remoteLoaded = await load3DTilesIndex(activeRemoteIndexUrl);
      const idx = remoteLoaded.threeDTilesIndex;
      tilesetUrl = resolveRelativeAssetUrl(remoteLoaded.threeDTilesIndexUrl, idx.tileset);
      bounds = idx.bounds;
      statusSource = remoteLoaded.threeDTilesIndexUrl;
      debugLog("index loaded", {
        source: remoteLoaded.source,
        visualizationIndexUrl: remoteLoaded.visualizationIndexUrl ?? null,
        threeDTilesIndexUrl: remoteLoaded.threeDTilesIndexUrl,
        tileset: idx.tileset,
        bounds: idx.bounds,
        summary: idx.summary ?? null
      });
    }

    setStatus(`Loading 3D Tiles from ${statusSource} ...`);
    const tileset = await Cesium.Cesium3DTileset.fromUrl(tilesetUrl, {
      maximumScreenSpaceError: 16,
      skipLevelOfDetail: true
    });

    activeTileset = viewer.scene.primitives.add(tileset);
    await tileset.readyPromise;
    // Keep a chart-like readable 3D presentation without over-styling.
    tileset.style = new Cesium.Cesium3DTileStyle({
      color: `color('${rgbaStringToCesiumCss(SEMANTIC_AIRSPACE_PALETTE.controlledMajorFill, 0.42)}')`
    });

    const usedBounds = await deriveAndLoadBoundsFromArray(bounds);
    if (!usedBounds) await viewer.zoomTo(tileset);
    debugLog("tileset ready", {
      source: statusSource,
      usedBounds,
      geometricError: tileset.geometricError,
      hasRoot: Boolean(tileset.root)
    });

    setStatus(`Loaded 3D Tiles (${statusSource})`);
  } catch (err) {
    const msg = String(err?.message || err);
    debugError("tileset load failure", { message: msg });
    if (msg.includes("No local tileset.json found in selected files")) {
      setStatus("Selected folder is missing files referenced from visualization.index.json.");
      return;
    }
    setStatus(`Failed to load tileset: ${msg}`);
  }
}

loadBtn.addEventListener("click", () => {
  indexFileInput.value = "";
  indexFileInput.click();
});

indexFileInput.addEventListener("change", async (ev) => {
  const file = ev.target.files?.[0];
  if (!file) return;
  local3dFiles = new Map();
  localIndexFile = null;
  try {
    const parsed = JSON.parse(await file.text());
    const resolved = await resolveRemoteIndexUrlFromSelectedJson(parsed);
    if (!resolved) {
      setStatus("Cannot resolve the served dataset URL from this visualization.index.json. Regenerate the dataset with a servedVisualizationIndexUrl hint or open it with ?index=/data/<folder>/visualization.index.json.");
      return;
    }
    activeRemoteIndexUrl = resolved;
    setStatus(`Resolved dataset URL: ${resolved}`);
  } catch (err) {
    setStatus(`Invalid index file: ${err?.message || err}`);
    return;
  }
  void loadTileset();
});

if (params.get("index")) {
  void loadTileset();
} else {
  setStatus("Click Load and select visualization.index.json.");
}
