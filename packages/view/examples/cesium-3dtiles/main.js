import {
  load3DTilesIndex,
  isVisualizationIndex,
  resolveRelativeAssetUrl
} from "./visualization-index.js";

const params = new URLSearchParams(window.location.search);
const defaultIndexUrl = params.get("index") || "";
const debugEnabled = params.get("debug") === "1";
const basemapMode = params.get("basemap") || "muted";

const indexInput = document.getElementById("indexUrl");
const loadBtn = document.getElementById("load");
const statusEl = document.getElementById("status");
const pickIndexFileBtn = document.getElementById("pickIndexFile");
const indexFileInput = document.getElementById("indexFileInput");
const qaShowIssuesEl = document.getElementById("qaShowIssues");
const qaSeverityEl = document.getElementById("qaSeverity");
const qaTypeEl = document.getElementById("qaType");
const qaStatsEl = document.getElementById("qaStats");
const issueInspectorEl = document.getElementById("issueInspector");
const procShowEl = document.getElementById("procShow");
const procAirportEl = document.getElementById("procAirport");
const procRunwayEl = document.getElementById("procRunway");
const procTypeEl = document.getElementById("procType");
const procSelectEl = document.getElementById("procSelect");

indexInput.value = defaultIndexUrl || "/artifacts/<dataset>/visualization.index.json";

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
let issueDataSource = null;
let issueEntities = [];
let issueFeaturesRaw = [];
let selectedIssueEntity = null;
let procedureDataSource = null;
let procedureEntities = [];
const procedureUiState = {
  show: false,
  airport: "all",
  runway: "all",
  type: "all",
  selected: "all",
  catalog: []
};
const DEBUG_PREFIX = "[arinc-view:cesium]";
const debugLog = (...args) => { if (debugEnabled) console.log(DEBUG_PREFIX, ...args); };
const debugWarn = (...args) => { if (debugEnabled) console.warn(DEBUG_PREFIX, ...args); };
const debugError = (...args) => { if (debugEnabled) console.error(DEBUG_PREFIX, ...args); };

function setStatus(msg) {
  statusEl.textContent = msg;
}

function isProcedureFeature(feature) {
  const layer = String(feature?.layer || feature?.properties?.layer || "").toLowerCase();
  return layer === "procedure" || layer === "procedures";
}

function parseProcedureIdParts(rawId) {
  const text = String(rawId ?? "").trim();
  if (!text) return {};
  const parts = text.split(":");
  if (parts[0] !== "procedure") return {};
  return {
    routeType: parts[1] ?? null,
    airportIdent: parts[3] ?? null,
    ident: parts[4] ?? null,
    runwayToken: parts[6] ?? null
  };
}

function normalizeProcedureCategory(rawType) {
  const raw = String(rawType ?? "").trim().toUpperCase();
  if (["APPROACH", "APP", "IAP", "PA", "PF", "PI"].includes(raw)) return "APPROACH";
  if (["SID", "PD", "PE"].includes(raw)) return "SID";
  if (["STAR", "STARS", "PS"].includes(raw)) return "STAR";
  return raw || "PROCEDURE";
}

function procedureKindFromProps(props = {}) {
  const raw = normalizeProcedureCategory(props.procedureType ?? props.routeType ?? props.type);
  if (raw === "APPROACH") return "approach";
  if (raw === "SID") return "sid";
  if (raw === "STAR") return "star";
  return "procedure";
}

function deriveProcedureDisplayFromProps(props = {}) {
  const parsed = parseProcedureIdParts(props.procedureId ?? props.id);
  const category = normalizeProcedureCategory(props.procedureType ?? props.routeType ?? parsed.routeType);
  const ident = String(props.procedureName ?? props.name ?? props.ident ?? parsed.ident ?? "").trim();
  const runwayRaw = String(props.runway ?? props.runwayName ?? props.runwayId ?? parsed.runwayToken ?? "").trim();
  const runway = runwayRaw.replace(/^runway:/i, "");
  const transition = String(props.transition ?? props.transitionId ?? "").trim();
  const airportRaw = String(props.airportIdent ?? props.airportId ?? parsed.airportIdent ?? "").trim();
  const airport = airportRaw.replace(/^airport:[A-Z0-9]+:/i, "");
  const parts = [];
  if (ident) parts.push(ident);
  if (runway) parts.push(runway);
  if (transition && transition !== runway) parts.push(transition);
  return {
    key: String(props.procedureId ?? props.id ?? ident ?? transition ?? runway ?? category),
    category,
    ident: ident || null,
    airport: airport || null,
    runway: runway || null,
    transition: transition || null,
    displayLabel: parts.join(" ") || ident || transition || runway || `${category} procedure`
  };
}

