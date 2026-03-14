/**
 * Viewer helper exports for OpenLayers and Cesium demos.
 */
export const viewAdapters = {
  openlayers: "./examples/openlayers.html",
  cesium: "./examples/cesium.html"
};

export {
  isVisualizationIndex,
  loadVisualizationIndex,
  load2DTilesIndex,
  load3DTilesIndex,
  resolveRelativeAssetUrl
} from "./loaders/visualization-index.js";

export {
  buildCartography,
  getDefaultLayerDescriptor,
  listDefaultLayerDescriptors,
  geometryTypeFromGeometry,
  buildLabelCandidates,
  isFeatureVisibleAtZoom,
  getAirspaceStyle,
  getAirwayStyle,
  getAirportStyle,
  getWaypointStyle,
  getRunwayStyle,
  getProcedureStyle,
  getLabelRule,
  getChartStyleToken
} from "./cartography/index.js";

export {
  isAirspaceFeature,
  extractAirspaceInspection,
  renderAirspaceInspectionHtml
} from "./debug/airspace-inspector.js";

export {
  extractArcCenters,
  extractSegmentPoints,
  computeGeometryStats
} from "./debug/geometry-debug-overlay.js";
