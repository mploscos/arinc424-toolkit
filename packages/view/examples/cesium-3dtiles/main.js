import {
  load3DTilesIndex,
  isVisualizationIndex,
  resolveRelativeAssetUrl
} from "./visualization-index.js";

const params = new URLSearchParams(window.location.search);
const defaultIndexUrl = params.get("index") || "/data/visualization.index.json";

const indexInput = document.getElementById("indexUrl");
const loadBtn = document.getElementById("load");
const statusEl = document.getElementById("status");
const pick3dDirBtn = document.getElementById("pick3dDir");
const pickIndexFileBtn = document.getElementById("pickIndexFile");
const threeDDirInput = document.getElementById("threeDDirInput");
const indexFileInput = document.getElementById("indexFileInput");

indexInput.value = defaultIndexUrl;

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
viewer.imageryLayers.addImageryProvider(new Cesium.OpenStreetMapImageryProvider({
  url: "https://tile.openstreetmap.org/"
}));

let activeTileset = null;
let local3dFiles = new Map();
let localIndexFile = null;
let localBlobUrls = [];
let rewrittenJsonByPath = new Map();

function setStatus(msg) {
  statusEl.textContent = msg;
}

function clearBlobUrls() {
  for (const u of localBlobUrls) URL.revokeObjectURL(u);
  localBlobUrls = [];
  rewrittenJsonByPath = new Map();
}

function makeBlobUrl(file) {
  const url = URL.createObjectURL(file);
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
  refObj[key] = makeBlobUrl(f);
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
  if (lonSpan > 300 || latSpan > 140) return false;
  const rect = Cesium.Rectangle.fromDegrees(minLon, minLat, maxLon, maxLat);
  await viewer.camera.flyTo({ destination: rect, duration: 1.1 });
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
                bounds: idx.bounds
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
            bounds: idx.bounds
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
    bounds: null
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

    if (hasLocal) {
      const resolved = await resolveLocalTilesetSelection();
      tilesetUrl = resolved.tilesetUrl;
      bounds = resolved.bounds;
      statusSource = "local selection";
    } else {
      const indexUrl = indexInput.value.trim();
      if (!indexUrl) {
        setStatus("Missing index URL (visualization.index.json or 3dtiles/index.json)");
        return;
      }

      const loaded = await load3DTilesIndex(indexUrl);
      const idx = loaded.threeDTilesIndex;
      tilesetUrl = resolveRelativeAssetUrl(loaded.threeDTilesIndexUrl, idx.tileset);
      bounds = idx.bounds;
      statusSource = loaded.threeDTilesIndexUrl;
    }

    setStatus(`Loading 3D Tiles from ${statusSource} ...`);
    const tileset = await Cesium.Cesium3DTileset.fromUrl(tilesetUrl, {
      maximumScreenSpaceError: 16,
      skipLevelOfDetail: true
    });

    activeTileset = viewer.scene.primitives.add(tileset);
    await tileset.readyPromise;

    const usedBounds = await deriveAndLoadBoundsFromArray(bounds);
    if (!usedBounds) await viewer.zoomTo(tileset);

    setStatus(`Loaded 3D Tiles (${statusSource})`);
  } catch (err) {
    setStatus(`Failed to load tileset: ${err?.message || err}`);
  }
}

loadBtn.addEventListener("click", () => {
  void loadTileset();
});

pick3dDirBtn.addEventListener("click", () => {
  threeDDirInput.value = "";
  threeDDirInput.click();
});

pickIndexFileBtn.addEventListener("click", () => {
  indexFileInput.value = "";
  indexFileInput.click();
});

threeDDirInput.addEventListener("change", (ev) => {
  const files = Array.from(ev.target.files || []);
  local3dFiles = new Map();
  localIndexFile = null;

  for (const f of files) {
    const rel = String(f.webkitRelativePath || f.name).replaceAll("\\\\", "/");
    const relNoRoot = rel.includes("/") ? rel.slice(rel.indexOf("/") + 1) : rel;
    local3dFiles.set(relNoRoot, f);
    local3dFiles.set(f.name, f);
    if (/visualization\.index\.json$/i.test(relNoRoot) || /(^|\/)3dtiles\/index\.json$/i.test(relNoRoot)) {
      localIndexFile = f;
    }
  }

  if (files.length === 0) {
    setStatus("No files found in selected folder");
    return;
  }

  setStatus(`Selected local 3dtiles folder with ${files.length} files.`);
  void loadTileset();
});

indexFileInput.addEventListener("change", (ev) => {
  const file = ev.target.files?.[0];
  if (!file) return;
  localIndexFile = file;
  setStatus(`Selected local index file: ${file.name}`);
  void loadTileset();
});

void loadTileset();
