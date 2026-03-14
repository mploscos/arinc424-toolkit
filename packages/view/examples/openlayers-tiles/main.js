import Map from "https://esm.sh/ol@10.6.1/Map.js";
import View from "https://esm.sh/ol@10.6.1/View.js";
import TileLayer from "https://esm.sh/ol@10.6.1/layer/Tile.js";
import VectorTileLayer from "https://esm.sh/ol@10.6.1/layer/VectorTile.js";
import VectorLayer from "https://esm.sh/ol@10.6.1/layer/Vector.js";
import OSM from "https://esm.sh/ol@10.6.1/source/OSM.js";
import VectorTileSource from "https://esm.sh/ol@10.6.1/source/VectorTile.js";
import VectorSource from "https://esm.sh/ol@10.6.1/source/Vector.js";
import GeoJSON from "https://esm.sh/ol@10.6.1/format/GeoJSON.js";
import { createXYZ } from "https://esm.sh/ol@10.6.1/tilegrid.js";
import { Fill, Stroke, Style, Circle as CircleStyle, Text } from "https://esm.sh/ol@10.6.1/style.js";
import { transformExtent, fromLonLat } from "https://esm.sh/ol@10.6.1/proj.js";
import Feature from "https://esm.sh/ol@10.6.1/Feature.js";
import Polygon from "https://esm.sh/ol@10.6.1/geom/Polygon.js";
import Point from "https://esm.sh/ol@10.6.1/geom/Point.js";
import CircleGeom from "https://esm.sh/ol@10.6.1/geom/Circle.js";
import {
  load2DTilesIndex,
  isVisualizationIndex
} from "./visualization-index.js";
import {
  buildCartography,
  getDefaultLayerDescriptor
} from "./cartography.js";
import {
  getChartStyleToken,
  getLabelRule
} from "./cartography-style-system.js";
import {
  isAirspaceFeature,
  extractAirspaceInspection,
  renderAirspaceInspectionHtml
} from "./debug/airspace-inspector.js";
import {
  extractArcCenters,
  extractSegmentPoints,
  computeGeometryStats
} from "./debug/geometry-debug-overlay.js";

const params = new URLSearchParams(window.location.search);
const defaultIndexUrl = params.get("index") || "";
const labelsEnabled = params.get("labels") !== "0";
const labelsMinZoom = Number(params.get("labelsMinZoom") ?? 7);
const debugEnabled = params.get("debug") === "1";
const basemapMode = params.get("basemap") || "muted";

const statusEl = document.getElementById("status");
const indexUrlEl = document.getElementById("indexUrl");
const loadBtn = document.getElementById("load");
const pickIndexFileBtn = document.getElementById("pickIndexFile");
const indexFileInput = document.getElementById("indexFileInput");
const debugControlsEl = document.getElementById("debugControls");
const airspaceInspectorEl = document.getElementById("airspaceInspector");
const dbgInspectorEl = document.getElementById("dbgInspector");
const dbgArcCentersEl = document.getElementById("dbgArcCenters");
const dbgSegmentPointsEl = document.getElementById("dbgSegmentPoints");
const dbgTileGridEl = document.getElementById("dbgTileGrid");
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

indexUrlEl.value = defaultIndexUrl || "/artifacts/<dataset>/visualization.index.json";
const DEBUG_PREFIX = "[arinc-view:ol]";
const debugLog = (...args) => { if (debugEnabled) console.log(DEBUG_PREFIX, ...args); };
const debugWarn = (...args) => { if (debugEnabled) console.warn(DEBUG_PREFIX, ...args); };
const debugError = (...args) => { if (debugEnabled) console.error(DEBUG_PREFIX, ...args); };
if (debugEnabled && debugControlsEl) debugControlsEl.style.display = "block";
if (dbgTileGridEl) dbgTileGridEl.checked = true;
const debugUiState = {
  inspector: debugEnabled ? Boolean(dbgInspectorEl?.checked ?? true) : false,
  arcCenters: debugEnabled ? Boolean(dbgArcCentersEl?.checked ?? false) : false,
  segmentPoints: debugEnabled ? Boolean(dbgSegmentPointsEl?.checked ?? false) : false,
  tileGrid: debugEnabled ? Boolean(dbgTileGridEl?.checked ?? true) : false
};
const procedureUiState = {
  show: false,
  airport: "all",
  runway: "all",
  type: "all",
  selected: "all",
  catalog: []
};

const debugAirspaceBoundaryStyle = new Style({
  stroke: new Stroke({ color: "rgba(255, 20, 20, 0.95)", width: 2.2 }),
  zIndex: 130
});
const debugArcCenterStyle = new Style({
  image: new CircleStyle({
    radius: 4,
    fill: new Fill({ color: "rgba(255, 52, 52, 0.9)" }),
    stroke: new Stroke({ color: "#ffffff", width: 1.2 })
  }),
  zIndex: 920
});
const debugSegmentPointStyle = new Style({
  image: new CircleStyle({
    radius: 3,
    fill: new Fill({ color: "rgba(35, 35, 35, 0.9)" }),
    stroke: new Stroke({ color: "#ffffff", width: 1 })
  }),
  zIndex: 919
});
const issueErrorStyle = new Style({
  image: new CircleStyle({
    radius: 4.6,
    fill: new Fill({ color: "rgba(220, 30, 30, 0.92)" }),
    stroke: new Stroke({ color: "#ffffff", width: 1.4 })
  }),
  zIndex: 990
});
const issueWarningStyle = new Style({
  image: new CircleStyle({
    radius: 3.8,
    fill: new Fill({ color: "rgba(245, 147, 30, 0.92)" }),
    stroke: new Stroke({ color: "#ffffff", width: 1.2 })
  }),
  zIndex: 989
});

