import OlMap from "https://esm.sh/ol@10.6.1/Map.js";
import View from "https://esm.sh/ol@10.6.1/View.js";
import TileLayer from "https://esm.sh/ol@10.6.1/layer/Tile.js";
import VectorTileLayer from "https://esm.sh/ol@10.6.1/layer/VectorTile.js";
import VectorLayer from "https://esm.sh/ol@10.6.1/layer/Vector.js";
import OSM from "https://esm.sh/ol@10.6.1/source/OSM.js";
import VectorTileSource from "https://esm.sh/ol@10.6.1/source/VectorTile.js";
import VectorSource from "https://esm.sh/ol@10.6.1/source/Vector.js";
import GeoJSON from "https://esm.sh/ol@10.6.1/format/GeoJSON.js";
import { createXYZ } from "https://esm.sh/ol@10.6.1/tilegrid.js";
import { Fill, Stroke, Style, Circle as CircleStyle, RegularShape, Text, Icon } from "https://esm.sh/ol@10.6.1/style.js";
import { transformExtent, fromLonLat } from "https://esm.sh/ol@10.6.1/proj.js";
import Feature from "https://esm.sh/ol@10.6.1/Feature.js";
import Polygon from "https://esm.sh/ol@10.6.1/geom/Polygon.js";
import Point from "https://esm.sh/ol@10.6.1/geom/Point.js";
import { buildProcedureEditorialFeatureCollectionFromProcedureLegs } from "./procedure-leg-to-openlayers-editorial-features.js";
import {
  load2DTilesIndex,
  isVisualizationIndex,
  resolveRelativeAssetUrl
} from "./visualization-index.js";
import {
  buildCartography,
  getDefaultLayerDescriptor
} from "./cartography.js";
import {
  getChartStyleToken,
  getLabelRule
} from "./cartography-style-system.js";
import { CHART_MODE_TERMINAL } from "./chart-modes.js";
import { isFeatureVisibleInChartMode } from "./chart-visibility-rules.js";
import { getLabelRuleForChartMode } from "./chart-label-rules.js";
import { createProcedureFocusContext } from "./procedure-focus-rules.js";
import {
  getFeatureBBox,
  expandBBox,
  buildAirportFocusBBox,
  buildProcedureFocusBBox,
  mergeBBoxes
} from "./spatial-helpers.js";
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
let activeRemoteIndexUrl = defaultIndexUrl.trim();

