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
import { Fill, Stroke, Style, Circle as CircleStyle, RegularShape, Text } from "https://esm.sh/ol@10.6.1/style.js";
import { transformExtent, fromLonLat } from "https://esm.sh/ol@10.6.1/proj.js";
import Feature from "https://esm.sh/ol@10.6.1/Feature.js";
import Polygon from "https://esm.sh/ol@10.6.1/geom/Polygon.js";
import Point from "https://esm.sh/ol@10.6.1/geom/Point.js";
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
import { CHART_MODE_TERMINAL, normalizeChartMode } from "./chart-modes.js";
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
const dbgProcLegColorsEl = document.getElementById("dbgProcLegColors");
const dbgProcLegOnlyEl = document.getElementById("dbgProcLegOnly");
const dbgProcFocusEl = document.getElementById("dbgProcFocus");
const dbgAirspaceColorsEl = document.getElementById("dbgAirspaceColors");
const debugLegendEl = document.getElementById("debugLegend");
const dbgSpatialFocusEl = document.getElementById("dbgSpatialFocus");
const procShowEl = document.getElementById("procShow");
const procAirportEl = document.getElementById("procAirport");
const procRunwayEl = document.getElementById("procRunway");
const procTypeEl = document.getElementById("procType");
const procTransitionEl = document.getElementById("procTransition");
const procNameEl = document.getElementById("procName");
const procSelectEl = document.getElementById("procSelect");
const procLegTypeEl = document.getElementById("procLegType");
const procSelectedOnlyEl = document.getElementById("procSelectedOnly");
const procLayerStatusEl = document.getElementById("procLayerStatus");
const procDebugNoticeEl = document.getElementById("procDebugNotice");
const procDebugZoomNoteEl = document.getElementById("procDebugZoomNote");
const chartModeEl = document.getElementById("chartMode");
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
  procedureLegColors: debugEnabled ? Boolean(dbgProcLegColorsEl?.checked ?? false) : false,
  procedureLegOnly: debugEnabled ? Boolean(dbgProcLegOnlyEl?.checked ?? true) : false,
  procedureFocus: debugEnabled ? Boolean(dbgProcFocusEl?.checked ?? false) : false,
  airspaceColors: debugEnabled ? Boolean(dbgAirspaceColorsEl?.checked ?? false) : false,
  spatialFocus: debugEnabled ? Boolean(dbgSpatialFocusEl?.checked ?? false) : false
};
const procedureUiState = {
  show: false,
  airport: "all",
  runway: "all",
  type: "all",
  transition: "all",
  nameQuery: "",
  legType: "all",
  selected: "all",
  selectedOnly: false,
  catalog: [],
  normalLayerLoaded: false,
  debugLegLayerLoaded: false
};
const chartModeState = {
  mode: normalizeChartMode(chartModeEl?.value || CHART_MODE_TERMINAL)
};
const observedProcedureCatalog = new Map();
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
const debugProcedureLegPalette = {
  IF: { stroke: "rgba(204, 212, 219, 0.96)", point: "rgba(204, 212, 219, 0.96)" },
  TF: { stroke: "rgba(204, 212, 219, 0.96)", point: "rgba(204, 212, 219, 0.96)" },
  CF: { stroke: "rgba(51, 118, 255, 0.96)", point: "rgba(51, 118, 255, 0.96)" },
  DF: { stroke: "rgba(242, 140, 36, 0.96)", point: "rgba(242, 140, 36, 0.96)" },
  RF: { stroke: "rgba(209, 29, 29, 0.96)", point: "rgba(209, 29, 29, 0.96)" },
  AF: { stroke: "rgba(54, 153, 77, 0.96)", point: "rgba(54, 153, 77, 0.96)" },
  UNKNOWN: { stroke: "rgba(255, 0, 255, 0.96)", point: "rgba(255, 0, 255, 0.96)" }
};
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
let procedureDebugLayer = null;
let procedureDebugSource = null;
let procedureDebugFeatureCount = 0;
let spatialFocusLayer = null;
let spatialFocusSource = null;
let activeTileMaxZoom = 15;
let activeInspectMaxZoom = 18;
let activeTileConfig = null;
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

