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
