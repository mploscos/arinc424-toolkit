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
- `visualization.index.json` with `outputs.qa`

3. Viewers load `visualization.index.json` and then resolve QA assets from `outputs.qa`.

Recommended viewer workflow:

- Prefer direct URL loading from `/artifacts/<dataset>/visualization.index.json`
- Or use **Select visualization.index.json** so the viewer resolves the served artifact URL automatically
- If automatic resolution fails, paste the `/artifacts/<dataset>/visualization.index.json` URL manually

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

## Notes

- QA rendering is non-blocking. Core 2D/3D dataset rendering continues even if QA files are missing.
- Missing QA files are treated as "no issue layer available" (not fatal).
- OpenLayers tile `404` remains treated as empty tile to support sparse pyramids.
- Related-entity highlight is currently bbox/point oriented. It does not yet perform deep semantic matching against all rendered entities.