function procedureMetaFromEntity(entity) {
  const props = entity?.properties ?? {};
  return deriveProcedureDisplayFromProps({
    procedureId: props.procedureId?.getValue?.() ?? props.procedureId ?? props.id?.getValue?.() ?? props.id,
    id: props.id?.getValue?.() ?? props.id,
    procedureType: props.procedureType?.getValue?.() ?? props.procedureType ?? props.routeType?.getValue?.() ?? props.routeType,
    procedureName: props.procedureName?.getValue?.() ?? props.procedureName,
    name: props.name?.getValue?.() ?? props.name,
    ident: props.ident?.getValue?.() ?? props.ident,
    transitionId: props.transitionId?.getValue?.() ?? props.transitionId,
    runwayId: props.runwayId?.getValue?.() ?? props.runwayId,
    airportId: props.airportId?.getValue?.() ?? props.airportId
  });
}

function procedureMatchesFilters(meta) {
  if (procedureUiState.airport !== "all" && meta.airport !== procedureUiState.airport) return false;
  if (procedureUiState.runway !== "all" && meta.runway !== procedureUiState.runway) return false;
  if (procedureUiState.type !== "all" && meta.category !== procedureUiState.type) return false;
  return true;
}

function procedureIsSelected(meta) {
  return procedureUiState.selected !== "all" && meta.key === procedureUiState.selected;
}

function setSelectOptions(selectEl, values, currentValue = "all", formatter = (value) => value) {
  if (!selectEl) return;
  selectEl.innerHTML = "";
  const all = document.createElement("option");
  all.value = "all";
  all.textContent = "all";
  selectEl.appendChild(all);
  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = formatter(value);
    selectEl.appendChild(option);
  }
  selectEl.value = values.includes(currentValue) || currentValue === "all" ? currentValue : "all";
}

function refreshProcedureControls() {
  const catalog = procedureUiState.catalog.slice();
  setSelectOptions(procAirportEl, [...new Set(catalog.map((item) => item.airport).filter(Boolean))].sort((a, b) => a.localeCompare(b)), procedureUiState.airport);
  setSelectOptions(procRunwayEl, [...new Set(catalog.map((item) => item.runway).filter(Boolean))].sort((a, b) => a.localeCompare(b)), procedureUiState.runway);
  if (procSelectEl) {
    const current = procedureUiState.selected || "all";
    const filtered = catalog
      .filter((item) => {
        if (procedureUiState.airport !== "all" && item.airport !== procedureUiState.airport) return false;
        if (procedureUiState.runway !== "all" && item.runway !== procedureUiState.runway) return false;
        if (procedureUiState.type !== "all" && item.category !== procedureUiState.type) return false;
        return true;
      })
      .sort((a, b) => a.displayLabel.localeCompare(b.displayLabel));
    procSelectEl.innerHTML = "";
    const all = document.createElement("option");
    all.value = "all";
    all.textContent = "all";
    procSelectEl.appendChild(all);
    for (const item of filtered) {
      const option = document.createElement("option");
      option.value = item.key;
      option.textContent = item.displayLabel;
      procSelectEl.appendChild(option);
    }
    procSelectEl.value = filtered.some((item) => item.key === current) || current === "all" ? current : "all";
    if (procSelectEl.value !== current) procedureUiState.selected = procSelectEl.value;
  }
}

