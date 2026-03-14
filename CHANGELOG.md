# Changelog

All notable changes to this project will be documented in this file.

## 0.1.0 - 2026-03-11

### Added
- Workspace monorepo architecture with npm workspaces:
  - `@arinc424/core`
  - `@arinc424/features`
  - `@arinc424/tiles`
  - `@arinc424/3dtiles`
  - `@arinc424/view`
- End-to-end pipeline:
  - ARINC424 -> canonical model
  - canonical -> feature model
  - feature model -> tiled GeoJSON
  - feature model -> 3D Tiles
- Unified visualization contract:
  - `visualization.index.json`
  - `tiles/index.json`
  - `3dtiles/index.json`
- OpenLayers viewer for sparse tiled GeoJSON.
- Cesium viewer for 3D Tiles with index-driven loading.
- Regression, golden, smoke, and determinism tests.
- Large-dataset integration runner with JSON/Markdown reports.

### Changed
- Removed legacy monolithic runtime from active release surface.
- Strengthened schema validation enforcement in core/features contracts.
- Improved deterministic ordering and serialization behavior.
- Improved airspace reconstruction/validation for UC/UR geometry handling.
- Improved tiles pipeline clipping and zoom-aware cartographic behavior.

### Notes
- Performance metrics are reference-machine measurements and not universal guarantees.
- Archived legacy code remains for reference only and is unsupported.
