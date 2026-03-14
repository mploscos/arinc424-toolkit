# Changelog

All notable changes to this project will be documented in this file.

## 0.1.4 - 2026-03-14

### Added
- Phase 3A analysis layer publicly released:
  - `@arinc424/analysis` package
  - CLI analysis commands (`stats`, `inspect-airspace`, `inspect-airport`, `inspect-waypoint`, `query`)
  - analysis docs (`docs/analysis.md`, package README)

### Changed
- Workspace package versions aligned to `0.1.4`.
- Internal workspace dependency versions aligned to `0.1.4`.
- Root README/testing references aligned to release `0.1.4`.

## 0.1.3 - 2026-03-14

### Added
- OpenLayers debug inspector modules for airspace inspection and geometry overlays.
- Cartography preparation modules for viewer-side layer/style/label descriptors.
- New workspace package: `@arinc424/analysis` (Phase 3A).
  - dataset summaries for canonical and feature models
  - entity inspectors (`airspace`, `airport`, `waypoint`)
  - query/filter helpers (`layer`, `type`, `id`, `bbox`, property match)
  - relation lookup helpers
- New CLI analysis commands:
  - `arinc stats`
  - `arinc inspect-airspace`
  - `arinc inspect-airport`
  - `arinc inspect-waypoint`
  - `arinc query`
- New analysis documentation:
  - `packages/analysis/README.md`
  - `docs/analysis.md`

### Changed
- Workspace package versions aligned to `0.1.3`.
- Internal workspace dependency versions aligned to `0.1.3`.
- OpenLayers example now resolves all imports from example-local modules (static-server friendly).
- OpenLayers tile loading reliability improved:
  - sparse tile handling with `404` as empty tile
  - fixed VectorTile loader flow for GeoJSON tiles
  - continued support for index-driven loading (`visualization.index.json` / `tiles/index.json`)
- Cesium example kept aligned with index-driven loading (`visualization.index.json` / `3dtiles/index.json`) and OSM base layer behavior.
- README/testing docs aligned for release `0.1.3`.

## 0.1.2 - 2026-03-14

### Added
- New convenience metapackage: `@arinc424/toolkit`.
- npm install guidance for single-package (`toolkit`) and modular installs.

### Changed
- Workspace package versions aligned to `0.1.2`.
- Internal workspace dependency versions aligned to `0.1.2`.
- Documentation alignment for release `0.1.2`.

## 0.1.1 - 2026-03-14

### Changed
- Updated npm package metadata (`repository`, `homepage`, `bugs`, `files`, `keywords`) across workspace packages.
- Standardized package scope to `@arinc424/*` in code, docs, and manifests.
- Documentation alignment for release/version references.

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