const fallbackStyle = new Style({
  stroke: new Stroke({ color: "#234f3f", width: 1.3 }),
  image: new CircleStyle({ radius: 3, fill: new Fill({ color: "#234f3f" }) }),
  zIndex: 1
});
const labelStyleCache = new Map();
const chartStyleCache = new Map();

const map = new Map({
  target: "map",
  layers: [
    new TileLayer({
      source: new OSM(),
      className: "basemap-layer",
      opacity: basemapMode === "muted" ? 0.94 : 1
    })
  ],
  view: new View({ center: [-8250000, 4950000], zoom: 6, minZoom: 2, maxZoom: 15 })
});
if (basemapMode === "muted") {
  map.getTargetElement()?.classList.add("basemap-muted");
}

let tileLayer = null;
let activeCartography = { layers: [], labelCandidates: [], bounds: null };
let activeLayerDescriptorMap = new Map();
let localTileFiles = new Map();
let localIndexFile = null;
let debugTileBoundaryLayer = null;
let debugTileCountLayer = null;
let debugTileBoundarySource = null;
let debugTileCountSource = null;
let debugArcCenterLayer = null;
let debugSegmentPointLayer = null;
let debugArcCenterSource = null;
let debugSegmentPointSource = null;
let issueLayer = null;
let issueSource = null;
let issueHighlightLayer = null;
let issueHighlightSource = null;
let issueFeaturesRaw = [];
let issueFilterSeverity = "all";
let issueFilterType = "all";
const debugTileBoundaryFeatures = new Map();
const debugTileCountFeatures = new Map();
const debugTileCountStyleCache = new Map();
const debugStats = {
  requests: 0,
  loads: 0,
  empty404: 0,
  emptyMissing: 0,
  failures: 0
};

function layerStyle(feature, resolution) {
  return styleByLayer(feature, resolution);
}

function setActiveCartography(cartography) {
  activeCartography = cartography ?? { layers: [], labelCandidates: [], bounds: null };
  activeLayerDescriptorMap = new Map(
    (activeCartography.layers ?? []).map((layer) => [String(layer.name || "").toLowerCase(), layer])
  );
}

function styleByLayer(feature, resolution) {
  const layer = String(feature.get("layer") || "").toLowerCase();
  const descriptor = activeLayerDescriptorMap.get(layer) || getDefaultLayerDescriptor(layer);

  const zoom = map.getView().getZoomForResolution(resolution);
  const isProcedure = isProcedureLayerName(layer);
  const procedureMeta = isProcedure ? deriveProcedureDisplayFromFeature(feature) : null;
  const procedureSelected = procedureMeta ? procedureIsSelected(procedureMeta) : false;
  if (isProcedure) {
    if (!procedureUiState.show && !procedureSelected) return null;
    if (!procedureMatchesFilters(procedureMeta) && !procedureSelected) return null;
  }
  const token = getChartStyleToken(feature, descriptor, zoom);
  if (!token) return null;
  const out = [];

  const styleKey = JSON.stringify({ ...token, procedureRenderMode: isProcedure ? (procedureSelected ? "selected" : "muted") : "default" });
  let chartStyles = chartStyleCache.get(styleKey);
  if (!chartStyles) {
    if (token.kind === "airspace") {
      chartStyles = [new Style({
        fill: new Fill({ color: token.fill }),
        stroke: new Stroke({ color: token.stroke, width: token.width, lineDash: token.lineDash || undefined }),
        zIndex: 10
      })];
    } else if (token.kind === "airway") {
      chartStyles = [];
      if (token.casing && token.casingWidth > 0) {
        chartStyles.push(new Style({
          stroke: new Stroke({ color: token.casing, width: token.casingWidth }),
          zIndex: 35
        }));
      }
      chartStyles.push(new Style({
        stroke: new Stroke({ color: token.stroke, width: token.width }),
        zIndex: 40
      }));
    } else if (token.kind === "airport") {
      chartStyles = [new Style({
        image: new CircleStyle({
          radius: token.radius,
          fill: new Fill({ color: token.fill }),
          stroke: new Stroke({ color: token.stroke, width: token.strokeWidth })
        }),
        zIndex: 90
      })];
    } else if (token.kind === "runway") {
      chartStyles = [new Style({
        stroke: new Stroke({ color: token.stroke, width: token.width }),
        zIndex: 80
      })];
    } else if (token.kind === "waypoint") {
      chartStyles = [new Style({
        image: new CircleStyle({
          radius: token.radius,
          fill: new Fill({ color: token.fill }),
          stroke: new Stroke({ color: token.stroke, width: token.strokeWidth })
        }),
        zIndex: 95
      })];
    } else if (token.kind === "procedure") {
      chartStyles = [new Style({
        stroke: new Stroke({
          color: procedureSelected ? "rgba(255, 0, 255, 0.96)" : "rgba(255, 0, 255, 0.2)",
          width: procedureSelected ? token.width : Math.max(1, token.width - 0.45),
          lineDash: token.lineDash || undefined
        }),
        image: token.pointRadius > 0 ? new CircleStyle({
          radius: procedureSelected ? token.pointRadius : Math.max(2, token.pointRadius - 0.5),
          fill: new Fill({ color: procedureSelected ? "rgba(255, 0, 255, 0.96)" : "rgba(255, 0, 255, 0.2)" }),
          stroke: new Stroke({ color: "#ffffff", width: 1.1 })
        }) : undefined,
        zIndex: 70
      })];
    } else {
      chartStyles = [fallbackStyle];
    }
    chartStyleCache.set(styleKey, chartStyles);
  }
  out.push(...chartStyles);

  if (descriptor.styleHint === "airspace" && debugEnabled) out.push(debugAirspaceBoundaryStyle);

  if (!labelsEnabled) return out;
  if (!descriptor?.label?.enabled) return out;
  if (isProcedure && !procedureSelected) return out;
  const labelRule = getLabelRule(feature, descriptor, zoom, labelsMinZoom);
  if (!labelRule.enabled) return out;
  const label = labelRule.text;
  const key = `${layer}|${label}|${labelRule.priority}`;
  let labelStyle = labelStyleCache.get(key);
  if (!labelStyle) {
    labelStyle = new Style({
      text: new Text({
        text: label,
        font: labelRule.priority >= 95 ? "600 12px 'Segoe UI', sans-serif" : "11px 'Segoe UI', sans-serif",
        fill: new Fill({ color: "#243129" }),
        stroke: new Stroke({ color: "rgba(255,255,255,0.92)", width: 2.6 }),
        overflow: true
      }),
      zIndex: 120 + Math.min(labelRule.priority, 120)
    });
    labelStyleCache.set(key, labelStyle);
  }
  out.push(labelStyle);
  return out;
}