function refreshProcedureRendering() {
  procedureUiState.show = Boolean(procShowEl?.checked);
  procedureUiState.airport = procAirportEl?.value || "all";
  procedureUiState.runway = procRunwayEl?.value || "all";
  procedureUiState.type = procTypeEl?.value || "all";
  procedureUiState.selected = procSelectEl?.value || "all";
  refreshProcedureControls();
  styleProcedureEntities();
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

function renderIssueInspector(featureLike) {
  if (!issueInspectorEl) return;
  if (!featureLike) {
    issueInspectorEl.style.display = "none";
    issueInspectorEl.innerHTML = "";
    return;
  }
  const severity = String(featureLike.severity || "n/a");
  const type = String(featureLike.type || "n/a");
  const entity = String(featureLike.relatedEntityId || "n/a");
  const message = String(featureLike.message || "n/a");
  issueInspectorEl.style.display = "block";
  issueInspectorEl.innerHTML = `
    <div><strong>Issue</strong></div>
    <div><strong>severity:</strong> ${severity}</div>
    <div><strong>type:</strong> ${type}</div>
    <div><strong>entity:</strong> ${entity}</div>
    <div><strong>message:</strong> ${message}</div>
  `;
}

function updateIssueStats() {
  if (!qaStatsEl) return;
  const total = issueFeaturesRaw.length;
  const errors = issueFeaturesRaw.filter((f) => String(f.properties?.severity || "").toLowerCase() === "error").length;
  const warnings = issueFeaturesRaw.filter((f) => String(f.properties?.severity || "").toLowerCase() === "warning").length;
  qaStatsEl.textContent = `issues: ${total} | errors: ${errors} | warnings: ${warnings}`;
}

function refreshIssueTypeOptions() {
  if (!qaTypeEl) return;
  const types = [...new Set(issueFeaturesRaw.map((f) => String(f.properties?.type || "").toLowerCase()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
  const current = qaTypeEl.value || "all";
  qaTypeEl.innerHTML = "";
  const optAll = document.createElement("option");
  optAll.value = "all";
  optAll.textContent = "all";
  qaTypeEl.appendChild(optAll);
  for (const t of types) {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t;
    qaTypeEl.appendChild(opt);
  }
  qaTypeEl.value = types.includes(current) || current === "all" ? current : "all";
}

function entityIssueProps(entity) {
  const p = entity?.properties;
  if (!p) return null;
  const severity = p.severity?.getValue?.() ?? p.severity;
  const type = p.type?.getValue?.() ?? p.type;
  const message = p.message?.getValue?.() ?? p.message;
  const relatedEntityId = p.relatedEntityId?.getValue?.() ?? p.relatedEntityId;
  if (!severity && !type && !message) return null;
  return {
    severity: String(severity ?? "warning").toLowerCase(),
    type: String(type ?? "").toLowerCase(),
    message: String(message ?? ""),
    relatedEntityId: relatedEntityId ? String(relatedEntityId) : null,
    bbox: p.bbox?.getValue?.() ?? p.bbox ?? null
  };
}

function parseBbox(value) {
  if (Array.isArray(value) && value.length === 4 && value.every(Number.isFinite)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed) && parsed.length === 4 && parsed.every(Number.isFinite)) return parsed;
    } catch {
      return null;
    }
  }
  return null;
}

function applyIssueFilters() {
  const show = qaShowIssuesEl ? Boolean(qaShowIssuesEl.checked) : true;
  const severityFilter = qaSeverityEl?.value || "all";
  const typeFilter = qaTypeEl?.value || "all";
  for (const entity of issueEntities) {
    const props = entityIssueProps(entity);
    if (!props) {
      entity.show = false;
      continue;
    }
    const severityOk = severityFilter === "all" || props.severity === severityFilter;
    const typeOk = typeFilter === "all" || props.type === typeFilter;
    entity.show = show && severityOk && typeOk;
  }
}

async function clearIssueDataSource() {
  if (issueDataSource) {
    await viewer.dataSources.remove(issueDataSource, true);
    issueDataSource = null;
  }
  issueEntities = [];
  issueFeaturesRaw = [];
  selectedIssueEntity = null;
  updateIssueStats();
  refreshIssueTypeOptions();
  renderIssueInspector(null);
}

async function clearProcedureDataSource() {
  if (procedureDataSource) {
    await viewer.dataSources.remove(procedureDataSource, true);
    procedureDataSource = null;
  }
  procedureEntities = [];
}

function styleProcedureEntities() {
  for (const entity of procedureEntities) {
    const meta = procedureMetaFromEntity(entity);
    const kind = procedureKindFromProps({ procedureType: meta.category });
    const selected = procedureIsSelected(meta);
    const visible = procedureUiState.show && procedureMatchesFilters(meta);
    const shouldShow = selected || visible;
    entity.show = shouldShow;
    if (entity.polyline) {
      entity.polyline.material = Cesium.Color.fromCssColorString("#ff00ff").withAlpha(selected ? 0.94 : 0.22);
      entity.polyline.width = selected
        ? (kind === "approach" ? 3.2 : (kind === "star" ? 2 : 2.5))
        : (kind === "approach" ? 2.2 : (kind === "star" ? 1.3 : 1.6));
      entity.polyline.clampToGround = true;
    }
    if (entity.point) {
      entity.point.pixelSize = selected ? 5 : 3;
      entity.point.color = Cesium.Color.fromCssColorString("#ff00ff").withAlpha(selected ? 0.92 : 0.2);
      entity.point.outlineColor = Cesium.Color.WHITE;
      entity.point.outlineWidth = 1;
      entity.point.disableDepthTestDistance = Number.POSITIVE_INFINITY;
    }
  }
}

async function applyProcedureGeoJson(geojson, meta = {}) {
  await clearProcedureDataSource();
  const proceduresOnly = {
    type: "FeatureCollection",
    features: (geojson?.features ?? []).filter(isProcedureFeature)
  };
  procedureUiState.catalog = proceduresOnly.features.map((feature) => deriveProcedureDisplayFromProps(feature.properties ?? feature));
  refreshProcedureControls();
  if (proceduresOnly.features.length === 0) {
    debugLog("procedure overlay empty", meta);
    return;
  }
  procedureDataSource = await Cesium.GeoJsonDataSource.load(proceduresOnly, { clampToGround: true });
  viewer.dataSources.add(procedureDataSource);
  procedureEntities = procedureDataSource.entities.values.slice();
  styleProcedureEntities();
  debugLog("procedure overlay loaded", { ...meta, featureCount: proceduresOnly.features.length });
}

function styleIssueEntities() {
  for (const entity of issueEntities) {
    const props = entityIssueProps(entity);
    if (!props) continue;
    const isError = props.severity === "error";
    entity.billboard = undefined;
    entity.point = new Cesium.PointGraphics({
      pixelSize: isError ? 8 : 6,
      color: isError ? Cesium.Color.fromCssColorString("#d11d1d") : Cesium.Color.fromCssColorString("#f5931e"),
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: isError ? 1.5 : 1.1,
      disableDepthTestDistance: Number.POSITIVE_INFINITY
    });
  }
}

function highlightSelectedIssueEntity(entity) {
  if (selectedIssueEntity?.point) {
    const prev = entityIssueProps(selectedIssueEntity);
    const prevError = prev?.severity === "error";
    selectedIssueEntity.point.pixelSize = prevError ? 12 : 9;
    selectedIssueEntity.point.outlineColor = Cesium.Color.WHITE;
    selectedIssueEntity.point.outlineWidth = prevError ? 2 : 1.5;
  }
  selectedIssueEntity = entity ?? null;
  if (selectedIssueEntity?.point) {
    selectedIssueEntity.point.pixelSize = 11;
    selectedIssueEntity.point.outlineColor = Cesium.Color.fromCssColorString("#ffea61");
    selectedIssueEntity.point.outlineWidth = 2.4;
  }
}

async function zoomToIssueEntity(entity) {
  const props = entityIssueProps(entity);
  if (!props) return;
  const bbox = parseBbox(props.bbox);
  if (bbox) {
    const [minLon, minLat, maxLon, maxLat] = bbox;
    await viewer.camera.flyTo({
      destination: Cesium.Rectangle.fromDegrees(minLon, minLat, maxLon, maxLat),
      duration: 0.9
    });
    return;
  }
  const position = entity?.position?.getValue?.(Cesium.JulianDate.now());
  if (position) {
    await viewer.flyTo(entity, { duration: 0.9 });
  }
}

async function applyIssueGeoJson(geojson, meta = {}) {
  await clearIssueDataSource();
  issueFeaturesRaw = Array.isArray(geojson?.features) ? geojson.features : [];
  if (issueFeaturesRaw.length === 0) {
    updateIssueStats();
    refreshIssueTypeOptions();
    debugLog("qa issues empty", meta);
    return;
  }
  issueDataSource = await Cesium.GeoJsonDataSource.load(geojson, { clampToGround: true });
  viewer.dataSources.add(issueDataSource);
  issueEntities = issueDataSource.entities.values.slice();
  styleIssueEntities();
  refreshIssueTypeOptions();
  updateIssueStats();
  applyIssueFilters();
  debugLog("qa issues loaded", { ...meta, issueCount: issueFeaturesRaw.length });
}

function dedupe(arr) {
  return [...new Set(arr.filter((v) => typeof v === "string" && v.length > 0))];
}

async function tryLoadIssueGeoJsonRemote(loaded, indexUrl) {
  const candidates = [];
  if (loaded?.visualizationIndex?.outputs?.qa?.issues && loaded?.visualizationIndexUrl) {
    candidates.push(resolveRelativeAssetUrl(loaded.visualizationIndexUrl, loaded.visualizationIndex.outputs.qa.issues));
  }
  if (loaded?.visualizationIndexUrl) {
    candidates.push(resolveRelativeAssetUrl(loaded.visualizationIndexUrl, "./analysis/issues.geojson"));
  }
  if (loaded?.threeDTilesIndexUrl) {
    candidates.push(resolveRelativeAssetUrl(loaded.threeDTilesIndexUrl, "../analysis/issues.geojson"));
    candidates.push(resolveRelativeAssetUrl(loaded.threeDTilesIndexUrl, "./analysis/issues.geojson"));
  }
  if (indexUrl) candidates.push(resolveRelativeAssetUrl(indexUrl, "./analysis/issues.geojson"));

  for (const url of dedupe(candidates)) {
    try {
      const r = await fetch(url);
      if (r.status === 404) {
        debugLog("qa issue fetch 404 (treated as absent)", { url });
        continue;
      }
      if (!r.ok) continue;
      const json = await r.json();
      if (json?.type === "FeatureCollection") return { url, json };
    } catch {
      // continue
    }
  }
  return null;
}

async function tryLoadProcedureFeaturesRemote(loaded, indexUrl) {
  const candidates = [];
  if (loaded?.visualizationIndexUrl) {
    candidates.push(resolveRelativeAssetUrl(loaded.visualizationIndexUrl, "./features.json"));
  }
  if (loaded?.threeDTilesIndexUrl) {
    candidates.push(resolveRelativeAssetUrl(loaded.threeDTilesIndexUrl, "../features.json"));
  }
  if (indexUrl) candidates.push(resolveRelativeAssetUrl(indexUrl, "./features.json"));

  for (const url of dedupe(candidates)) {
    try {
      const r = await fetch(url);
      if (r.status === 404) {
        debugLog("procedure feature fetch 404 (treated as absent)", { url });
        continue;
      }
      if (!r.ok) continue;
      const json = await r.json();
      if (Array.isArray(json?.features)) return { url, json };
    } catch {
      // continue
    }
  }
  return null;
}

async function loadProcedureLayerRemote(loaded, indexUrl) {
  const procedureLoaded = await tryLoadProcedureFeaturesRemote(loaded, indexUrl);
  if (!procedureLoaded) {
    await clearProcedureDataSource();
    debugLog("procedure overlay not found for remote dataset");
    return;
  }
  await applyProcedureGeoJson(procedureLoaded.json, { url: procedureLoaded.url, mode: "remote" });
}

async function tryLoadIssueGeoJsonLocal(visualizationIndex = null) {
  const refs = [];
  if (visualizationIndex?.outputs?.qa?.issues) refs.push(visualizationIndex.outputs.qa.issues);
  refs.push("./analysis/issues.geojson", "analysis/issues.geojson", "issues.geojson");
  for (const ref of refs) {
    const normalized = String(ref).replace(/^\.\/+/, "");
    const file = findLocal3dFile(normalized);
    if (!file) continue;
    try {
      const json = JSON.parse(await file.text());
      if (json?.type === "FeatureCollection") return { name: file.name, json };
    } catch {
      // continue
    }
  }
  return null;
}

async function loadIssueLayerRemote(loaded, indexUrl) {
  const issueLoaded = await tryLoadIssueGeoJsonRemote(loaded, indexUrl);
  if (!issueLoaded) {
    await clearIssueDataSource();
    debugLog("qa issues not found for remote dataset");
    return;
  }
  await applyIssueGeoJson(issueLoaded.json, { url: issueLoaded.url, mode: "remote" });
}

async function loadIssueLayerLocal(visualizationIndex = null) {
  const issueLoaded = await tryLoadIssueGeoJsonLocal(visualizationIndex);
  if (!issueLoaded) {
    await clearIssueDataSource();
    debugLog("qa issues not found in local selection");
    return;
  }
  await applyIssueGeoJson(issueLoaded.json, { name: issueLoaded.name, mode: "local" });
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
      const indexUrl = indexInput.value.trim();
      if (!indexUrl) {
        setStatus("Missing index URL (visualization.index.json or 3dtiles/index.json)");
        return;
      }

      remoteLoaded = await load3DTilesIndex(indexUrl);
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
      color: "color('rgba(71,136,209,0.62)')"
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

    if (hasLocal) {
      await loadIssueLayerLocal(localSelection?.visualizationIndex ?? null);
      await clearProcedureDataSource();
    } else if (remoteLoaded) {
      const indexUrl = indexInput.value.trim();
      await loadProcedureLayerRemote(remoteLoaded, indexUrl);
      await loadIssueLayerRemote(remoteLoaded, indexUrl);
    }
  } catch (err) {
    const msg = String(err?.message || err);
    debugError("tileset load failure", { message: msg });
    if (msg.includes("No local tileset.json found in selected files")) {
      setStatus("Index file selected without dataset folder context. Select the dataset folder that contains visualization.index.json.");
      return;
    }
    setStatus(`Failed to load tileset: ${msg}`);
  }
}