const statusEl = document.getElementById("status");
const loadBtn = document.getElementById("load");
const indexFileInput = document.getElementById("indexFileInput");
const debugControlsEl = document.getElementById("debugControls");
const airspaceInspectorEl = document.getElementById("airspaceInspector");
const dbgInspectorEl = document.getElementById("dbgInspector");
const dbgArcCentersEl = document.getElementById("dbgArcCenters");
const dbgSegmentPointsEl = document.getElementById("dbgSegmentPoints");
const dbgTileGridEl = document.getElementById("dbgTileGrid");
const dbgProcFocusEl = document.getElementById("dbgProcFocus");
const dbgAirspaceColorsEl = document.getElementById("dbgAirspaceColors");
const debugLegendEl = document.getElementById("debugLegend");
const dbgSpatialFocusEl = document.getElementById("dbgSpatialFocus");
const procAirportEl = document.getElementById("procAirport");
const procTypeEl = document.getElementById("procType");
const procSelectEl = document.getElementById("procSelect");
const procLayerStatusEl = document.getElementById("procLayerStatus");
const chartModeStatusEl = document.getElementById("chartModeStatus");
const chartFocusStatusEl = document.getElementById("chartFocusStatus");
const zoomDebugStatusEl = document.getElementById("zoomDebugStatus");
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
  tileGrid: debugEnabled ? Boolean(dbgTileGridEl?.checked ?? true) : false,
  procedureFocus: debugEnabled ? Boolean(dbgProcFocusEl?.checked ?? false) : false,
  airspaceColors: debugEnabled ? Boolean(dbgAirspaceColorsEl?.checked ?? false) : false,
  spatialFocus: debugEnabled ? Boolean(dbgSpatialFocusEl?.checked ?? false) : false
};
const procedureUiState = {
  airport: "all",
  type: "all",
  selected: "all",
  catalog: [],
  normalLayerLoaded: false,
  legDataLoaded: false
};
const chartModeState = {
  mode: CHART_MODE_TERMINAL
};
const observedAirportBounds = new Map();
const observedAirportRunwayBounds = new Map();
const observedProcedureBounds = new Map();
let procedureFocusContext = createProcedureFocusContext([], "all", deriveProcedureDisplayFromProps);
let chartSpatialContext = {
  terminalFocusBBox: null,
  terminalContextBBox: null,
  procedureFocusBBox: null,
  procedureContextBBox: null
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
const debugAirspacePalette = {
  "class-a": { fill: "rgba(34, 74, 135, 0.12)", stroke: "rgba(34, 74, 135, 0.98)" },
  "class-b": { fill: "rgba(0, 188, 212, 0.12)", stroke: "rgba(0, 188, 212, 0.98)" },
  "class-c": { fill: "rgba(62, 154, 84, 0.12)", stroke: "rgba(62, 154, 84, 0.98)" },
  "class-d": { fill: "rgba(235, 134, 24, 0.12)", stroke: "rgba(235, 134, 24, 0.98)" },
  "class-e": { fill: "rgba(123, 84, 181, 0.12)", stroke: "rgba(123, 84, 181, 0.98)" },
  restrictive: { fill: "rgba(194, 38, 38, 0.12)", stroke: "rgba(194, 38, 38, 0.98)" },
  "special-use": { fill: "rgba(133, 88, 53, 0.12)", stroke: "rgba(133, 88, 53, 0.98)" },
  unknown: { fill: "rgba(112, 118, 128, 0.12)", stroke: "rgba(112, 118, 128, 0.98)" }
};

const fallbackStyle = new Style({
  stroke: new Stroke({ color: "#234f3f", width: 1.3 }),
  image: new CircleStyle({ radius: 3, fill: new Fill({ color: "#234f3f" }) }),
  zIndex: 1
});
const labelStyleCache = new Map();
const pointLabelStyleCache = new Map();
const chartStyleCache = new Map();
const debugStyleCache = new Map();

const map = new OlMap({
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
let inspectionVectorLayer = null;
let inspectionVectorSource = null;
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
let procedureSelectedLayer = null;
let procedureSelectedSource = null;
let procedureEditorialLayer = null;
let procedureEditorialSource = null;
let procedureEditorialFeatureCount = 0;
let loadedProcedureLegFeatures = [];
let loadedProcedureLegProcedureId = null;
let procedureLegLoadSequence = 0;
let activeProcedureArtifactSource = null;
let spatialFocusLayer = null;
let spatialFocusSource = null;
let activeTileMaxZoom = 15;
let activeInspectMaxZoom = 18;
let activeTileConfig = null;
const debugTileBoundaryFeatures = new Map();
const debugTileCountFeatures = new Map();
const debugTileCountStyleCache = new Map();
const pointSymbolImageCache = new Map();
const debugStats = {
  requests: 0,
  loads: 0,
  empty404: 0,
  emptyMissing: 0,
  failures: 0
};

function drawRegularPolygon(ctx, cx, cy, sides, radius, rot = 0) {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const angle = rot + (i * 2 * Math.PI) / sides;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function drawArincNavaidSymbol(ctx, key, cx, cy, r) {
  const blue = "#0f5798";
  const ndbBrown = "#7a2a00";
  const lw = 0.82;
  if (key === "vor") {
    drawRegularPolygon(ctx, cx, cy, 6, r + 1.45, 0);
    ctx.strokeStyle = blue;
    ctx.lineWidth = 1.55 * lw;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.2, 0, Math.PI * 2);
    ctx.fillStyle = blue;
    ctx.fill();
    return;
  }
  if (key === "vor_dme") {
    ctx.beginPath();
    ctx.rect(cx - r * 1.28, cy - r * 1.02, r * 2.56, r * 2.04);
    ctx.strokeStyle = blue;
    ctx.lineWidth = 1.45 * lw;
    ctx.stroke();
    drawRegularPolygon(ctx, cx, cy, 6, r * 1.14, 0);
    ctx.strokeStyle = blue;
    ctx.lineWidth = 1.45 * lw;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.2, 0, Math.PI * 2);
    ctx.fillStyle = blue;
    ctx.fill();
    return;
  }
  if (key === "vortac") {
    ctx.save();
    ctx.translate(0, r * 0.08);
    const hcY = cy + r * 0.28;
    const outerR = r * 1.02;
    const innerR = r * 0.67;
    drawRegularPolygon(ctx, cx, hcY, 6, outerR, 0);
    ctx.fillStyle = blue;
    ctx.fill();
    drawRegularPolygon(ctx, cx, hcY, 6, innerR, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, hcY, r * 0.24, 0, Math.PI * 2);
    ctx.fillStyle = blue;
    ctx.fill();
    const verts = [];
    for (let i = 0; i < 6; i++) {
      const angle = (i * 2 * Math.PI) / 6;
      verts.push([cx + Math.cos(angle) * outerR, hcY + Math.sin(angle) * outerR]);
    }
    const rectOnSide = (ax, ay, bx, by, fraction, height) => {
      const vx = bx - ax;
      const vy = by - ay;
      const len = Math.hypot(vx, vy) || 1;
      const ux = vx / len;
      const uy = vy / len;
      const nx = uy;
      const ny = -ux;
      const trim = (1 - fraction) * 0.5;
      const q1x = ax + ux * (len * trim);
      const q1y = ay + uy * (len * trim);
      const q2x = bx - ux * (len * trim);
      const q2y = by - uy * (len * trim);
      ctx.beginPath();
      ctx.moveTo(q1x, q1y);
      ctx.lineTo(q2x, q2y);
      ctx.lineTo(q2x + nx * height, q2y + ny * height);
      ctx.lineTo(q1x + nx * height, q1y + ny * height);
      ctx.closePath();
      ctx.fill();
    };
    rectOnSide(verts[1][0], verts[1][1], verts[2][0], verts[2][1], 0.74, r * 0.9);
    rectOnSide(verts[3][0], verts[3][1], verts[4][0], verts[4][1], 0.78, r * 0.74);
    rectOnSide(verts[5][0], verts[5][1], verts[0][0], verts[0][1], 0.78, r * 0.74);
    ctx.restore();
    return;
  }
  if (key === "ndb") {
    const rows = [r * 1.35, r * 1.0, r * 0.7];
    const counts = [30, 20, 12];
    ctx.fillStyle = ndbBrown;
    for (let j = 0; j < rows.length; j++) {
      const rr = rows[j];
      const count = counts[j];
      for (let i = 0; i < count; i++) {
        const angle = (i * 2 * Math.PI) / count;
        const x = cx + Math.cos(angle) * rr;
        const y = cy + Math.sin(angle) * rr;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(0.55, r * 0.065), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.22, 0, Math.PI * 2);
    ctx.fill();
  }
}

function createArincNavaidIcon(symbol, radius) {
  const pixelRadius = Math.max(6.8, radius * 3.2);
  const size = Math.ceil((pixelRadius + 6) * 2);
  const cacheKey = `${symbol}|${Math.round(pixelRadius * 10)}`;
  if (pointSymbolImageCache.has(cacheKey)) return pointSymbolImageCache.get(cacheKey);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.translate(0.5, 0.5);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  drawArincNavaidSymbol(ctx, symbol, size / 2, size / 2, pixelRadius);
  const icon = new Icon({
    src: canvas.toDataURL("image/png"),
    anchor: [0.5, 0.5]
  });
  pointSymbolImageCache.set(cacheKey, icon);
  return icon;
}

function createPointSymbolImage(token) {
  const fill = new Fill({ color: token.fill });
  const stroke = new Stroke({ color: token.stroke, width: token.strokeWidth });
  if (["vor", "vor_dme", "vortac", "ndb"].includes(token.symbol)) {
    return createArincNavaidIcon(token.symbol, token.radius);
  }
  if (token.symbol === "airport") {
    return new RegularShape({
      points: 4,
      radius: token.radius + 1.3,
      angle: 0,
      fill,
      stroke
    });
  }
  if (token.symbol === "heliport") {
    return new RegularShape({
      points: 4,
      radius: token.radius + 1.2,
      radius2: Math.max(2.1, token.radius * 0.52),
      angle: Math.PI / 4,
      fill,
      stroke
    });
  }
  if (token.symbol === "navaid") {
    return new RegularShape({
      points: 4,
      radius: token.radius + 0.95,
      angle: 0,
      fill,
      stroke
    });
  }
  if (token.symbol === "waypoint" || token.symbol === "waypoint-compulsory") {
    return new RegularShape({
      points: token.symbol === "waypoint-compulsory" ? 4 : 3,
      radius: token.radius + (token.symbol === "waypoint-compulsory" ? 0.95 : 1.15),
      angle: 0,
      fill,
      stroke
    });
  }
  return new CircleStyle({
    radius: token.radius,
    fill,
    stroke
  });
}

function getLabelStyleOptions(layer, priority) {
  const key = String(layer || "").toLowerCase();
  if (key === "airspaces" || key === "airspace") {
    return {
      font: priority >= 120 ? "600 12px 'Trebuchet MS', sans-serif" : "600 11px 'Trebuchet MS', sans-serif",
      fill: "#304036",
      stroke: "rgba(255,255,255,0.88)",
      strokeWidth: 2.2,
      overflow: false
    };
  }
  if (key === "airways" || key === "airway") {
    return {
      font: "600 11px 'Consolas', 'Menlo', monospace",
      fill: "#5d6772",
      stroke: "rgba(255,255,255,0.9)",
      strokeWidth: 2.6,
      placement: "line",
      overflow: true
    };
  }
  if (key === "procedures" || key === "procedure" || key === "holds" || key === "hold") {
    return {
      font: "600 11px 'Trebuchet MS', sans-serif",
      fill: "#4f2c2c",
      stroke: "rgba(255,255,255,0.94)",
      strokeWidth: 2.8,
      placement: "line",
      overflow: true
    };
  }
  if (key === "airports" || key === "airport" || key === "heliports" || key === "heliport") {
    return {
      font: priority >= 110 ? "600 12px 'Trebuchet MS', sans-serif" : "600 11px 'Trebuchet MS', sans-serif",
      fill: "#203045",
      stroke: "rgba(255,255,255,0.95)",
      strokeWidth: 2.8,
      offsetY: -13,
      overflow: true
    };
  }
  if (key === "navaids" || key === "navaid") {
    return {
      font: "11px 'Tahoma', sans-serif",
      fill: "#3b436c",
      stroke: "rgba(255,255,255,0.95)",
      strokeWidth: 2.4,
      offsetY: -10,
      overflow: true
    };
  }
  if (key === "waypoints" || key === "waypoint") {
    return {
      font: "11px 'Tahoma', sans-serif",
      fill: "#355248",
      stroke: "rgba(255,255,255,0.95)",
      strokeWidth: 2.2,
      offsetY: -9,
      overflow: true
    };
  }
  return {
    font: priority >= 95 ? "600 12px 'Trebuchet MS', sans-serif" : "11px 'Trebuchet MS', sans-serif",
    fill: "#243129",
    stroke: "rgba(255,255,255,0.92)",
    strokeWidth: 2.6,
    overflow: true
  };
}

function layerStyle(feature, resolution) {
  return styleByLayer(feature, resolution);
}

function setActiveCartography(cartography) {
  activeCartography = cartography ?? { layers: [], labelCandidates: [], bounds: null };
  activeLayerDescriptorMap = new Map(
    (activeCartography.layers ?? []).map((layer) => [String(layer.name || "").toLowerCase(), layer])
  );
}

updateProcedureLayerStatus();

function updateViewMaxZoomForInspection() {
  const view = map.getView();
  const tileMax = Number.isFinite(activeTileMaxZoom) ? activeTileMaxZoom : 15;
  activeInspectMaxZoom = Math.max(tileMax + 8, 18);
  view.setMaxZoom(activeInspectMaxZoom);
  updateZoomDebugStatus();
}

function updateZoomDebugStatus() {
  if (!zoomDebugStatusEl) return;
  const zoom = map.getView()?.getZoom?.();
  const tileActive = Boolean(tileLayer?.getVisible?.());
  const inspectionActive = Boolean(inspectionVectorLayer?.getVisible?.());
  zoomDebugStatusEl.textContent = `zoom: ${Number.isFinite(zoom) ? zoom.toFixed(2) : "n/a"} | arinc tiled layer active: ${tileActive ? "yes" : "no"} | high-zoom inspection layer active: ${inspectionActive ? "yes" : "no"} | tile max: ${activeTileMaxZoom}`;
}

function ensureInspectionVectorLayer() {
  if (inspectionVectorLayer) return;
  inspectionVectorSource = new VectorSource();
  inspectionVectorLayer = new VectorLayer({
    source: inspectionVectorSource,
    style: layerStyle,
    declutter: true,
    zIndex: 160
  });
  inspectionVectorLayer.setVisible(false);
  map.addLayer(inspectionVectorLayer);
}

function lonToTileX(lon, z) {
  const n = 2 ** z;
  return Math.floor(((lon + 180) / 360) * n);
}

function latToTileY(lat, z) {
  const n = 2 ** z;
  const latRad = (Math.max(-85.05112878, Math.min(85.05112878, lat)) * Math.PI) / 180;
  return Math.floor((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2 * n);
}

function shouldDeduplicateInspectionFeature(feature) {
  const geomType = String(feature?.getGeometry?.()?.getType?.() || "");
  return geomType === "Point" || geomType === "MultiPoint";
}

async function loadInspectionTileFeatures() {
  ensureInspectionVectorLayer();
  if (!activeTileConfig || !Number.isFinite(activeTileMaxZoom)) {
    inspectionVectorSource.clear();
    inspectionVectorLayer.setVisible(false);
    updateZoomDebugStatus();
    return;
  }

  const zoom = map.getView().getZoom();
  if (!Number.isFinite(zoom) || zoom <= activeTileMaxZoom) {
    inspectionVectorSource.clear();
    inspectionVectorLayer.setVisible(false);
    updateZoomDebugStatus();
    return;
  }

  const extent4326 = transformExtent(map.getView().calculateExtent(map.getSize()), "EPSG:3857", "EPSG:4326");
  const [minLon, minLat, maxLon, maxLat] = extent4326;
  const z = activeTileMaxZoom;
  const n = 2 ** z;
  const minX = Math.max(0, Math.min(n - 1, lonToTileX(minLon, z)));
  const maxX = Math.max(0, Math.min(n - 1, lonToTileX(maxLon, z)));
  const minY = Math.max(0, Math.min(n - 1, latToTileY(maxLat, z)));
  const maxY = Math.max(0, Math.min(n - 1, latToTileY(minLat, z)));
  const tileFormat = new GeoJSON({ dataProjection: "EPSG:4326", featureProjection: "EPSG:3857" });
  const features = [];
  const seenIds = new Set();

  for (let x = minX; x <= maxX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      if (activeTileConfig.availableTilesSet && !activeTileConfig.availableTilesSet.has(`${z}/${x}/${y}`)) continue;
      let json = null;
      if (activeTileConfig.localMode) {
        const tilePath = `${z}/${x}/${y}.json`;
        const file = findLocalFile(tilePath) || findLocalFile(`tiles/${tilePath}`);
        if (!file) continue;
        try {
          json = JSON.parse(await file.text());
        } catch {
          continue;
        }
      } else {
        const url = activeTileConfig.remoteTemplate
          .replace("{z}", String(z))
          .replace("{x}", String(x))
          .replace("{y}", String(y));
        try {
          const r = await fetch(url);
          if (!r.ok) continue;
          json = await r.json();
        } catch {
          continue;
        }
      }
      const tileFeatures = tileFormat.readFeatures(json, {
        dataProjection: "EPSG:4326",
        featureProjection: "EPSG:3857"
      });
      for (const feature of tileFeatures) {
        feature.set("inspectionFeature", true, true);
        const featureId = String(feature.getId?.() ?? feature.get("id") ?? `${x}/${y}/${features.length}`);
        if (shouldDeduplicateInspectionFeature(feature)) {
          if (seenIds.has(featureId)) continue;
          seenIds.add(featureId);
        }
        features.push(feature);
      }
    }
  }

  inspectionVectorSource.clear();
  if (features.length > 0) {
    inspectionVectorSource.addFeatures(features);
    inspectionVectorLayer.setVisible(true);
  } else {
    inspectionVectorLayer.setVisible(false);
  }
  updateZoomDebugStatus();
}

async function updateHighZoomInspectionMode() {
  const zoom = map.getView().getZoom();
  const useInspectionLayer = Number.isFinite(zoom) && zoom > activeTileMaxZoom;
  if (tileLayer) tileLayer.setVisible(true);
  if (!useInspectionLayer) {
    if (inspectionVectorSource) inspectionVectorSource.clear();
    if (inspectionVectorLayer) inspectionVectorLayer.setVisible(false);
    updateZoomDebugStatus();
    return;
  }
  await loadInspectionTileFeatures();
}

function styleByLayer(feature, resolution) {
  const layer = String(feature.get("layer") || "").toLowerCase();
  const descriptor = activeLayerDescriptorMap.get(layer) || getDefaultLayerDescriptor(layer);
  const isInspectionFeature = Boolean(feature.get("inspectionFeature"));
  const procedureRenderSource = String(feature.get("procedureRenderSource") || "").toLowerCase();

  if (isInspectionFeature && descriptor?.styleHint === "airspace") {
    return null;
  }

  const zoom = map.getView().getZoomForResolution(resolution);
  const isProcedure = isProcedureLayerName(layer);
  const procedureMeta = isProcedure ? deriveProcedureDisplayFromFeature(feature) : null;
  const procedureSelected = procedureMeta ? procedureIsSelected(procedureMeta) : false;
  const hasSelectedProcedureOverlay = Boolean(
    procedureUiState.legDataLoaded
    && procedureUiState.selected !== "all"
  );
  if (isProcedure) {
    if (hasSelectedProcedureOverlay && !isProcedureEditorialFeature(feature) && procedureRenderSource !== "selected-artifact") {
      return null;
    }
    if (!procedureSelected) return null;
    if (!procedureMatchesFilters(feature, procedureMeta) && !procedureSelected) return null;
  }
  if (!isFeatureVisibleInChartMode({
    feature,
    descriptor,
    zoom,
    mode: chartModeState.mode,
    procedureState: procedureUiState,
    focusContext: procedureFocusContext,
    spatialContext: chartSpatialContext,
    deriveProcedureDisplayFromFeature
  })) {
    return null;
  }
  const token = getChartStyleToken(feature, descriptor, zoom);
  if (!token) return null;
  const out = [];

  if (isProcedureEditorialFeature(feature)) {
    return buildProcedureEditorialStyles(feature, procedureSelected);
  }
  if (debugEnabled && debugUiState.airspaceColors && descriptor.styleHint === "airspace") {
    return appendLabelStyles(feature, descriptor, zoom, buildAirspaceDebugStyles(feature));
  }

  const styleKey = JSON.stringify({ ...token, procedureRenderMode: isProcedure ? (procedureSelected ? "selected" : "muted") : "default" });
  let chartStyles = chartStyleCache.get(styleKey);
  if (!chartStyles) {
    if (token.kind === "airspace") {
      const fillColor = debugEnabled && debugUiState.procedureFocus ? lightenAlpha(token.fill, 0.32) : token.fill;
      const strokeColor = debugEnabled && debugUiState.procedureFocus ? lightenAlpha(token.stroke, 0.5) : token.stroke;
      chartStyles = [new Style({
        fill: new Fill({ color: fillColor }),
        stroke: new Stroke({
          color: strokeColor,
          width: debugEnabled && debugUiState.procedureFocus ? Math.max(0.8, token.width - 0.35) : token.width,
          lineDash: token.lineDash || undefined
        }),
        zIndex: 10
      })];
    } else if (token.kind === "airway") {
      chartStyles = [];
      if (token.casing && token.casingWidth > 0) {
        chartStyles.push(new Style({
          stroke: new Stroke({
            color: debugEnabled && debugUiState.procedureFocus ? lightenAlpha(token.casing, 0.26) : token.casing,
            width: token.casingWidth
          }),
          zIndex: 35
        }));
      }
      chartStyles.push(new Style({
        stroke: new Stroke({
          color: debugEnabled && debugUiState.procedureFocus ? lightenAlpha(token.stroke, 0.28) : token.stroke,
          width: debugEnabled && debugUiState.procedureFocus ? Math.max(0.65, token.width - 0.35) : token.width
        }),
        zIndex: 40
      }));
    } else if (token.kind === "airport") {
      chartStyles = [new Style({
        image: createPointSymbolImage(token),
        zIndex: 90
      })];
    } else if (token.kind === "runway") {
      chartStyles = [new Style({
        stroke: new Stroke({ color: token.stroke, width: token.width }),
        zIndex: 80
      })];
    } else if (token.kind === "waypoint") {
      chartStyles = [new Style({
        image: createPointSymbolImage(token),
        zIndex: 95
      })];
    } else if (token.kind === "procedure") {
      chartStyles = [];
      if (token.casing && token.casingWidth > 0) {
        chartStyles.push(new Style({
          stroke: new Stroke({
            color: procedureSelected
              ? token.casing
              : lightenAlpha(token.casing, 0.55),
            width: token.casingWidth,
            lineDash: token.lineDash || undefined
          }),
          zIndex: 69
        }));
      }
      chartStyles.push(new Style({
        stroke: new Stroke({
          color: procedureSelected
            ? token.stroke
            : lightenAlpha(token.stroke, 0.46),
          width: procedureSelected ? token.width : Math.max(0.8, token.width - 0.55),
          lineDash: token.lineDash || undefined
        }),
        image: token.pointRadius > 0 ? new CircleStyle({
          radius: procedureSelected ? token.pointRadius : Math.max(2, token.pointRadius - 0.5),
          fill: new Fill({
            color: procedureSelected
              ? (token.pointFill || token.stroke)
              : lightenAlpha(token.pointFill || token.stroke, 0.48)
          }),
          stroke: new Stroke({ color: "#ffffff", width: 1.1 })
        }) : undefined,
        zIndex: 70
      }));
    } else {
      chartStyles = [fallbackStyle];
    }
    chartStyleCache.set(styleKey, chartStyles);
  }
  out.push(...chartStyles);

  if (descriptor.styleHint === "airspace" && debugEnabled) out.push(debugAirspaceBoundaryStyle);

  return appendLabelStyles(feature, descriptor, zoom, out, isProcedure && !procedureSelected);
}

function appendLabelStyles(feature, descriptor, zoom, styles, suppress = false) {
  const out = [...styles];
  if (suppress) return out;
  if (!labelsEnabled) return out;
  if (debugEnabled && debugUiState.procedureFocus && !isProcedureLayerName(String(feature.get("layer") || "").toLowerCase())) return out;
  if (!descriptor?.label?.enabled) return out;
  const layer = String(feature.get("layer") || "").toLowerCase();
  const procedureRenderSource = String(feature.get("procedureRenderSource") || "").toLowerCase();
  const depictionClass = String(feature.get("depictionClass") || "").toLowerCase();
  if (procedureRenderSource === "selected-artifact" && depictionClass !== "chart-point") return out;
  const baseRule = getLabelRule(feature, descriptor, zoom, labelsMinZoom);
  const labelRule = getLabelRuleForChartMode({
    feature,
    descriptor,
    baseRule,
    zoom,
    mode: chartModeState.mode,
    procedureState: procedureUiState,
    focusContext: procedureFocusContext,
    spatialContext: chartSpatialContext,
    deriveProcedureDisplayFromFeature
  });
  if (!labelRule.enabled) return out;
  const label = labelRule.text;
  const options = getLabelStyleOptions(layer, labelRule.priority);
  const pointGeom = feature.getGeometry?.()?.getType?.();
  const symbolStyleIndex = (pointGeom === "Point" || pointGeom === "MultiPoint")
    ? out.findIndex((style) => style?.getImage?.())
    : -1;
  if (symbolStyleIndex >= 0) {
    const symbolStyle = out[symbolStyleIndex];
    const key = `${layer}|point|${label}|${labelRule.priority}|${symbolStyle.getZIndex?.() ?? 0}`;
    let combinedStyle = pointLabelStyleCache.get(key);
    if (!combinedStyle) {
      combinedStyle = new Style({
        image: symbolStyle.getImage(),
        text: new Text({
          text: label,
          font: options.font,
          fill: new Fill({ color: options.fill }),
          stroke: new Stroke({ color: options.stroke, width: options.strokeWidth }),
          placement: options.placement,
          offsetY: options.offsetY ?? 0,
          overflow: options.overflow
        }),
        zIndex: Math.max(symbolStyle.getZIndex?.() ?? 0, 120 + Math.min(labelRule.priority, 120))
      });
      pointLabelStyleCache.set(key, combinedStyle);
    }
    out[symbolStyleIndex] = combinedStyle;
    return out;
  }

  const key = `${layer}|${label}|${labelRule.priority}`;
  let labelStyle = labelStyleCache.get(key);
  if (!labelStyle) {
    labelStyle = new Style({
      text: new Text({
        text: label,
        font: options.font,
        fill: new Fill({ color: options.fill }),
        stroke: new Stroke({ color: options.stroke, width: options.strokeWidth }),
        placement: options.placement,
        offsetY: options.offsetY ?? 0,
        overflow: options.overflow
      }),
      zIndex: 120 + Math.min(labelRule.priority, 120)
    });
    labelStyleCache.set(key, labelStyle);
  }
  out.push(labelStyle);
  return out;
}

function isProcedureEditorialFeature(feature) {
  return String(feature.get("layer") || "").toLowerCase() === "procedure-editorial"
    || String(feature.get("type") || "").toLowerCase() === "procedure-editorial-mark";
}

function buildProcedureEditorialStyles(feature, selected = false) {
  const editorialClass = String(feature.get("editorialClass") || "").trim().toLowerCase();
  const chartObjectClass = String(feature.get("chartObjectClass") || "").trim().toLowerCase();
  const depictionClass = String(feature.get("depictionClass") || "").trim().toLowerCase();
  const editorialText = String(feature.get("editorialText") || "").trim();
  const rotationDegrees = Number(feature.get("editorialRotationDegrees") ?? 0);
  const stackIndex = Number(feature.get("editorialStackIndex") ?? 0);
  const key = `editorial|${editorialClass}|${chartObjectClass}|${depictionClass}|${editorialText}|${rotationDegrees}|${stackIndex}|${selected ? "selected" : "normal"}`;
  let styles = debugStyleCache.get(key);
  if (styles) return styles;

  const isHold = depictionClass === "hold";
  const strokeColor = isHold ? "rgba(88, 112, 48, 0.96)" : "rgba(151, 126, 41, 0.96)";
  const fillColor = selected ? strokeColor : lightenAlpha(strokeColor, 0.82);
  const textColor = isHold ? "#43542b" : "#6a4f1c";
  styles = [];

  if (editorialClass === "direction-arrow") {
    styles.push(new Style({
      image: new RegularShape({
        points: 3,
        radius: selected ? 6.2 : 5.4,
        angle: (rotationDegrees * Math.PI) / 180,
        fill: new Fill({ color: fillColor }),
        stroke: new Stroke({ color: "#ffffff", width: 1.1 })
      }),
      zIndex: 82
    }));
  } else if (editorialClass === "open-end-marker") {
    styles.push(new Style({
      image: new RegularShape({
        points: 4,
        radius: selected ? 6 : 5.2,
        radius2: 0,
        angle: Math.PI / 4,
        fill: new Fill({ color: "rgba(0,0,0,0)" }),
        stroke: new Stroke({ color: fillColor, width: 1.8 })
      }),
      zIndex: 82
    }));
  } else if (editorialClass === "intercept-marker") {
    styles.push(new Style({
      image: new RegularShape({
        points: 4,
        radius: selected ? 4.8 : 4.2,
        angle: Math.PI / 4,
        fill: new Fill({ color: fillColor }),
        stroke: new Stroke({ color: "#ffffff", width: 1 })
      }),
      zIndex: 82
    }));
  } else if (editorialClass === "holding-fix-marker") {
    styles.push(new Style({
      image: new CircleStyle({
        radius: selected ? 4.2 : 3.6,
        fill: new Fill({ color: "#ffffff" }),
        stroke: new Stroke({ color: fillColor, width: 1.7 })
      }),
      zIndex: 82
    }));
  }

  if (editorialText) {
    styles.push(new Style({
      text: new Text({
        text: editorialText,
        font: chartObjectClass.includes("hold") || chartObjectClass === "hilpt"
          ? "600 11px 'Trebuchet MS', sans-serif"
          : "600 10px 'Trebuchet MS', sans-serif",
        fill: new Fill({ color: textColor }),
        stroke: new Stroke({ color: "rgba(255,255,255,0.96)", width: 3 }),
        offsetY: -10 - (stackIndex * 12),
        padding: [2, 4, 2, 4],
        backgroundFill: new Fill({ color: "rgba(255,255,255,0.72)" }),
        overflow: true
      }),
      zIndex: 83 + stackIndex
    }));
  }

  debugStyleCache.set(key, styles);
  return styles;
}

function deriveAirspaceDebugCategory(feature) {
  const classToken = String(
    feature.get("airspaceClass")
    || feature.get("classification")
    || feature.get("class")
    || ""
  ).trim().toUpperCase();
  const raw = [
    classToken,
    feature.get("airspaceType"),
    feature.get("type"),
    feature.get("usage"),
    feature.get("name")
  ].filter(Boolean).join(" ").toUpperCase();

  if (classToken === "A" || /\bCLASS\s*A\b|\bCLASS_A\b/.test(raw)) return "class-a";
  if (classToken === "B" || /\bCLASS\s*B\b|\bCLASS_B\b/.test(raw)) return "class-b";
  if (classToken === "C" || /\bCLASS\s*C\b|\bCLASS_C\b/.test(raw)) return "class-c";
  if (classToken === "D" || /\bCLASS\s*D\b|\bCLASS_D\b/.test(raw)) return "class-d";
  if (classToken === "E" || /\bCLASS\s*E\b|\bCLASS_E\b|\bCONTROLLED\b|\b UC\b/.test(raw)) return "class-e";
  if (/\bRESTRICT|\bPROHIBIT|\bDANGER/.test(raw)) return "restrictive";
  if (/\bMOA\b|\bWARNING\b|\bSPECIAL\s+USE\b/.test(raw)) return "special-use";
  return "unknown";
}

function countGeometryPoints(geometry) {
  const coords = geometry?.getCoordinates?.();
  let count = 0;
  const visit = (value) => {
    if (!Array.isArray(value)) return;
    if (value.length >= 2 && value.every(Number.isFinite)) {
      count += 1;
      return;
    }
    for (const item of value) visit(item);
  };
  visit(coords);
  return count || null;
}

function lightenAlpha(color, factor = 1) {
  const match = String(color || "").match(/^rgba?\(([^)]+)\)$/i);
  if (!match) return color;
  const parts = match[1].split(",").map((part) => part.trim());
  if (parts.length < 4) return color;
  const alpha = Number(parts[3]);
  if (!Number.isFinite(alpha)) return color;
  parts[3] = String(Math.max(0.03, Math.min(1, alpha * factor)));
  return `rgba(${parts.join(", ")})`;
}

function buildAirspaceDebugStyles(feature) {
  const category = deriveAirspaceDebugCategory(feature);
  const palette = debugAirspacePalette[category] ?? debugAirspacePalette.unknown;
  const key = `airspace|${category}`;
  let styles = debugStyleCache.get(key);
  if (!styles) {
    styles = [new Style({
      fill: new Fill({ color: palette.fill }),
      stroke: new Stroke({ color: palette.stroke, width: 2.1 }),
      zIndex: 12
    })];
    debugStyleCache.set(key, styles);
  }
  return styles;
}

function setStatus(text) {
  statusEl.textContent = text;
}

function isProcedureLayerName(layer) {
  const key = String(layer || "").toLowerCase();
  return [
    "procedure",
    "procedures",
    "holds",
    "hold",
    "procedure-annotations",
    "procedure-editorial"
  ].includes(key);
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
  const familyKey = [airport || "", category || "", ident || ""].join("|");
  const parts = [];
  if (ident) parts.push(ident);
  if (runway) parts.push(runway);
  if (transition && transition !== runway) parts.push(transition);
  return {
    key: String(props.procedureId ?? props.id ?? ident ?? transition ?? runway ?? category),
    id: String(props.procedureId ?? props.id ?? ""),
    category,
    ident: ident || null,
    airport: airport || null,
    familyKey,
    runway: runway || null,
    transition: transition || null,
    fixIdent: String(props.fixIdent ?? props.fixId ?? "").trim() || null,
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

function normalizeProcedureCatalogEntry(entry = {}) {
  return {
    ...entry,
    ...deriveProcedureDisplayFromProps(entry),
    key: String(entry?.procedureId ?? entry?.id ?? "")
  };
}

function mergeProcedureCatalogEntries(...collections) {
  const merged = new Map();
  for (const collection of collections) {
    for (const item of collection || []) {
      if (!item?.key) continue;
      if (!merged.has(item.key)) merged.set(item.key, item);
    }
  }
  return [...merged.values()];
}

function mergeCatalogBounds(a, b) {
  if (!a) return b ?? null;
  if (!b) return a ?? null;
  return [
    Math.min(a[0], b[0]),
    Math.min(a[1], b[1]),
    Math.max(a[2], b[2]),
    Math.max(a[3], b[3])
  ];
}

function procedureVariantLabel(item) {
  if (!item) return "";
  const runway = String(item.runway ?? "").trim();
  const transition = String(item.transition ?? "").trim();
  if (transition) return transition;
  if (runway) return runway;
  return "MAIN";
}

function compareProcedureVariantLabels(a, b) {
  const left = procedureVariantLabel(a);
  const right = procedureVariantLabel(b);
  if (left === right) return 0;
  if (left === "MAIN") return -1;
  if (right === "MAIN") return 1;
  return left.localeCompare(right);
}

function buildProcedureFamilies(entries = []) {
  const families = new Map();
  for (const entry of entries) {
    if (!entry?.familyKey) continue;
    let family = families.get(entry.familyKey);
    if (!family) {
      family = {
        key: entry.familyKey,
        familyKey: entry.familyKey,
        airport: entry.airport ?? null,
        category: entry.category ?? null,
        ident: entry.ident ?? entry.displayLabel ?? null,
        displayLabel: entry.ident ?? entry.displayLabel ?? `${entry.category ?? "PROCEDURE"} chart`,
        bounds: null,
        members: []
      };
      families.set(entry.familyKey, family);
    }
    family.members.push(entry);
    family.bounds = mergeCatalogBounds(family.bounds, entry.bounds ?? null);
  }
  return [...families.values()]
    .map((family) => ({
      ...family,
      members: [...family.members].sort(compareProcedureVariantLabels),
      variantLabels: [...new Set(family.members.map((item) => procedureVariantLabel(item)).filter(Boolean))]
    }))
    .sort((a, b) => a.displayLabel.localeCompare(b.displayLabel));
}

function mergeObservedBounds(mapLike, key, bbox) {
  if (!key || !bbox) return;
  const existing = mapLike.get(key);
  mapLike.set(key, mergeBBoxes([existing, bbox]));
}

function observeSpatialContextFeatures(features = []) {
  const shouldTrackProcedureBounds = procedureUiState.catalog.length === 0 || procedureUiState.selected !== "all";
  let changed = false;
  for (const feature of features) {
    const layer = String(feature?.get?.("layer") || "").toLowerCase();
    const bbox = getFeatureBBox(feature);
    if (!bbox) continue;

    if (layer === "airports" || layer === "airport" || layer === "heliports" || layer === "heliport") {
      const airportKey = String(feature.get("ident") ?? feature.get("airportIdent") ?? feature.get("airportId") ?? "").trim();
      mergeObservedBounds(observedAirportBounds, airportKey.replace(/^airport:[A-Z0-9]+:/i, ""), bbox);
      changed = true;
      continue;
    }

    if (layer === "runways") {
      const airportKey = String(feature.get("airportIdent") ?? feature.get("airportId") ?? "").trim().replace(/^airport:[A-Z0-9]+:/i, "");
      mergeObservedBounds(observedAirportRunwayBounds, airportKey, bbox);
      changed = true;
      continue;
    }

    if (shouldTrackProcedureBounds && isProcedureLayerName(layer)) {
      const meta = deriveProcedureDisplayFromFeature(feature);
      mergeObservedBounds(observedProcedureBounds, meta.familyKey || meta.key, bbox);
      changed = true;
    }
  }
  if (changed) {
    rebuildChartSpatialContext();
    refreshSpatialFocusOverlay();
  }
}

function observeProcedureFeatures(features = []) {
  observeSpatialContextFeatures(features);
}

function procedureMatchesFilters(feature, meta) {
  if (procedureUiState.airport !== "all" && meta.airport !== procedureUiState.airport) return false;
  if (procedureUiState.type !== "all" && meta.category !== procedureUiState.type) return false;
  return true;
}

function procedureIsSelected(meta) {
  return procedureUiState.selected !== "all" && meta.familyKey === procedureUiState.selected;
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
  const catalog = getProcedureSelectionCatalog();
  const families = buildProcedureFamilies(catalog);
  const proceduresAvailable = catalog.length > 0;
  if (procAirportEl) procAirportEl.disabled = !proceduresAvailable;
  if (procTypeEl) procTypeEl.disabled = !proceduresAvailable;
  if (procSelectEl) procSelectEl.disabled = !proceduresAvailable;
  setSelectOptions(procAirportEl, [...new Set(catalog.map((item) => item.airport).filter(Boolean))].sort((a, b) => a.localeCompare(b)), procedureUiState.airport);

  const filtered = families.filter((item) => {
    if (procedureUiState.airport !== "all" && item.airport !== procedureUiState.airport) return false;
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

function getProcedureSelectionCatalog() {
  return [...procedureUiState.catalog];
}

function findCatalogProcedureByKey(key) {
  if (!key || key === "all") return null;
  return buildProcedureFamilies(getProcedureSelectionCatalog()).find((item) => item.key === key) ?? null;
}

function clearLoadedProcedureLegState() {
  loadedProcedureLegFeatures = [];
  loadedProcedureLegProcedureId = null;
  procedureUiState.legDataLoaded = false;
  rebuildSelectedProcedureGeometry([]);
  rebuildProcedureEditorialLayerFromCollection(null);
}

function rebuildProcedureFocusContext() {
  procedureFocusContext = createProcedureFocusContext(loadedProcedureLegFeatures, procedureUiState.selected, deriveProcedureDisplayFromProps);
  if (procedureFocusContext.selected && procedureFocusContext.airport) return;

  const selected = findCatalogProcedureByKey(procedureUiState.selected);
  if (!selected) return;
  procedureFocusContext = {
    ...procedureFocusContext,
    selected: true,
    selectedKey: selected.key,
    airport: selected.airport || null,
    runway: null,
    transition: null
  };
}

function rebuildChartSpatialContext() {
  const terminalAirportKey = String(
    procedureUiState.airport !== "all"
      ? procedureUiState.airport
      : (procedureFocusContext.airport || "")
  ).trim();
  const airportBBox = terminalAirportKey ? observedAirportBounds.get(terminalAirportKey) ?? null : null;
  const runwayBBox = terminalAirportKey ? observedAirportRunwayBounds.get(terminalAirportKey) ?? null : null;
  const terminalFocusBBox = terminalAirportKey
    ? buildAirportFocusBBox({
        airportBBox,
        runwayBBoxes: runwayBBox ? [runwayBBox] : []
      })
    : null;

  const selectedProcedureKey = procedureUiState.selected !== "all" ? procedureUiState.selected : null;
  const procedureBBox = selectedProcedureKey ? observedProcedureBounds.get(selectedProcedureKey) ?? null : null;
  const procedureLegBBoxes = selectedProcedureKey
    ? loadedProcedureLegFeatures
        .filter((feature) => deriveProcedureDisplayFromFeature(feature).familyKey === selectedProcedureKey)
        .map((feature) => getFeatureBBox(feature))
        .filter(Boolean)
    : [];
  const procedureFocusBBox = selectedProcedureKey
    ? buildProcedureFocusBBox({
        procedureBBox,
        procedureLegBBoxes,
        fallbackBBox: terminalFocusBBox
      })
    : null;

  chartSpatialContext = {
    terminalFocusBBox,
    terminalContextBBox: terminalFocusBBox ? expandBBox(terminalFocusBBox, 32000) : null,
    procedureFocusBBox,
    procedureContextBBox: procedureFocusBBox ? expandBBox(procedureFocusBBox, 22000) : null
  };
}

function ensureSpatialFocusLayer() {
  if (spatialFocusLayer) return;
  spatialFocusSource = new VectorSource();
  spatialFocusLayer = new VectorLayer({
    source: spatialFocusSource,
    style: new Style({
      stroke: new Stroke({ color: "rgba(37, 96, 181, 0.9)", width: 2, lineDash: [10, 6] }),
      fill: new Fill({ color: "rgba(37, 96, 181, 0.04)" }),
      zIndex: 970
    })
  });
  spatialFocusLayer.setVisible(Boolean(debugEnabled && debugUiState.spatialFocus));
  map.addLayer(spatialFocusLayer);
}

function refreshSpatialFocusOverlay() {
  if (!debugEnabled) return;
  ensureSpatialFocusLayer();
  spatialFocusSource.clear();
  const focusBBox = chartSpatialContext.procedureFocusBBox || chartSpatialContext.terminalFocusBBox;
  if (!focusBBox) {
    spatialFocusLayer.setVisible(Boolean(debugUiState.spatialFocus));
    return;
  }
  const [minX, minY, maxX, maxY] = focusBBox;
  const ring = [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY], [minX, minY]];
  spatialFocusSource.addFeature(new Feature({ geometry: new Polygon([ring]) }));
  spatialFocusLayer.setVisible(Boolean(debugUiState.spatialFocus));
}

function refreshProcedureRendering() {
  procedureUiState.airport = procAirportEl?.value || "all";
  procedureUiState.type = procTypeEl?.value || "all";
  procedureUiState.selected = procSelectEl?.value || "all";
  refreshProcedureControls();
  rebuildProcedureFocusContext();
  rebuildChartSpatialContext();
  updateProcedureLayerStatus();
  refreshSpatialFocusOverlay();
  applyProcedureEditorialVisibility();
  if (tileLayer) tileLayer.changed();
  if (procedureEditorialLayer) procedureEditorialLayer.changed();
  void syncSelectedProcedureLegs();
}

function updateProcedureLayerStatus() {
  if (procLayerStatusEl) {
    const selectedFamily = findCatalogProcedureByKey(procedureUiState.selected);
    const selectedLabel = selectedFamily
      ? selectedFamily.displayLabel
      : "none";
    const catalogCount = buildProcedureFamilies(procedureUiState.catalog).length;
    procLayerStatusEl.textContent = `normal procedure layer loaded: ${procedureUiState.normalLayerLoaded ? "yes" : "no"} | editorial leg data loaded: ${procedureUiState.legDataLoaded ? "yes" : "no"} | editorial marks: ${procedureEditorialFeatureCount} | procedure catalog: ${catalogCount}${catalogCount === 0 ? " (missing procedure-catalog.json / outputs.procedures)" : ""} | selected chart: ${selectedLabel}`;
  }
  updateViewMaxZoomForInspection();
  updateChartModeStatus();
  refreshSpatialFocusOverlay();
}

function updateChartModeStatus() {
  if (!chartModeStatusEl) return;
  const selectedFamily = findCatalogProcedureByKey(procedureUiState.selected);
  const selectedProcedure = selectedFamily?.displayLabel ?? "none";
  chartModeStatusEl.textContent = `base chart: terminal-style by zoom | procedures: selected chart family | selected chart: ${selectedProcedure}`;
  if (chartFocusStatusEl) {
    const terminalActive = Boolean(chartSpatialContext.terminalFocusBBox);
    const procedureActive = Boolean(chartSpatialContext.procedureFocusBBox);
    chartFocusStatusEl.textContent = `spatial focus: terminal ${terminalActive ? "active" : "off"} | procedure ${procedureActive ? "active" : "off"}`;
  }
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

function ensureProcedureEditorialLayer() {
  if (procedureEditorialLayer) return;
  procedureEditorialSource = new VectorSource();
  procedureEditorialLayer = new VectorLayer({
    source: procedureEditorialSource,
    style: layerStyle,
    declutter: true,
    zIndex: 185
  });
  procedureEditorialLayer.setVisible(false);
  map.addLayer(procedureEditorialLayer);
}

function ensureProcedureSelectedLayer() {
  if (procedureSelectedLayer) return;
  procedureSelectedSource = new VectorSource();
  procedureSelectedLayer = new VectorLayer({
    source: procedureSelectedSource,
    style: layerStyle,
    declutter: true,
    zIndex: 176
  });
  procedureSelectedLayer.setVisible(false);
  map.addLayer(procedureSelectedLayer);
}

function applyProcedureSelectedVisibility() {
  if (!procedureSelectedLayer) return;
  const visible = Boolean(
    procedureUiState.legDataLoaded
    && procedureUiState.selected !== "all"
  );
  procedureSelectedLayer.setVisible(visible);
}

function applyProcedureEditorialVisibility() {
  if (!procedureEditorialLayer) return;
  const visible = Boolean(
    procedureUiState.legDataLoaded
    && procedureUiState.selected !== "all"
  );
  procedureEditorialLayer.setVisible(visible);
}

function rebuildProcedureEditorialLayerFromCollection(featureCollection) {
  ensureProcedureEditorialLayer();
  procedureEditorialSource.clear();
  procedureEditorialFeatureCount = 0;
  if (!featureCollection?.features?.length) return;

  const editorialCollection = buildProcedureEditorialFeatureCollectionFromProcedureLegs(featureCollection, {
    debug: debugEnabled
  });
  const format = new GeoJSON({ dataProjection: "EPSG:4326", featureProjection: "EPSG:3857" });
  const editorialFeatures = format.readFeatures(editorialCollection, {
    dataProjection: "EPSG:4326",
    featureProjection: "EPSG:3857"
  });
  procedureEditorialSource.addFeatures(editorialFeatures);
  procedureEditorialFeatureCount = editorialFeatures.length;
  applyProcedureEditorialVisibility();
}

function rebuildSelectedProcedureGeometry(features = []) {
  ensureProcedureSelectedLayer();
  procedureSelectedSource.clear();
  if (!features.length) {
    applyProcedureSelectedVisibility();
    return;
  }
  for (const feature of features) {
    feature.set("procedureRenderSource", "selected-artifact", true);
  }
  procedureSelectedSource.addFeatures(features);
  applyProcedureSelectedVisibility();
}

function renderInspectorFeature(feature) {
  if (!debugEnabled || !airspaceInspectorEl) return;
  if (!debugUiState.inspector) {
    airspaceInspectorEl.style.display = "none";
    return;
  }
  if (!feature) {
    airspaceInspectorEl.style.display = "block";
    airspaceInspectorEl.innerHTML = "<em>Click an airspace polygon or procedure leg to inspect.</em>";
    return;
  }
  if (isProcedureLayerName(String(feature.get("layer") || "").toLowerCase())) {
    const pointCount = countGeometryPoints(feature.getGeometry());
    const warnings = []
      .concat(feature.get("warnings") ?? [])
      .concat(feature.get("validationWarnings") ?? [])
      .filter(Boolean)
      .map((value) => String(value));
    airspaceInspectorEl.style.display = "block";
    airspaceInspectorEl.innerHTML = `
      <div><strong>Procedure Leg Inspector</strong></div>
      <div><strong>Procedure:</strong> ${String(feature.get("procedureId") || feature.get("id") || "n/a")}</div>
      <div><strong>Leg index:</strong> ${String(feature.get("legIndex") ?? feature.get("index") ?? "n/a")}</div>
      <div><strong>Leg type:</strong> ${String(feature.get("legType") || "n/a")}</div>
      <div><strong>Point count:</strong> ${pointCount ?? "n/a"}</div>
      <div><strong>Warnings:</strong> ${warnings.length ? warnings.join("; ") : "none"}</div>
    `;
    return;
  }
  if (!isAirspaceFeature(feature)) {
    airspaceInspectorEl.style.display = "block";
    airspaceInspectorEl.innerHTML = "<em>Click an airspace polygon or procedure leg to inspect.</em>";
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
  if (spatialFocusLayer) spatialFocusLayer.setVisible(Boolean(debugUiState.spatialFocus));
  if (airspaceInspectorEl && !debugUiState.inspector) {
    airspaceInspectorEl.style.display = "none";
    airspaceInspectorEl.innerHTML = "";
  }
  renderDebugLegend();
  updateProcedureLayerStatus();
  if (tileLayer) tileLayer.changed();
}

function renderDebugLegend() {
  if (!debugLegendEl) return;
  const parts = [];
  if (procedureUiState.legDataLoaded) parts.push(`procedure editorial marks: ${procedureEditorialFeatureCount}`);
  if (debugUiState.procedureFocus) parts.push("focus mode: airspaces and airways subdued, labels reduced");
  if (debugUiState.airspaceColors) {
    parts.push("airspaces: A dark blue, B cyan, C green, D orange, E purple, restricted red, special-use brown, unknown grey");
  }
  if (debugUiState.spatialFocus) parts.push("spatial focus bbox overlay enabled");
  debugLegendEl.style.display = parts.length ? "block" : "none";
  debugLegendEl.textContent = parts.join(" | ");
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
  loadedProcedureLegFeatures = [];
  procedureEditorialFeatureCount = 0;
  procedureUiState.legDataLoaded = false;
  loadedProcedureLegProcedureId = null;
  procedureLegLoadSequence = 0;
  activeProcedureArtifactSource = null;
  ensureProcedureSelectedLayer();
  ensureProcedureEditorialLayer();
  procedureSelectedSource.clear();
  procedureEditorialSource.clear();
  observedAirportBounds.clear();
  observedAirportRunwayBounds.clear();
  observedProcedureBounds.clear();
  chartSpatialContext = {
    terminalFocusBBox: null,
    terminalContextBBox: null,
    procedureFocusBBox: null,
    procedureContextBBox: null
  };
  rebuildProcedureFocusContext();
  applyProcedureSelectedVisibility();
  applyProcedureEditorialVisibility();
  if (!debugEnabled) return;
  ensureDebugLayers();
  ensureGeometryDebugLayers();
  ensureSpatialFocusLayer();
  debugTileBoundarySource.clear();
  debugTileCountSource.clear();
  debugArcCenterSource.clear();
  debugSegmentPointSource.clear();
  spatialFocusSource.clear();
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

function createLocalFileEntry(pathKey, source) {
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

async function ingestDirectoryHandle(dirHandle, relativeBase = "") {
  for await (const [entryName, handle] of dirHandle.entries()) {
    const nextPath = relativeBase ? `${relativeBase}/${entryName}` : entryName;
    if (handle.kind === "directory") {
      await ingestDirectoryHandle(handle, nextPath);
      continue;
    }
    const entry = createLocalFileEntry(nextPath, handle);
    const clean = entry.webkitRelativePath.replace(/^\.\/+/, "");
    localTileFiles.set(clean, entry);
    localTileFiles.set(entry.name, entry);
    if (entry.name === "visualization.index.json" && !localIndexFile) localIndexFile = entry;
  }
}

async function pickLocalTileDirectory() {
  if (typeof window.showDirectoryPicker === "function") {
    const dirHandle = await window.showDirectoryPicker({ mode: "read" });
    localTileFiles = new Map();
    localIndexFile = null;
    await ingestDirectoryHandle(dirHandle);
    return;
  }
  indexFileInput.value = "";
  indexFileInput.click();
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

function setLocalTileSelection(files = []) {
  localTileFiles = new Map();
  localIndexFile = null;
  for (const file of files) {
    if (!file) continue;
    const entry = createLocalFileEntry(file.webkitRelativePath || file.name || "", file);
    const clean = entry.webkitRelativePath.replace(/^\.\/+/, "");
    if (!clean) continue;
    localTileFiles.set(clean, entry);
    localTileFiles.set(entry.name, entry);
    if (entry.name === "visualization.index.json" && !localIndexFile) localIndexFile = entry;
  }
}

async function tryLoadProcedureCatalogRemote(loaded, indexUrl) {
  const procedureOutputs = loaded?.visualizationIndex?.outputs?.procedures;
  if (procedureOutputs?.type === "procedure-artifacts" && typeof procedureOutputs.catalog === "string") {
    try {
      const base = loaded?.visualizationIndexUrl || loaded?.tilesIndexUrl || indexUrl;
      const url = resolveRelativeAssetUrl(base, procedureOutputs.catalog);
      const r = await fetch(url);
      if (r.ok) {
        const json = await r.json();
        if (Array.isArray(json?.procedures)) {
          return {
            mode: "artifact-catalog",
            url,
            catalog: json.procedures.map(normalizeProcedureCatalogEntry)
          };
        }
      }
    } catch {
      return null;
    }
  }
  return null;
}

async function tryLoadProcedureCatalogLocal() {
  const visIndexFile = localIndexFile || findLocalFile("visualization.index.json");
  if (visIndexFile) {
    try {
      const vis = JSON.parse(await visIndexFile.text());
      const procedureOutputs = vis?.outputs?.procedures;
      if (procedureOutputs?.type === "procedure-artifacts" && typeof procedureOutputs.catalog === "string") {
        const normalizedCatalogPath = normalizeRelativeUri("visualization.index.json", procedureOutputs.catalog);
        const catalogFile = findLocalFile(normalizedCatalogPath) || findLocalFile(String(procedureOutputs.catalog).replace(/^\.\/+/, ""));
        if (catalogFile) {
          const json = JSON.parse(await catalogFile.text());
          if (Array.isArray(json?.procedures)) {
            return {
              mode: "artifact-catalog",
              name: catalogFile.name,
              catalog: json.procedures.map(normalizeProcedureCatalogEntry)
            };
          }
        }
      }
    } catch {
      return null;
    }
  }
  return null;
}

async function loadProcedureCatalogRemote(loaded, indexUrl) {
  const resolved = await tryLoadProcedureCatalogRemote(loaded, indexUrl);
  procedureUiState.catalog = resolved?.catalog ?? [];
  procedureUiState.normalLayerLoaded = procedureUiState.catalog.length > 0;
  activeProcedureArtifactSource = {
    mode: "remote",
    baseUrl: loaded?.visualizationIndexUrl || loaded?.tilesIndexUrl || indexUrl,
    visualizationIndex: loaded?.visualizationIndex ?? null
  };
  refreshProcedureControls();
  rebuildChartSpatialContext();
  updateProcedureLayerStatus();
  debugLog("procedure catalog loaded", {
    mode: resolved?.mode ?? "remote",
    url: resolved?.url ?? null,
    count: procedureUiState.catalog.length
  });
}

async function loadProcedureCatalogLocal() {
  const resolved = await tryLoadProcedureCatalogLocal();
  procedureUiState.catalog = resolved?.catalog ?? [];
  procedureUiState.normalLayerLoaded = procedureUiState.catalog.length > 0;
  let visualizationIndex = null;
  try {
    const visIndexFile = localIndexFile || findLocalFile("visualization.index.json");
    visualizationIndex = visIndexFile ? JSON.parse(await visIndexFile.text()) : null;
  } catch {
    visualizationIndex = null;
  }
  activeProcedureArtifactSource = {
    mode: "local",
    visualizationIndex
  };
  refreshProcedureControls();
  rebuildChartSpatialContext();
  updateProcedureLayerStatus();
  debugLog("procedure catalog loaded", {
    mode: resolved?.mode ?? "local",
    name: resolved?.name ?? null,
    count: procedureUiState.catalog.length
  });
}

async function tryLoadProcedureLegArtifactRemote(catalogEntry, source) {
  const legsPath = String(catalogEntry?.legsPath || "").trim();
  if (!legsPath || !source?.baseUrl) return null;
  try {
    const url = resolveRelativeAssetUrl(source.baseUrl, legsPath);
    const r = await fetch(url);
    if (!r.ok) return null;
    const json = await r.json();
    if (json?.type !== "FeatureCollection") return null;
    return { url, json };
  } catch {
    return null;
  }
}

async function tryLoadProcedureLegArtifactLocal(catalogEntry) {
  const legsPath = String(catalogEntry?.legsPath || "").trim();
  if (!legsPath) return null;
  const normalized = String(legsPath).replace(/^\.\/+/, "");
  const file = findLocalFile(normalized);
  if (!file) return null;
  try {
    const json = JSON.parse(await file.text());
    if (json?.type !== "FeatureCollection") return null;
    return { name: file.name, json };
  } catch {
    return null;
  }
}

function buildProcedureLegDedupKey(feature) {
  const props = feature?.properties ?? {};
  return JSON.stringify({
    layer: props.layer ?? null,
    depictionClass: props.depictionClass ?? null,
    semanticClass: props.semanticClass ?? null,
    chartObjectClass: props.chartObjectClass ?? null,
    approximationLevel: props.approximationLevel ?? null,
    fixIdent: props.fixIdent ?? props.fixId ?? null,
    geometry: feature?.geometry ?? null
  });
}

function mergeProcedureLegCollections(collections = []) {
  const seen = new Set();
  const features = [];
  for (const collection of collections) {
    for (const feature of collection?.features ?? []) {
      const key = buildProcedureLegDedupKey(feature);
      if (seen.has(key)) continue;
      seen.add(key);
      features.push(feature);
    }
  }
  return { type: "FeatureCollection", features };
}

async function syncSelectedProcedureLegs() {
  const requestId = ++procedureLegLoadSequence;
  const selectedKey = procedureUiState.selected;
  const selectedProcedure = findCatalogProcedureByKey(selectedKey);
  const selectedProcedureId = String(selectedProcedure?.key ?? "").trim();

  if (!selectedProcedure || !selectedProcedureId || selectedKey === "all") {
    clearLoadedProcedureLegState();
    rebuildProcedureFocusContext();
    rebuildChartSpatialContext();
    updateProcedureLayerStatus();
    refreshSpatialFocusOverlay();
    applyProcedureSelectedVisibility();
    applyProcedureEditorialVisibility();
    if (tileLayer) tileLayer.changed();
    if (procedureSelectedLayer) procedureSelectedLayer.changed();
    if (procedureEditorialLayer) procedureEditorialLayer.changed();
    return;
  }

  if (loadedProcedureLegProcedureId === selectedProcedureId && procedureUiState.legDataLoaded) {
    applyProcedureSelectedVisibility();
    applyProcedureEditorialVisibility();
    return;
  }

  clearLoadedProcedureLegState();
  rebuildProcedureFocusContext();
  rebuildChartSpatialContext();
  updateProcedureLayerStatus();

  let loadedLegs = null;
  const selectedMembers = selectedProcedure.members ?? [];
  if (selectedMembers.length && selectedMembers.some((member) => member.legsAvailable && member.legsPath)) {
    const loader = activeProcedureArtifactSource?.mode === "local"
      ? tryLoadProcedureLegArtifactLocal
      : (member) => tryLoadProcedureLegArtifactRemote(member, activeProcedureArtifactSource);
    const loadedCollections = (await Promise.all(
      selectedMembers
        .filter((member) => member.legsAvailable && member.legsPath)
        .map((member) => loader(member))
    )).filter((collection) => collection?.json?.features?.length);
    if (loadedCollections.length) {
      loadedLegs = {
        source: loadedCollections.map((item) => item.url ?? item.name ?? "").filter(Boolean),
        json: mergeProcedureLegCollections(loadedCollections.map((item) => item.json))
      };
    }
  }

  if (requestId !== procedureLegLoadSequence) return;

  if (!loadedLegs?.json?.features?.length) {
    clearLoadedProcedureLegState();
    rebuildProcedureFocusContext();
    rebuildChartSpatialContext();
    updateProcedureLayerStatus();
    refreshSpatialFocusOverlay();
    applyProcedureSelectedVisibility();
    applyProcedureEditorialVisibility();
    if (procedureSelectedLayer) procedureSelectedLayer.changed();
    debugLog("procedure leg data not available for selected procedure", { procedureId: selectedProcedureId });
    return;
  }

  const format = new GeoJSON({ dataProjection: "EPSG:4326", featureProjection: "EPSG:3857" });
  const features = format.readFeatures(loadedLegs.json, {
    dataProjection: "EPSG:4326",
    featureProjection: "EPSG:3857"
  });
  loadedProcedureLegFeatures = features;
  loadedProcedureLegProcedureId = selectedProcedureId;
  rebuildSelectedProcedureGeometry(features);
  rebuildProcedureEditorialLayerFromCollection(loadedLegs.json);
  procedureUiState.legDataLoaded = features.length > 0;
  rebuildProcedureFocusContext();
  rebuildChartSpatialContext();
  updateProcedureLayerStatus();
  refreshSpatialFocusOverlay();
  applyProcedureSelectedVisibility();
  applyProcedureEditorialVisibility();
  if (tileLayer) tileLayer.changed();
  if (procedureSelectedLayer) procedureSelectedLayer.changed();
  if (procedureEditorialLayer) procedureEditorialLayer.changed();
  debugLog("procedure leg artifact loaded", {
    procedureId: selectedProcedureId,
    featureCount: features.length,
    source: activeProcedureArtifactSource?.mode ?? "unknown"
  });
}

async function loadProcedureLegsRemote(loaded, indexUrl) {
  activeProcedureArtifactSource = {
    mode: "remote",
    baseUrl: loaded?.visualizationIndexUrl || loaded?.tilesIndexUrl || indexUrl,
    visualizationIndex: loaded?.visualizationIndex ?? null
  };
  await syncSelectedProcedureLegs();
}

async function loadProcedureLegsLocal(visualizationIndex = null) {
  activeProcedureArtifactSource = {
    mode: "local",
    visualizationIndex
  };
  await syncSelectedProcedureLegs();
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
            observeProcedureFeatures(features);
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
          observeProcedureFeatures(features);
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

  return new VectorTileLayer({
    source,
    style: layerStyle,
    declutter: true,
    renderMode: "vector"
  });
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
    activeTileMaxZoom = Number(tilesIndex.maxZoom);
    updateViewMaxZoomForInspection();
  }
  tileLayer = createTileLayer({
    localMode: false,
    remoteTemplate,
    availableTilesSet,
    minZoom: tilesIndex.minZoom,
    maxZoom: tilesIndex.maxZoom,
    recenterOnFirstFeature: globalLike
  });
  activeTileConfig = {
    localMode: false,
    remoteTemplate,
    availableTilesSet,
    maxZoom: Number(tilesIndex.maxZoom)
  };
  map.addLayer(tileLayer);
  tileLayer.setVisible(true);

  if (globalLike) {
    if (Number.isFinite(Number(tilesIndex.minZoom))) view.setZoom(Number(tilesIndex.minZoom));
    const t = await findBootstrapTile(remoteTemplate, Number(tilesIndex.minZoom) || 4, availableTilesSet);
    if (t) recenterToTile(t.z, t.x, t.y, Number(tilesIndex.minZoom));
  } else {
    fitBoundsIfPresent(tilesIndex.bounds, Number(tilesIndex.minZoom));
  }
  debugSummary("remote index loaded");
  await loadProcedureCatalogRemote(loaded, indexUrl);
  await loadProcedureLegsRemote(loaded, indexUrl);
  await updateHighZoomInspectionMode();
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
    activeTileMaxZoom = Number(tilesIndex.maxZoom);
    updateViewMaxZoomForInspection();
  }
  tileLayer = createTileLayer({
    localMode: true,
    remoteTemplate: null,
    availableTilesSet,
    minZoom: tilesIndex.minZoom,
    maxZoom: tilesIndex.maxZoom,
    recenterOnFirstFeature: globalLike
  });
  activeTileConfig = {
    localMode: true,
    remoteTemplate: null,
    availableTilesSet,
    maxZoom: Number(tilesIndex.maxZoom)
  };
  map.addLayer(tileLayer);
  tileLayer.setVisible(true);

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
  await loadProcedureLegsLocal(loaded.visualizationIndex);
  await updateHighZoomInspectionMode();
  setStatus(`Loaded local 2D index with ${localTileFiles.size} files.`);
}

async function loadTiles() {
  try {
    if (localTileFiles.size > 0) {
      await loadFromLocalSelection();
      return;
    }
    if (!activeRemoteIndexUrl) {
      setStatus("Select visualization.index.json.");
      return;
    }
    await loadFromRemoteIndex(activeRemoteIndexUrl);
  } catch (err) {
    const msg = String(err?.message || err);
    if (msg.includes("Cannot find local 2D index file referenced by visualization index")) {
      setStatus("Selected folder is missing files referenced from visualization.index.json.");
      return;
    }
    setStatus(`Failed to load index: ${msg}`);
  }
}

loadBtn.addEventListener("click", async () => {
  indexFileInput.value = "";
  indexFileInput.click();
});

indexFileInput.addEventListener("change", async (ev) => {
  const file = ev.target.files?.[0];
  if (!file) return;
  localTileFiles = new Map();
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
  void loadTiles();
});

procAirportEl?.addEventListener("change", () => {
  refreshProcedureRendering();
});
procTypeEl?.addEventListener("change", () => {
  refreshProcedureRendering();
});
procSelectEl?.addEventListener("change", () => {
  refreshProcedureRendering();
});
map.on("moveend", () => {
  updateZoomDebugStatus();
  void updateHighZoomInspectionMode();
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
  dbgProcFocusEl?.addEventListener("change", () => {
    debugUiState.procedureFocus = Boolean(dbgProcFocusEl.checked);
    applyDebugVisibility();
  });
  dbgAirspaceColorsEl?.addEventListener("change", () => {
    debugUiState.airspaceColors = Boolean(dbgAirspaceColorsEl.checked);
    applyDebugVisibility();
  });
  dbgSpatialFocusEl?.addEventListener("change", () => {
    debugUiState.spatialFocus = Boolean(dbgSpatialFocusEl.checked);
    applyDebugVisibility();
  });

  map.on("singleclick", (evt) => {
    if (!debugUiState.inspector && !debugUiState.arcCenters && !debugUiState.segmentPoints) return;
    let selected = null;
    map.forEachFeatureAtPixel(evt.pixel, (feature) => {
      if (isAirspaceFeature(feature) || isProcedureLayerName(String(feature.get("layer") || "").toLowerCase())) {
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
  setStatus("Click Load and select visualization.index.json.");
}