function setStatus(text) {
  statusEl.textContent = text;
}

function isProcedureLayerName(layer) {
  const key = String(layer || "").toLowerCase();
  return key === "procedure" || key === "procedures";
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

function deriveProcedureDisplayFromFeature(feature) {
  return deriveProcedureDisplayFromProps({
    procedureId: feature.get("procedureId") ?? feature.get("id"),
    id: feature.get("id"),
    procedureType: feature.get("procedureType") ?? feature.get("routeType"),
    procedureName: feature.get("procedureName"),
    name: feature.get("name"),
    ident: feature.get("ident"),
    transitionId: feature.get("transitionId"),
    runwayId: feature.get("runwayId"),
    airportId: feature.get("airportId"),
    fixIdent: feature.get("fixIdent"),
    fixId: feature.get("fixId")
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

  const filtered = catalog.filter((item) => {
    if (procedureUiState.airport !== "all" && item.airport !== procedureUiState.airport) return false;
    if (procedureUiState.runway !== "all" && item.runway !== procedureUiState.runway) return false;
    if (procedureUiState.type !== "all" && item.category !== procedureUiState.type) return false;
    return true;
  });

  if (procSelectEl) {
    const current = procedureUiState.selected || "all";
    procSelectEl.innerHTML = "";
    const all = document.createElement("option");
    all.value = "all";
    all.textContent = "all";
    procSelectEl.appendChild(all);
    for (const item of filtered.sort((a, b) => a.displayLabel.localeCompare(b.displayLabel))) {
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
  if (tileLayer) tileLayer.changed();
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

function issueStyle(feature) {
  if (qaShowIssuesEl && !qaShowIssuesEl.checked) return null;
  const severity = String(feature.get("severity") || "warning").toLowerCase();
  const type = String(feature.get("type") || "").toLowerCase();
  if (issueFilterSeverity !== "all" && severity !== issueFilterSeverity) return null;
  if (issueFilterType !== "all" && type !== issueFilterType) return null;
  return severity === "error" ? issueErrorStyle : issueWarningStyle;
}

function ensureIssueLayer() {
  if (issueLayer) return;
  issueSource = new VectorSource();
  issueLayer = new VectorLayer({
    source: issueSource,
    style: issueStyle
  });
  map.addLayer(issueLayer);
}

function ensureIssueHighlightLayer() {
  if (issueHighlightLayer) return;
  issueHighlightSource = new VectorSource();
  issueHighlightLayer = new VectorLayer({
    source: issueHighlightSource,
    style: new Style({
      stroke: new Stroke({ color: "rgba(255, 214, 0, 0.95)", width: 3, lineDash: [8, 4] }),
      fill: new Fill({ color: "rgba(255, 214, 0, 0.09)" }),
      image: new CircleStyle({
        radius: 8,
        fill: new Fill({ color: "rgba(255, 214, 0, 0.5)" }),
        stroke: new Stroke({ color: "rgba(255,255,255,0.95)", width: 2 })
      }),
      zIndex: 995
    })
  });
  map.addLayer(issueHighlightLayer);
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

function renderIssueInspector(feature) {
  if (!issueInspectorEl) return;
  if (!feature) {
    issueInspectorEl.style.display = "none";
    issueInspectorEl.innerHTML = "";
    return;
  }
  issueInspectorEl.style.display = "block";
  issueInspectorEl.innerHTML = `
    <div><strong>Issue</strong></div>
    <div><strong>severity:</strong> ${String(feature.get("severity") || "n/a")}</div>
    <div><strong>type:</strong> ${String(feature.get("type") || "n/a")}</div>
    <div><strong>entity:</strong> ${String(feature.get("relatedEntityId") || "n/a")}</div>
    <div><strong>message:</strong> ${String(feature.get("message") || "n/a")}</div>
  `;
}

function highlightRelatedEntity(issueFeature) {
  ensureIssueHighlightLayer();
  issueHighlightSource.clear();
  if (!issueFeature) return;

  const bbox = issueFeature.get("bbox");
  const highlight = new Feature();
  if (Array.isArray(bbox) && bbox.length === 4 && bbox.every(Number.isFinite)) {
    const [minLon, minLat, maxLon, maxLat] = bbox;
    const ring = [[minLon, minLat], [maxLon, minLat], [maxLon, maxLat], [minLon, maxLat], [minLon, minLat]];
    const geom = new Polygon([ring]).transform("EPSG:4326", "EPSG:3857");
    highlight.setGeometry(geom);
    issueHighlightSource.addFeature(highlight);
    map.getView().fit(geom.getExtent(), { duration: 350, padding: [36, 36, 36, 36], maxZoom: 11 });
    return;
  }

  const geom = issueFeature.getGeometry();
  if (geom instanceof Point) {
    const center = geom.getCoordinates();
    const circle = new CircleGeom(center, 9000);
    highlight.setGeometry(circle);
    issueHighlightSource.addFeature(highlight);
    map.getView().fit(circle.getExtent(), { duration: 300, padding: [36, 36, 36, 36], maxZoom: 10 });
  }
}

function applyIssueFilters() {
  issueFilterSeverity = qaSeverityEl?.value || "all";
  issueFilterType = qaTypeEl?.value || "all";
  if (issueLayer) issueLayer.changed();
}

function renderInspectorFeature(feature) {
  if (!debugEnabled || !airspaceInspectorEl) return;
  if (!debugUiState.inspector) {
    airspaceInspectorEl.style.display = "none";
    return;
  }
  if (!feature || !isAirspaceFeature(feature)) {
    airspaceInspectorEl.style.display = "block";
    airspaceInspectorEl.innerHTML = "<em>Click an airspace polygon to inspect.</em>";
    return;
  }
  const info = extractAirspaceInspection(feature);
  const stats = computeGeometryStats(feature);
  airspaceInspectorEl.style.display = "block";
  airspaceInspectorEl.innerHTML = `
    <div><strong>Airspace Inspector</strong></div>
    ${renderAirspaceInspectionHtml(info)}
    <div><strong>Geometry stats:</strong>
      vertices=${stats.vertexCount},
      segments=${stats.segmentCount ?? "n/a"},
      arcCenters=${stats.arcCenterCount}
    </div>
  `;
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

function tileBoundsLonLat(x, y, z) {
  const n = 2 ** z;
  const lon1 = (x / n) * 360 - 180;
  const lon2 = ((x + 1) / n) * 360 - 180;
  const lat1 = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
  const lat2 = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 1)) / n))) * 180) / Math.PI;
  return [lon1, Math.min(lat1, lat2), lon2, Math.max(lat1, lat2)];
}

function tileCenterLonLat(x, y, z) {
  const n = 2 ** z;
  const lon = ((x + 0.5) / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 0.5) / n)));
  const lat = (latRad * 180) / Math.PI;
  return [lon, lat];
}

