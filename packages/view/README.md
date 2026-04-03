# @arinc424/view

Visualization adapters and examples for inspecting pipeline outputs.

## Cartography Preparation

- `packages/view/src/cartography/`
  - `buildCartography(featureModel)` builds rendering-oriented descriptors (layer grouping, style hints, label candidates, zoom ranges, bounds).
  - Keeps feature contracts unchanged while letting viewer behavior evolve independently.
- `packages/view/src/procedures/`
  - `buildProcedureRenderModel(procedureResult, options)` adapts normalized `@arinc424/procedures` output into renderable procedure features.
  - `filterProcedureLegs(procedureResult, options)` filters by aircraft category, branch, semantic class, and depiction class.
  - `procedureLegToOpenLayersFeature(leg, options)` emits OpenLayers-ready GeoJSON using `depictionGeometry` first and `legacyGeometry` only as fallback.
- `packages/view/src/debug/`
  - `airspace-inspector.js` and `geometry-debug-overlay.js` for developer inspection overlays.

## Examples

- `packages/view/examples/openlayers-tiles/`
  - 2D viewer for tiled GeoJSON using `visualization.index.json` or `tiles/index.json`.
- `packages/view/examples/cesium-3dtiles/`
  - 3D viewer for Cesium 3D Tiles using `visualization.index.json` or `3dtiles/index.json`.

Legacy example entry files (`openlayers.html`, `cesium.html`) now redirect to these updated examples.


Entry index: `packages/view/examples/index.html`
