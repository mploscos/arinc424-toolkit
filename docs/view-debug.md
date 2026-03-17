# Visual QA Tools

Phase 4A adds a lightweight visual QA layer on top of the analysis consistency checks.

## Purpose

Render analysis issues directly in the viewers so dataset problems are visible on map/scene:

- cross-entity inconsistencies
- unresolved references
- ambiguous identifiers
- relation warnings

The analysis layer remains the source of truth (`@arinc424/analysis`).

## Data flow

1. Generate artifacts with dataset runner:

```bash
npm run dataset:run -- \
  --input /path/to/FAACIFP18.dat \
  --out ./artifacts/faacifp18 \
  --dataset FAACIFP18
```

2. Runner writes:

- `analysis/consistency.json`
- `analysis/issues.geojson`
- `analysis/procedure-legs.geojson` only if `--with-procedure-legs` is explicitly enabled
- `visualization.index.json` with `outputs.qa`

`procedure-legs.geojson` is a debug artifact for Path Terminator inspection. For large datasets it should usually be generated selectively with filters such as `--procedure-legs-airport`, `--procedure-legs-type`, and `--procedure-legs-limit`.

3. Viewers load `visualization.index.json` and then resolve QA assets from `outputs.qa`.
   If procedure-leg debug output was generated, the same index also exposes `outputs.debug.procedureLegs`.
   If that debug entry is absent, OpenLayers keeps the normal aggregated procedure layer and does not try to fake per-leg debug styling.

Recommended viewer workflow:

- Prefer direct URL loading from `/artifacts/<dataset>/visualization.index.json`
- Or use **Select visualization.index.json** so the viewer resolves the served artifact URL automatically
- If automatic resolution fails, paste the `/artifacts/<dataset>/visualization.index.json` URL manually

Viewer roles:

- OpenLayers: 2D chart-style viewer for procedures, tiled GeoJSON inspection, and debug overlays
- Cesium: 3D airspace / volume viewer with lightweight QA issue visualization

## OpenLayers QA Layer

In `openlayers-tiles`:

- Toggle: `show issues`
- Filters: `severity`, `type`
- Stats: total/errors/warnings
- Click issue marker to open issue panel
- Click issue marker also highlights related entity area (bbox-based) and recenters when needed

Severity styling:

- `error`: red marker
- `warning`: orange marker

## Cesium QA Layer

In `cesium-3dtiles`:

- Toggle: `show issues`
- Filters: `severity`, `type`
- Stats: total/errors/warnings
- Click issue point to open issue panel
- Click issue point highlights selected issue and zooms to related bbox/point

Severity styling:

- `error`: red point
- `warning`: orange point

Cesium intentionally does not render the dense generic procedure polyline overlay anymore.
That responsibility stays in OpenLayers, where 2D chart-style filtering and procedure inspection are more useful and cheaper to render.

Future direction:

- selected procedures may later be represented in Cesium as higher-value 3D forms such as ribbons/corridors
- dense generic procedure polylines are intentionally avoided in the 3D viewer

## Notes

- QA rendering is non-blocking. Core 2D/3D dataset rendering continues even if QA files are missing.
- Missing QA files are treated as "no issue layer available" (not fatal).
- OpenLayers tile `404` remains treated as empty tile to support sparse pyramids.
- Related-entity highlight is currently bbox/point oriented. It does not yet perform deep semantic matching against all rendered entities.