function ensureDebugLayers() {
  if (!debugEnabled) return;
  if (!debugTileBoundarySource) {
    debugTileBoundarySource = new VectorSource();
    debugTileBoundaryLayer = new VectorLayer({
      source: debugTileBoundarySource,
      style: new Style({
        stroke: new Stroke({ color: "rgba(220, 45, 45, 0.85)", width: 1.1, lineDash: [6, 4] }),
        fill: new Fill({ color: "rgba(220, 45, 45, 0.02)" }),
        zIndex: 900
      })
    });
    map.addLayer(debugTileBoundaryLayer);
  }
  if (!debugTileCountSource) {
    debugTileCountSource = new VectorSource();
    debugTileCountLayer = new VectorLayer({
      source: debugTileCountSource,
      style: (feature) => {
        const text = String(feature.get("label") || "");
        let style = debugTileCountStyleCache.get(text);
        if (!style) {
          style = new Style({
            text: new Text({
              text,
              font: "11px 'Segoe UI', sans-serif",
              fill: new Fill({ color: "#5d1111" }),
              stroke: new Stroke({ color: "#ffffff", width: 3 })
            }),
            zIndex: 901
          });
          debugTileCountStyleCache.set(text, style);
        }
        return style;
      }
    });
    map.addLayer(debugTileCountLayer);
  }
}

