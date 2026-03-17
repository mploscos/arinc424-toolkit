# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

### Added
- Phase 3B analysis extensions in `@arinc424/analysis`:
  - relation builders (`buildRelations`, airport/runway/airway/procedure/airspace helpers)
  - cross-entity consistency validation (`validateCrossEntityConsistency`)
  - relational query helper (`queryRelated`)
  - procedure inspector (`inspectProcedure`)
- Phase 4A visual QA foundation:
  - analysis issue feature builder (`buildIssueFeatures`)
  - dataset runner QA outputs (`analysis/consistency.json`, `analysis/issues.geojson`)
  - viewer QA controls/layers for OpenLayers and Cesium (toggle/filter/stats/inspector)
  - new viewer QA documentation (`docs/view-debug.md`)
- Phase 4B chart-like cartography:
  - centralized cartography style system (`packages/view/src/cartography/style-system.js`)
  - zoom-dependent visual hierarchy and label prioritization rules
  - OpenLayers issue click -> related area highlight + recenter
  - Cesium issue click -> selection highlight + bbox/point zoom
- New CLI commands:
  - `arinc inspect-procedure`
  - `arinc procedure-geometry`
  - `arinc related`
  - `arinc validate-relations`
- New package: `@arinc424/procedures`
  - incremental Attachment 5 leg decoding and geometry helpers
  - supported path terminators: `IF`, `TF`, `CF`, `DF`, `RF`, `AF`
  - unsupported path terminators preserved explicitly in metadata/warnings

### Changed
- Airport/waypoint/airspace inspectors now include richer relation metadata.
- Analysis docs and README updated for relation/coherence workflows.
- README/viewer docs updated for index-driven QA issue rendering.
- Cartography docs updated with chart-like hierarchy/zoom strategy details.
- Phase 4C cartography readability refinements:
  - lighter airspace fills and stronger boundary-led definition
  - waypoint symbol/label density reduced at low-medium zoom
  - label priority tuned to favor airspaces over airports, then airways, then waypoints
  - subtler airway casing
  - smaller persistent QA issue markers in 2D/3D viewers
  - muted basemap mode for OpenLayers/Cesium so ARINC overlays read more clearly

## 0.1.7 - 2026-03-17

Stabilization release focused on parser robustness, procedure correctness, charting controls, and viewer cleanup.

Improves Jeppesen compatibility without weakening validation, corrects `RF` radius scaling/arc construction, adds procedure-leg debug output, and stabilizes OpenLayers chart modes and high-zoom inspection.

### Changed
- Workspace package versions aligned to `0.1.7`.
- Canonical hold IDs now include the real differentiating fields required by Jeppesen `EP` records:
  - previous: `hold:<icao>:<region>:<fixId>:<duplicate>`
  - current: `hold:<icao>:<region>:<fixId>:<fixIcao>:<fixSection>:<duplicate>`
- README and procedure docs updated to reflect `0.1.7` as the current release.
- OpenLayers now exposes explicit chart modes:
  - `ENROUTE`
  - `TERMINAL`
  - `PROCEDURE`
- Terminal and procedure chart modes now apply bbox-based spatial focus to suppress distant clutter.
- High zoom behavior in OpenLayers was simplified:
  - normal ARINC tiled layer up to tile max zoom
  - explicit inspection vector layer above tile max zoom
  - removed overlapping fallback strategies

### Fixed
- Resolved a real duplicate-ID failure in Jeppesen `EP` hold parsing where valid records shared `region`, `duplicate`, and `fixId` but differed by `fixIcao` / `fixSection`.
- Corrected `RF` arc radius scaling:
  - previous: `arcRadiusRaw / 10`
  - current: `arcRadiusRaw / 1000`
  - example: `"002070"` -> `2.070 NM`
- Corrected `RF` arc generation so start/end radii and curvature match the intended local geometry instead of producing oversized arcs.
- Added `analysis/procedure-legs.geojson` as a per-leg debug artifact for procedure inspection.
- Improved OpenLayers stability for procedure/debug inspection at high zoom without regenerating a deeper tile pyramid.
- Preserved strict parser guarantees:
  - no silent record dropping
  - no global validation weakening
  - no speculative canonical ID expansion beyond the proven collision case
- Confirmed successful full-dataset runs for:
  - FAA CIFP
  - Jeppesen

## 0.1.6 - 2026-03-14

Attachment 5 Phase 2.

Adds `RF` and `AF` arc-leg support to the procedure geometry engine.
Extends the incremental Attachment 5 surface without changing existing behavior for `IF`, `TF`, `CF`, and `DF`.
Arc geometry is validated and rendered through the existing viewer pipeline.

### Added
- Attachment 5 Phase 2 release surface:
  - `RF` support (constant-radius arc between fixes)
  - `AF` support (arc-to-fix / DME-style arc)
  - reusable arc interpolation utilities in `@arinc424/procedures`
  - continuity/radius warnings for arc legs when geometry is inconsistent

### Changed
- Workspace package versions aligned to `0.1.6`.
- `@arinc424/procedures` now preserves and uses center/radius metadata for supported arc legs.
- Documentation and roadmap updated for incremental `RF` / `AF` support.

## 0.1.5 - 2026-03-14

Attachment 5 Phase 1.

Introduces initial ARINC 424 Path & Terminator support with `IF`, `TF`, `CF`, and `DF` legs.
Adds a lightweight procedure geometry engine and integrates procedures into the viewer.
This release establishes the foundation for incremental Attachment 5 support.

### Added
- Phase 3B analysis release surface:
  - relation builders and lookup helpers
  - cross-entity consistency validation
  - `inspect-procedure`
  - relational CLI commands (`related`, `validate-relations`)
- Phase 4A visual QA layer:
  - `analysis/issues.geojson`
  - QA controls and issue inspection in OpenLayers/Cesium
- Phase 4B/4C viewer refinements:
  - chart-like cartography rules
  - zoom-aware label hierarchy and declutter
  - muted basemap mode
- Attachment 5 Phase 1 release surface:
  - `@arinc424/procedures`
  - minimal CLI entrypoint `arinc procedure-geometry`
  - phase 1 support for `IF`, `TF`, `CF`, `DF`
  - unsupported leg types preserved explicitly rather than silently approximated

### Changed
- Workspace package versions aligned to `0.1.5`.
- Viewer documentation aligned to current `/artifacts/<dataset>/visualization.index.json` workflow.
- `@arinc424/toolkit` now re-exports the public `@arinc424/view` helpers.
- `@arinc424/toolkit` now re-exports `@arinc424/procedures`.

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