loadBtn.addEventListener("click", () => {
  void loadTileset();
});

pickIndexFileBtn.addEventListener("click", () => {
  indexFileInput.value = "";
  indexFileInput.click();
});

indexFileInput.addEventListener("change", async (ev) => {
  const file = ev.target.files?.[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const resolved = await resolveRemoteIndexUrlFromSelectedJson(parsed);
    if (!resolved) {
      setStatus("Cannot resolve served dataset URL from selected file. Use index URL manually (e.g. /artifacts/<dataset>/visualization.index.json).");
      return;
    }
    indexInput.value = resolved;
    setStatus(`Resolved index URL: ${resolved}`);
  } catch (err) {
    setStatus(`Invalid index file: ${err?.message || err}`);
    return;
  }
  void loadTileset();
});

qaShowIssuesEl?.addEventListener("change", () => {
  applyIssueFilters();
});
procShowEl?.addEventListener("change", () => {
  refreshProcedureRendering();
});
procAirportEl?.addEventListener("change", () => {
  refreshProcedureRendering();
});
procRunwayEl?.addEventListener("change", () => {
  refreshProcedureRendering();
});
procTypeEl?.addEventListener("change", () => {
  refreshProcedureRendering();
});
procSelectEl?.addEventListener("change", () => {
  refreshProcedureRendering();
});
qaSeverityEl?.addEventListener("change", () => {
  applyIssueFilters();
});
qaTypeEl?.addEventListener("change", () => {
  applyIssueFilters();
});

viewer.selectedEntityChanged.addEventListener((entity) => {
  const props = entityIssueProps(entity);
  renderIssueInspector(props);
  highlightSelectedIssueEntity(props ? entity : null);
  if (props) {
    void zoomToIssueEntity(entity);
  }
});

if (params.get("index")) {
  void loadTileset();
} else {
  setStatus("Select visualization.index.json or paste index URL, then click Load.");
}