function ensureGeometryDebugLayers() {
  if (!debugEnabled) return;
  if (!debugArcCenterSource) {
    debugArcCenterSource = new VectorSource();
    debugArcCenterLayer = new VectorLayer({
      source: debugArcCenterSource,
      style: debugArcCenterStyle
    });
    map.addLayer(debugArcCenterLayer);
  }
  if (!debugSegmentPointSource) {
    debugSegmentPointSource = new VectorSource();
    debugSegmentPointLayer = new VectorLayer({
      source: debugSegmentPointSource,
      style: debugSegmentPointStyle
    });
    map.addLayer(debugSegmentPointLayer);
  }
  applyDebugVisibility();
}

function applyDebugVisibility() {
  if (!debugEnabled) return;
  if (debugTileBoundaryLayer) debugTileBoundaryLayer.setVisible(Boolean(debugUiState.tileGrid));
  if (debugTileCountLayer) debugTileCountLayer.setVisible(Boolean(debugUiState.tileGrid));
  if (debugArcCenterLayer) debugArcCenterLayer.setVisible(Boolean(debugUiState.arcCenters));
  if (debugSegmentPointLayer) debugSegmentPointLayer.setVisible(Boolean(debugUiState.segmentPoints));
  if (airspaceInspectorEl && !debugUiState.inspector) {
    airspaceInspectorEl.style.display = "none";
    airspaceInspectorEl.innerHTML = "";
  }
}

function clearGeometryDebugLayers() {
  if (!debugEnabled) return;
  ensureGeometryDebugLayers();
  debugArcCenterSource.clear();
  debugSegmentPointSource.clear();
}

function updateGeometryDebugOverlays(feature) {
  if (!debugEnabled) return;
  ensureGeometryDebugLayers();
  clearGeometryDebugLayers();

  if (!feature || !isAirspaceFeature(feature)) return;

  if (debugUiState.segmentPoints) {
    const segmentPoints = extractSegmentPoints(feature);
    for (const [lon, lat] of segmentPoints) {
      const f = new Feature({ geometry: new Point(fromLonLat([lon, lat])) });
      debugSegmentPointSource.addFeature(f);
    }
  }
  if (debugUiState.arcCenters) {
    const arcCenters = extractArcCenters(feature);
    for (const [lon, lat] of arcCenters) {
      const f = new Feature({ geometry: new Point(fromLonLat([lon, lat])) });
      debugArcCenterSource.addFeature(f);
    }
  }
}

function resetDebugLayers() {
  if (!debugEnabled) return;
  ensureDebugLayers();
  ensureGeometryDebugLayers();
  debugTileBoundarySource.clear();
  debugTileCountSource.clear();
  debugArcCenterSource.clear();
  debugSegmentPointSource.clear();
  debugTileBoundaryFeatures.clear();
  debugTileCountFeatures.clear();
  debugTileCountStyleCache.clear();
  debugStats.requests = 0;
  debugStats.loads = 0;
  debugStats.empty404 = 0;
  debugStats.emptyMissing = 0;
  debugStats.failures = 0;
  applyDebugVisibility();
}

function markDebugTileRequest(z, x, y) {
  if (!debugEnabled) return;
  ensureDebugLayers();
  const key = `${z}/${x}/${y}`;
  if (!debugTileBoundaryFeatures.has(key)) {
    const [minLon, minLat, maxLon, maxLat] = tileBoundsLonLat(x, y, z);
    const ring = [[minLon, minLat], [maxLon, minLat], [maxLon, maxLat], [minLon, maxLat], [minLon, minLat]];
    const geom = new Polygon([ring]).transform("EPSG:4326", "EPSG:3857");
    const feature = new Feature({ geometry: geom, key });
    debugTileBoundarySource.addFeature(feature);
    debugTileBoundaryFeatures.set(key, feature);
  }
  debugStats.requests += 1;
}

function markDebugTileCount(z, x, y, count) {
  if (!debugEnabled) return;
  ensureDebugLayers();
  const key = `${z}/${x}/${y}`;
  const label = `${key} (${count})`;
  const [lon, lat] = tileCenterLonLat(x, y, z);
  const geom = new Point(fromLonLat([lon, lat]));
  const existing = debugTileCountFeatures.get(key);
  if (existing) {
    existing.setGeometry(geom);
    existing.set("label", label);
  } else {
    const feature = new Feature({ geometry: geom, key, label });
    debugTileCountSource.addFeature(feature);
    debugTileCountFeatures.set(key, feature);
  }
}