function createPointSymbolImage(token) {
  const fill = new Fill({ color: token.fill });
  const stroke = new Stroke({ color: token.stroke, width: token.strokeWidth });
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

  if (isInspectionFeature && descriptor?.styleHint === "airspace") {
    return null;
  }

  const zoom = map.getView().getZoomForResolution(resolution);
  const isProcedure = isProcedureLayerName(layer);
  const procedureMeta = isProcedure ? deriveProcedureDisplayFromFeature(feature) : null;
  const procedureSelected = procedureMeta ? procedureIsSelected(procedureMeta) : false;
  const isProcedureDebugLeg = Boolean(feature.get("debugProcedureLeg")) || Boolean(feature.get("legType"));
  const hideNormalProceduresInDebug = Boolean(
    debugEnabled
    && debugUiState.procedureLegColors
    && procedureUiState.debugLegLayerLoaded
    && debugUiState.procedureLegOnly
  );
  if (isProcedure) {
    if (procedureUiState.selectedOnly && procedureUiState.selected !== "all" && !procedureSelected) return null;
    if (!isProcedureDebugLeg && !procedureUiState.show && !procedureSelected) return null;
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
  if (hideNormalProceduresInDebug && isProcedure && !isProcedureDebugLeg) {
    return null;
  }
  const token = getChartStyleToken(feature, descriptor, zoom);
  if (!token) return null;
  const out = [];

  if (debugEnabled && debugUiState.procedureLegColors && procedureDebugFeatureCount > 0 && isProcedure && isProcedureDebugLeg) {
    return appendLabelStyles(feature, descriptor, zoom, buildProcedureDebugStyles(feature, procedureSelected));
  }
  if (debugEnabled && debugUiState.airspaceColors && descriptor.styleHint === "airspace") {
    return appendLabelStyles(feature, descriptor, zoom, buildAirspaceDebugStyles(feature));
  }

  const styleKey = JSON.stringify({ ...token, procedureRenderMode: isProcedure ? (procedureSelected ? "selected" : "muted") : "default" });
  let chartStyles = chartStyleCache.get(styleKey);
  if (!chartStyles) {
    if (token.kind === "airspace") {
      const modeFocus = chartModeState.mode === "PROCEDURE";
      const fillColor = (debugEnabled && debugUiState.procedureFocus) || modeFocus ? lightenAlpha(token.fill, modeFocus ? 0.28 : 0.32) : token.fill;
      const strokeColor = (debugEnabled && debugUiState.procedureFocus) || modeFocus ? lightenAlpha(token.stroke, modeFocus ? 0.44 : 0.5) : token.stroke;
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
            color: (debugEnabled && debugUiState.procedureFocus) || chartModeState.mode === "PROCEDURE" ? lightenAlpha(token.casing, 0.26) : token.casing,
            width: token.casingWidth
          }),
          zIndex: 35
        }));
      }
      chartStyles.push(new Style({
        stroke: new Stroke({
          color: (debugEnabled && debugUiState.procedureFocus) || chartModeState.mode === "PROCEDURE" ? lightenAlpha(token.stroke, 0.28) : token.stroke,
          width: (debugEnabled && debugUiState.procedureFocus) || chartModeState.mode === "PROCEDURE" ? Math.max(0.65, token.width - 0.35) : token.width
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
      const hideUnselectedInProcedureMode = chartModeState.mode === "PROCEDURE" && procedureFocusContext.selected;
      chartStyles = [];
      if (token.casing && token.casingWidth > 0) {
        chartStyles.push(new Style({
          stroke: new Stroke({
            color: procedureSelected
              ? token.casing
              : (hideUnselectedInProcedureMode ? lightenAlpha(token.casing, 0.28) : lightenAlpha(token.casing, 0.55)),
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
            : (hideUnselectedInProcedureMode ? lightenAlpha(token.stroke, 0.14) : lightenAlpha(token.stroke, 0.46)),
          width: procedureSelected ? token.width : Math.max(0.8, token.width - 0.55),
          lineDash: token.lineDash || undefined
        }),
        image: token.pointRadius > 0 ? new CircleStyle({
          radius: procedureSelected ? token.pointRadius : Math.max(2, token.pointRadius - 0.5),
          fill: new Fill({
            color: procedureSelected
              ? (token.pointFill || token.stroke)
              : (hideUnselectedInProcedureMode ? lightenAlpha(token.pointFill || token.stroke, 0.16) : lightenAlpha(token.pointFill || token.stroke, 0.48))
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

function getProcedureLegType(feature) {
  return String(feature.get("legType") || "").trim().toUpperCase() || "UNKNOWN";
}

function buildProcedureDebugStyles(feature, selected = false) {
  const legType = getProcedureLegType(feature);
  const palette = debugProcedureLegPalette[legType] ?? debugProcedureLegPalette.UNKNOWN;
  const geomType = feature.getGeometry()?.getType?.() ?? "";
  const key = `procedure|${legType}|${geomType}|${selected ? "selected" : "normal"}`;
  let styles = debugStyleCache.get(key);
  if (!styles) {
    styles = [new Style({
      stroke: new Stroke({
        color: palette.stroke,
        width: selected ? 3.4 : 2.5,
        lineDash: legType === "CF" ? [10, 5] : undefined
      }),
      image: new CircleStyle({
        radius: legType === "IF" ? 4.2 : 3.2,
        fill: new Fill({ color: palette.point }),
        stroke: new Stroke({ color: "#ffffff", width: 1.1 })
      }),
      zIndex: 74
    })];
    debugStyleCache.set(key, styles);
  }
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
    id: String(props.procedureId ?? props.id ?? ""),
    category,
    ident: ident || null,
    airport: airport || null,
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

function mergeObservedBounds(mapLike, key, bbox) {
  if (!key || !bbox) return;
  const existing = mapLike.get(key);
  mapLike.set(key, mergeBBoxes([existing, bbox]));
}

function observeSpatialContextFeatures(features = []) {
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

    if (isProcedureLayerName(layer)) {
      const meta = deriveProcedureDisplayFromFeature(feature);
      mergeObservedBounds(observedProcedureBounds, meta.key, bbox);
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
  let added = 0;
  for (const feature of features) {
    const layer = String(feature?.get?.("layer") || feature?.properties?.layer || "").toLowerCase();
    if (!isProcedureLayerName(layer)) continue;
    const meta = feature?.get ? deriveProcedureDisplayFromFeature(feature) : deriveProcedureDisplayFromProps(feature.properties ?? feature);
    if (!meta?.key || observedProcedureCatalog.has(meta.key)) continue;
    observedProcedureCatalog.set(meta.key, meta);
    added += 1;
  }
  if (added > 0) {
    procedureUiState.normalLayerLoaded = true;
    refreshProcedureControls();
  }
}

function procedureMatchesFilters(feature, meta) {
  if (procedureUiState.airport !== "all" && meta.airport !== procedureUiState.airport) return false;
  if (procedureUiState.runway !== "all" && meta.runway !== procedureUiState.runway) return false;
  if (procedureUiState.type !== "all" && meta.category !== procedureUiState.type) return false;
  if (procedureUiState.transition !== "all" && meta.transition !== procedureUiState.transition) return false;
  if (procedureUiState.legType !== "all") {
    if (getProcedureLegType(feature) !== procedureUiState.legType) return false;
  }
  if (procedureUiState.nameQuery) {
    const haystack = [meta.displayLabel, meta.ident, meta.id, meta.key, meta.transition, meta.runway, meta.airport, meta.fixIdent]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(procedureUiState.nameQuery)) return false;
  }
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
  const catalog = mergeProcedureCatalogEntries(procedureUiState.catalog, observedProcedureCatalog.values());
  setSelectOptions(procAirportEl, [...new Set(catalog.map((item) => item.airport).filter(Boolean))].sort((a, b) => a.localeCompare(b)), procedureUiState.airport);
  setSelectOptions(procRunwayEl, [...new Set(catalog.map((item) => item.runway).filter(Boolean))].sort((a, b) => a.localeCompare(b)), procedureUiState.runway);
  setSelectOptions(procTransitionEl, [...new Set(catalog.map((item) => item.transition).filter(Boolean))].sort((a, b) => a.localeCompare(b)), procedureUiState.transition);
  const legTypes = procedureDebugSource
    ? [...new Set(procedureDebugSource.getFeatures().map((feature) => getProcedureLegType(feature)).filter(Boolean))].sort((a, b) => a.localeCompare(b))
    : [];
  setSelectOptions(procLegTypeEl, legTypes, procedureUiState.legType);

  const filtered = catalog.filter((item) => {
    if (procedureUiState.airport !== "all" && item.airport !== procedureUiState.airport) return false;
    if (procedureUiState.runway !== "all" && item.runway !== procedureUiState.runway) return false;
    if (procedureUiState.type !== "all" && item.category !== procedureUiState.type) return false;
    if (procedureUiState.transition !== "all" && item.transition !== procedureUiState.transition) return false;
    if (procedureUiState.nameQuery) {
      const haystack = [item.displayLabel, item.ident, item.id, item.key, item.transition, item.runway, item.airport]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(procedureUiState.nameQuery)) return false;
    }
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

function rebuildProcedureFocusContext() {
  const debugFeatures = procedureDebugSource?.getFeatures?.() ?? [];
  procedureFocusContext = createProcedureFocusContext(debugFeatures, procedureUiState.selected, deriveProcedureDisplayFromProps);
  if (procedureFocusContext.selected && procedureFocusContext.airport) return;

  const catalog = mergeProcedureCatalogEntries(procedureUiState.catalog, observedProcedureCatalog.values());
  const selected = catalog.find((item) => item.key === procedureUiState.selected);
  if (!selected) return;
  procedureFocusContext = {
    ...procedureFocusContext,
    selected: true,
    selectedKey: selected.key,
    airport: selected.airport || null,
    runway: selected.runway || null,
    transition: selected.transition || null
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
  const procedureLegBBoxes = selectedProcedureKey && procedureDebugSource
    ? procedureDebugSource.getFeatures()
        .filter((feature) => deriveProcedureDisplayFromFeature(feature).key === selectedProcedureKey)
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
  const focusBBox = chartModeState.mode === "PROCEDURE"
    ? (chartSpatialContext.procedureFocusBBox || chartSpatialContext.terminalFocusBBox)
    : chartSpatialContext.terminalFocusBBox;
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
  procedureUiState.show = Boolean(procShowEl?.checked);
  procedureUiState.airport = procAirportEl?.value || "all";
  procedureUiState.runway = procRunwayEl?.value || "all";
  procedureUiState.type = procTypeEl?.value || "all";
  procedureUiState.transition = procTransitionEl?.value || "all";
  procedureUiState.nameQuery = String(procNameEl?.value || "").trim().toLowerCase();
  procedureUiState.legType = procLegTypeEl?.value || "all";
  procedureUiState.selected = procSelectEl?.value || "all";
  procedureUiState.selectedOnly = Boolean(procSelectedOnlyEl?.checked);
  refreshProcedureControls();
  rebuildProcedureFocusContext();
  rebuildChartSpatialContext();
  updateProcedureLayerStatus();
  refreshSpatialFocusOverlay();
  if (tileLayer) tileLayer.changed();
  if (procedureDebugLayer) procedureDebugLayer.changed();
}

function updateProcedureLayerStatus() {
  if (procLayerStatusEl) {
    procLayerStatusEl.textContent = `normal procedure layer loaded: ${procedureUiState.normalLayerLoaded ? "yes" : "no"} | procedure-leg debug layer loaded: ${procedureUiState.debugLegLayerLoaded ? "yes" : "no"} | procedure catalog: ${procedureUiState.catalog.length} global / ${observedProcedureCatalog.size} observed | selected procedure: ${procedureUiState.selected === "all" ? "none" : procedureUiState.selected} | selected legType: ${procedureUiState.legType}`;
  }
  if (procDebugNoticeEl) {
    const shouldWarn = Boolean(debugEnabled && debugUiState.procedureLegColors && !procedureUiState.debugLegLayerLoaded);
    procDebugNoticeEl.style.display = shouldWarn ? "block" : "none";
    procDebugNoticeEl.textContent = shouldWarn
      ? "Per-leg procedure debug layer not available for this dataset."
      : "";
  }
  if (procDebugZoomNoteEl) {
    const visible = Boolean(debugEnabled && debugUiState.procedureLegColors && procedureUiState.debugLegLayerLoaded);
    procDebugZoomNoteEl.style.display = visible ? "block" : "none";
  }
  updateViewMaxZoomForInspection();
  updateChartModeStatus();
  refreshSpatialFocusOverlay();
}

function updateChartModeStatus() {
  if (!chartModeStatusEl) return;
  const selectedProcedure = procedureUiState.selected === "all" ? "none" : procedureUiState.selected;
  const labelsText = chartModeState.mode === "ENROUTE"
    ? "overview labels only"
    : (chartModeState.mode === "TERMINAL" ? "local labels, procedures only when selected/enabled" : "selected procedure labels only");
  chartModeStatusEl.textContent = `mode: ${chartModeState.mode} | labels: ${labelsText} | selected procedure: ${selectedProcedure}`;
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

function ensureProcedureDebugLayer() {
  if (procedureDebugLayer) return;
  procedureDebugSource = new VectorSource();
  procedureDebugLayer = new VectorLayer({
    source: procedureDebugSource,
    style: layerStyle,
    declutter: true,
    zIndex: 175
  });
  procedureDebugLayer.setVisible(Boolean(debugEnabled && debugUiState.procedureLegColors));
  map.addLayer(procedureDebugLayer);
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
  if (procedureDebugLayer) procedureDebugLayer.setVisible(Boolean(debugUiState.procedureLegColors));
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
  if (debugUiState.procedureLegColors) {
    parts.push(`procedure legs: TF/IF grey, CF blue, DF orange, RF red, AF green, unknown magenta${debugUiState.procedureLegOnly ? " | aggregated layer hidden" : ""}`);
  }
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
  if (!debugEnabled) return;
  ensureDebugLayers();
  ensureGeometryDebugLayers();
  ensureProcedureDebugLayer();
  ensureSpatialFocusLayer();
  debugTileBoundarySource.clear();
  debugTileCountSource.clear();
  debugArcCenterSource.clear();
  debugSegmentPointSource.clear();
  procedureDebugSource.clear();
  spatialFocusSource.clear();
  procedureDebugFeatureCount = 0;
  procedureUiState.debugLegLayerLoaded = false;
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
          .filter((feature) => isProcedureLayerName(feature?.layer ?? feature?.properties?.layer))
          .map((feature) => deriveProcedureDisplayFromProps(feature.properties ?? feature))
      };
    } catch {
      // continue
    }
  }
  return null;
}

async function tryLoadProcedureDebugLegsRemote(baseIndexUrl, visualizationIndex = null) {
  const ref = visualizationIndex?.outputs?.debug?.procedureLegs;
  if (!ref) return null;

  try {
    const url = new URL(ref, baseIndexUrl).toString();
    const r = await fetch(url);
    if (!r.ok) return null;
    const json = await r.json();
    if (json?.type !== "FeatureCollection") return null;
    return { url, json };
  } catch {
    return null;
  }
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
        .filter((feature) => isProcedureLayerName(feature?.layer ?? feature?.properties?.layer))
        .map((feature) => deriveProcedureDisplayFromProps(feature.properties ?? feature))
    };
  } catch {
    return null;
  }
}

async function tryLoadProcedureDebugLegsLocal(visualizationIndex = null) {
  const ref = visualizationIndex?.outputs?.debug?.procedureLegs;
  if (!ref) return null;
  const normalized = String(ref).replace(/^\.\/+/, "");
  const file = findLocalFile(normalized);
  if (!file) return null;
  try {
    const json = JSON.parse(await file.text());
    if (json?.type === "FeatureCollection") return { name: file.name, json };
  } catch {
    return null;
  }
  return null;
}

async function loadProcedureCatalogRemote(loaded, indexUrl) {
  const resolved = await tryLoadProcedureCatalogRemote(loaded, indexUrl);
  procedureUiState.catalog = resolved?.catalog ?? [];
  procedureUiState.normalLayerLoaded = procedureUiState.catalog.length > 0;
  refreshProcedureControls();
  rebuildChartSpatialContext();
  updateProcedureLayerStatus();
  debugLog("procedure catalog loaded", {
    mode: "remote",
    url: resolved?.url ?? null,
    count: procedureUiState.catalog.length
  });
}

async function loadProcedureCatalogLocal() {
  const resolved = await tryLoadProcedureCatalogLocal();
  procedureUiState.catalog = resolved?.catalog ?? [];
  procedureUiState.normalLayerLoaded = procedureUiState.catalog.length > 0;
  refreshProcedureControls();
  rebuildChartSpatialContext();
  updateProcedureLayerStatus();
  debugLog("procedure catalog loaded", {
    mode: "local",
    name: resolved?.name ?? null,
    count: procedureUiState.catalog.length
  });
}

async function loadProcedureDebugLegsRemote(loaded, indexUrl) {
  if (!debugEnabled) return;
  ensureProcedureDebugLayer();
  const base = loaded.visualizationIndexUrl || loaded.tilesIndexUrl || indexUrl;
  const loadedLegs = await tryLoadProcedureDebugLegsRemote(base, loaded.visualizationIndex);
  procedureDebugSource.clear();
  procedureDebugFeatureCount = 0;
  if (!loadedLegs) {
    procedureUiState.debugLegLayerLoaded = false;
    rebuildChartSpatialContext();
    updateProcedureLayerStatus();
    debugLog("procedure debug legs not found for remote dataset");
    return;
  }
  const format = new GeoJSON({ dataProjection: "EPSG:4326", featureProjection: "EPSG:3857" });
  const features = format.readFeatures(loadedLegs.json, {
    dataProjection: "EPSG:4326",
    featureProjection: "EPSG:3857"
  });
  procedureDebugSource.addFeatures(features);
  procedureDebugFeatureCount = features.length;
  procedureUiState.debugLegLayerLoaded = features.length > 0;
  rebuildProcedureFocusContext();
  refreshProcedureControls();
  updateProcedureLayerStatus();
  debugLog("procedure debug legs loaded", { url: loadedLegs.url, count: features.length });
}

async function loadProcedureDebugLegsLocal(visualizationIndex = null) {
  if (!debugEnabled) return;
  ensureProcedureDebugLayer();
  const loadedLegs = await tryLoadProcedureDebugLegsLocal(visualizationIndex);
  procedureDebugSource.clear();
  procedureDebugFeatureCount = 0;
  if (!loadedLegs) {
    procedureUiState.debugLegLayerLoaded = false;
    rebuildChartSpatialContext();
    updateProcedureLayerStatus();
    debugLog("procedure debug legs not found in local selection");
    return;
  }
  const format = new GeoJSON({ dataProjection: "EPSG:4326", featureProjection: "EPSG:3857" });
  const features = format.readFeatures(loadedLegs.json, {
    dataProjection: "EPSG:4326",
    featureProjection: "EPSG:3857"
  });
  procedureDebugSource.addFeatures(features);
  procedureDebugFeatureCount = features.length;
  procedureUiState.debugLegLayerLoaded = features.length > 0;
  rebuildProcedureFocusContext();
  refreshProcedureControls();
  updateProcedureLayerStatus();
  debugLog("procedure debug legs loaded from local files", { name: loadedLegs.name, count: features.length });
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
  observedProcedureCatalog.clear();
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
  await loadProcedureDebugLegsRemote(loaded, indexUrl);
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
  observedProcedureCatalog.clear();
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
  await loadProcedureDebugLegsLocal(loaded.visualizationIndex);
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

chartModeEl?.addEventListener("change", () => {
  chartModeState.mode = normalizeChartMode(chartModeEl.value);
  rebuildChartSpatialContext();
  updateChartModeStatus();
  refreshSpatialFocusOverlay();
  updateZoomDebugStatus();
  if (tileLayer) tileLayer.changed();
  if (procedureDebugLayer) procedureDebugLayer.changed();
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
procTransitionEl?.addEventListener("change", () => {
  refreshProcedureRendering();
});
procNameEl?.addEventListener("input", () => {
  refreshProcedureRendering();
});
procSelectEl?.addEventListener("change", () => {
  refreshProcedureRendering();
});
procLegTypeEl?.addEventListener("change", () => {
  refreshProcedureRendering();
});
procSelectedOnlyEl?.addEventListener("change", () => {
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
  dbgProcLegColorsEl?.addEventListener("change", () => {
    debugUiState.procedureLegColors = Boolean(dbgProcLegColorsEl.checked);
    applyDebugVisibility();
  });
  dbgProcLegOnlyEl?.addEventListener("change", () => {
    debugUiState.procedureLegOnly = Boolean(dbgProcLegOnlyEl.checked);
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