function debugSummary(label) {
  if (!debugEnabled) return;
  debugLog("tile stats", {
    label,
    requests: debugStats.requests,
    loads: debugStats.loads,
    empty404: debugStats.empty404,
    emptyMissing: debugStats.emptyMissing,
    failures: debugStats.failures
  });
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

function issueFeatureCollectionToOl(geojson) {
  const format = new GeoJSON({ dataProjection: "EPSG:4326", featureProjection: "EPSG:3857" });
  return format.readFeatures(geojson, {
    dataProjection: "EPSG:4326",
    featureProjection: "EPSG:3857"
  });
}

async function tryLoadIssueGeoJsonRemote(baseIndexUrl, visualizationIndex = null) {
  const candidates = [];
  if (visualizationIndex?.outputs?.qa?.issues) {
    candidates.push(new URL(visualizationIndex.outputs.qa.issues, baseIndexUrl).toString());
  }
  candidates.push(new URL("./analysis/issues.geojson", baseIndexUrl).toString());

  for (const url of candidates) {
    try {
      const r = await fetch(url);
      if (r.status === 404) continue;
      if (!r.ok) continue;
      const json = await r.json();
      if (json?.type === "FeatureCollection") return { url, json };
    } catch {
      // keep trying
    }
  }
  return null;
}

async function tryLoadProcedureCatalogRemote(loaded, indexUrl) {
  const candidates = [];
  if (loaded?.visualizationIndexUrl) candidates.push(new URL("./features.json", loaded.visualizationIndexUrl).toString());
  if (loaded?.tilesIndexUrl) candidates.push(new URL("../features.json", loaded.tilesIndexUrl).toString());
  if (indexUrl) candidates.push(new URL("./features.json", indexUrl).toString());

  for (const url of candidates) {
    try {
      const r = await fetch(url);
      if (r.status === 404) continue;
      if (!r.ok) continue;
      const json = await r.json();
      if (!Array.isArray(json?.features)) continue;
      return {
        url,
        catalog: json.features
          .filter((feature) => isProcedureLayerName(feature.layer))
          .map((feature) => deriveProcedureDisplayFromProps(feature.properties ?? feature))
      };
    } catch {
      // continue
    }
  }
  return null;
}

async function tryLoadProcedureCatalogLocal() {
  const file = findLocalFile("features.json");
  if (!file) return null;
  try {
    const json = JSON.parse(await file.text());
    if (!Array.isArray(json?.features)) return null;
    return {
      name: file.name,
      catalog: json.features
        .filter((feature) => isProcedureLayerName(feature.layer))
        .map((feature) => deriveProcedureDisplayFromProps(feature.properties ?? feature))
    };
  } catch {
    return null;
  }
}

async function loadProcedureCatalogRemote(loaded, indexUrl) {
  const resolved = await tryLoadProcedureCatalogRemote(loaded, indexUrl);
  procedureUiState.catalog = resolved?.catalog ?? [];
  refreshProcedureControls();
  if (resolved) debugLog("procedure catalog loaded", { url: resolved.url, count: procedureUiState.catalog.length });
}

async function loadProcedureCatalogLocal() {
  const resolved = await tryLoadProcedureCatalogLocal();
  procedureUiState.catalog = resolved?.catalog ?? [];
  refreshProcedureControls();
  if (resolved) debugLog("procedure catalog loaded from local files", { name: resolved.name, count: procedureUiState.catalog.length });
}

async function tryLoadIssueGeoJsonLocal(visualizationIndex = null) {
  const refs = [];
  if (visualizationIndex?.outputs?.qa?.issues) refs.push(visualizationIndex.outputs.qa.issues);
  refs.push("./analysis/issues.geojson", "analysis/issues.geojson", "issues.geojson");

  for (const ref of refs) {
    const normalized = String(ref).replace(/^\.\/+/, "");
    const file = findLocalFile(normalized);
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
  ensureIssueLayer();
  const base = loaded.visualizationIndexUrl || loaded.tilesIndexUrl || indexUrl;
  const issueLoaded = await tryLoadIssueGeoJsonRemote(base, loaded.visualizationIndex);
  if (!issueLoaded) {
    issueFeaturesRaw = [];
    issueSource.clear();
    refreshIssueTypeOptions();
    updateIssueStats();
    debugLog("qa issues not found for remote dataset");
    return;
  }
  issueFeaturesRaw = issueLoaded.json.features ?? [];
  issueSource.clear();
  issueSource.addFeatures(issueFeatureCollectionToOl(issueLoaded.json));
  refreshIssueTypeOptions();
  updateIssueStats();
  applyIssueFilters();
  debugLog("qa issues loaded", { url: issueLoaded.url, issueCount: issueFeaturesRaw.length });
}

async function loadIssueLayerLocal(visualizationIndex = null) {
  ensureIssueLayer();
  const issueLoaded = await tryLoadIssueGeoJsonLocal(visualizationIndex);
  if (!issueLoaded) {
    issueFeaturesRaw = [];
    issueSource.clear();
    refreshIssueTypeOptions();
    updateIssueStats();
    debugLog("qa issues not found in local selection");
    return;
  }
  issueFeaturesRaw = issueLoaded.json.features ?? [];
  issueSource.clear();
  issueSource.addFeatures(issueFeatureCollectionToOl(issueLoaded.json));
  refreshIssueTypeOptions();
  updateIssueStats();
  applyIssueFilters();
  debugLog("qa issues loaded from local files", { name: issueLoaded.name, issueCount: issueFeaturesRaw.length });
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
      if (config.availableTilesSet && !config.availableTilesSet.has(`${z}/${x}/${xyzY}`)) {
        return "empty://tile";
      }
      if (config.remoteTemplate) {
        return renderTileUrl(z, x, xyzY);
      }
      return `local://${z}/${x}/${xyzY}.json`;
    },
    tileLoadFunction: (tile, url) => {
      tile.setLoader((_extent, _resolution, projection) => {
        const activeProjection = projection ?? "EPSG:3857";
        (async () => {
        const [z, x, y] = tile.getTileCoord();
        const xyzY = toXyzY(y);
        const maxIndex = (2 ** z) - 1;
        const requestUrl = config.remoteTemplate ? renderTileUrl(z, x, xyzY) : url;
        debugLog("tile request", { z, x, y: xyzY, url: requestUrl });
        markDebugTileRequest(z, x, xyzY);
        if (!Number.isFinite(xyzY) || xyzY < 0 || xyzY > maxIndex) {
          tile.setFeatures([]);
          debugStats.emptyMissing += 1;
          markDebugTileCount(z, x, xyzY, 0);
          return;
        }
        if (config.availableTilesSet && !config.availableTilesSet.has(`${z}/${x}/${xyzY}`)) {
          tile.setFeatures([]);
          debugStats.emptyMissing += 1;
          markDebugTileCount(z, x, xyzY, 0);
          return;
        }
        try {
          if (config.localMode) {
            const tilePath = `${z}/${x}/${xyzY}.json`;
            const file = findLocalFile(tilePath) || findLocalFile(`tiles/${tilePath}`);
            if (!file) {
              tile.setFeatures([]);
              debugStats.emptyMissing += 1;
              markDebugTileCount(z, x, xyzY, 0);
              return;
            }
            const json = JSON.parse(await file.text());
            const features = tileFormat.readFeatures(json, {
              dataProjection: "EPSG:4326",
              featureProjection: activeProjection
            });
            tile.setFeatures(features);
            debugStats.loads += 1;
            markDebugTileCount(z, x, xyzY, features.length);
            debugLog("tile loaded (local)", { z, x, y: xyzY, featureCount: features.length });
            return;
          }

          const candidateUrl = config.remoteTemplate ? renderTileUrl(z, x, xyzY) : url;
          const r = await fetch(candidateUrl);
          if (r.status === 404) {
            debugWarn("tile 404 treated as empty", { z, x, y: xyzY, url: candidateUrl });
            tile.setFeatures([]);
            debugStats.empty404 += 1;
            markDebugTileCount(z, x, xyzY, 0);
            return;
          }
          if (!r.ok) {
            throw new Error(`HTTP ${r.status} for tile ${z}/${x}/${xyzY}`);
          }
          const json = await r.json();
          const features = tileFormat.readFeatures(json, {
            dataProjection: "EPSG:4326",
            featureProjection: activeProjection
          });
          tile.setFeatures(features);
          debugStats.loads += 1;
          markDebugTileCount(z, x, xyzY, features.length);
          debugLog("tile loaded", { z, x, y: xyzY, url: candidateUrl, featureCount: features.length });
        } catch (err) {
          debugError("tile load failure", { z, x, y: xyzY, error: err?.message || String(err) });
          tile.setFeatures([]);
          debugStats.failures += 1;
          markDebugTileCount(z, x, xyzY, 0);
        }
        })();
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

function parseAvailableTilesSet(tilesIndex) {
  const list = tilesIndex?.availableTiles;
  if (!Array.isArray(list) || list.length === 0) return null;
  const set = new Set();
  for (const item of list) {
    if (typeof item !== "string") continue;
    const m = /^(\d+)\/(\d+)\/(\d+)$/.exec(item.trim());
    if (!m) continue;
    set.add(`${Number(m[1])}/${Number(m[2])}/${Number(m[3])}`);
  }
  return set.size > 0 ? set : null;
}

function parseAvailableTilesFromLocalFiles() {
  const set = new Set();
  for (const key of localTileFiles.keys()) {
    const m = /^(\d+)\/(\d+)\/(\d+)\.json$/.exec(key) || /^tiles\/(\d+)\/(\d+)\/(\d+)\.json$/.exec(key);
    if (!m) continue;
    set.add(`${Number(m[1])}/${Number(m[2])}/${Number(m[3])}`);
  }
  return set.size > 0 ? set : null;
}

function isGlobalLikeBounds(bounds) {
  if (!Array.isArray(bounds) || bounds.length !== 4) return false;
  const [minLon, minLat, maxLon, maxLat] = bounds;
  if (![minLon, minLat, maxLon, maxLat].every((n) => Number.isFinite(n))) return false;
  return (maxLon - minLon) > 300 || (maxLat - minLat) > 140;
}

function recenterToTile(z, x, y, minZoomHint) {
  const [lon, lat] = tileCenterLonLat(x, y, z);
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

async function findBootstrapTile(remoteTemplate, z, availableTilesSet = null) {
  if (availableTilesSet && availableTilesSet.size > 0) {
    const candidates = [...availableTilesSet]
      .map((k) => k.split("/").map(Number))
      .filter(([zz]) => zz === z)
      .sort((a, b) => a[1] - b[1] || a[2] - b[2]);
    if (candidates.length > 0) {
      const [zz, xx, yy] = candidates[0];
      debugLog("bootstrap tile from index availability", { z: zz, x: xx, y: yy });
      return { z: zz, x: xx, y: yy };
    }
  }
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
  const availableTilesSet = parseAvailableTilesSet(tilesIndex);
  const globalLike = isGlobalLikeBounds(tilesIndex.bounds);
  setActiveCartography(buildCartography(
    { features: [] },
    {
      layers: tilesIndex.layers,
      bounds: tilesIndex.bounds,
      minZoom: Number(tilesIndex.minZoom),
      maxZoom: Number(tilesIndex.maxZoom)
    }
  ));
  resetDebugLayers();
  debugLog("index loaded", {
    source: loaded.source,
    tilesIndexUrl,
    tileTemplate: tilesIndex.tileTemplate,
    resolvedTemplate: remoteTemplate,
    minZoom: tilesIndex.minZoom,
    maxZoom: tilesIndex.maxZoom,
    bounds: tilesIndex.bounds,
    availableTiles: availableTilesSet ? availableTilesSet.size : null,
    cartographyLayers: activeCartography.layers.length
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
    availableTilesSet,
    minZoom: tilesIndex.minZoom,
    maxZoom: tilesIndex.maxZoom,
    recenterOnFirstFeature: globalLike
  });
  map.addLayer(tileLayer);

  if (globalLike) {
    if (Number.isFinite(Number(tilesIndex.minZoom))) view.setZoom(Number(tilesIndex.minZoom));
    const t = await findBootstrapTile(remoteTemplate, Number(tilesIndex.minZoom) || 4, availableTilesSet);
    if (t) recenterToTile(t.z, t.x, t.y, Number(tilesIndex.minZoom));
  } else {
    fitBoundsIfPresent(tilesIndex.bounds, Number(tilesIndex.minZoom));
  }
  debugSummary("remote index loaded");
  await loadProcedureCatalogRemote(loaded, indexUrl);
  await loadIssueLayerRemote(loaded, indexUrl);
  setStatus(`Loaded 2D tiles index (${loaded.source}): ${tilesIndexUrl}`);
}

async function loadFromLocalSelection() {
  const loaded = await load2DTilesIndexFromLocalSelection();
  const { tilesIndex } = loaded;
  const availableTilesSet = parseAvailableTilesSet(tilesIndex) ?? parseAvailableTilesFromLocalFiles();
  const globalLike = isGlobalLikeBounds(tilesIndex.bounds);
  setActiveCartography(buildCartography(
    { features: [] },
    {
      layers: tilesIndex.layers,
      bounds: tilesIndex.bounds,
      minZoom: Number(tilesIndex.minZoom),
      maxZoom: Number(tilesIndex.maxZoom)
    }
  ));
  resetDebugLayers();
  debugLog("local index loaded", {
    minZoom: tilesIndex.minZoom,
    maxZoom: tilesIndex.maxZoom,
    tileTemplate: tilesIndex.tileTemplate,
    bounds: tilesIndex.bounds,
    availableTiles: availableTilesSet ? availableTilesSet.size : null,
    cartographyLayers: activeCartography.layers.length
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
    availableTilesSet,
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
  debugSummary("local index loaded");
  await loadProcedureCatalogLocal();
  await loadIssueLayerLocal(loaded.visualizationIndex);
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
    const msg = String(err?.message || err);
    if (msg.includes("Cannot find local 2D index file referenced by visualization index")) {
      setStatus("Index file selected without dataset folder context. Select the dataset folder that contains visualization.index.json.");
      return;
    }
    setStatus(`Failed to load index: ${msg}`);
  }
}

loadBtn.addEventListener("click", () => {
  void loadTiles();
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
    indexUrlEl.value = resolved;
    setStatus(`Resolved index URL: ${resolved}`);
  } catch (err) {
    setStatus(`Invalid index file: ${err?.message || err}`);
    return;
  }
  void loadTiles();
});

qaShowIssuesEl?.addEventListener("change", () => {
  if (issueLayer) issueLayer.changed();
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

map.on("singleclick", (evt) => {
  let issueFeature = null;
  map.forEachFeatureAtPixel(evt.pixel, (feature) => {
    if (feature.get("severity")) {
      issueFeature = feature;
      return true;
    }
    return false;
  });
  renderIssueInspector(issueFeature);
  highlightRelatedEntity(issueFeature);
});

if (debugEnabled) {
  renderInspectorFeature(null);

  dbgInspectorEl?.addEventListener("change", () => {
    debugUiState.inspector = Boolean(dbgInspectorEl.checked);
    applyDebugVisibility();
    if (debugUiState.inspector) renderInspectorFeature(null);
  });
  dbgArcCentersEl?.addEventListener("change", () => {
    debugUiState.arcCenters = Boolean(dbgArcCentersEl.checked);
    applyDebugVisibility();
    updateGeometryDebugOverlays(null);
  });
  dbgSegmentPointsEl?.addEventListener("change", () => {
    debugUiState.segmentPoints = Boolean(dbgSegmentPointsEl.checked);
    applyDebugVisibility();
    updateGeometryDebugOverlays(null);
  });
  dbgTileGridEl?.addEventListener("change", () => {
    debugUiState.tileGrid = Boolean(dbgTileGridEl.checked);
    applyDebugVisibility();
  });

  map.on("singleclick", (evt) => {
    if (!debugUiState.inspector && !debugUiState.arcCenters && !debugUiState.segmentPoints) return;
    let selected = null;
    map.forEachFeatureAtPixel(evt.pixel, (feature) => {
      if (isAirspaceFeature(feature)) {
        selected = feature;
        return true;
      }
      return false;
    });
    renderInspectorFeature(selected);
    updateGeometryDebugOverlays(selected);
  });
}

if (params.get("index")) {
  void loadTiles();
} else {
  setStatus("Select visualization.index.json or paste index URL, then click Load.");
}
