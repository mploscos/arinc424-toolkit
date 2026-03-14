# Cartography Preparation Layer

This project keeps three distinct levels:

1. Canonical model (`@arinc424/core`): ARINC domain truth.
2. Feature model (`@arinc424/features`): normalized geospatial features.
3. Cartography preparation (`@arinc424/view/cartography`): rendering hints for viewers.

The cartography layer is intentionally lightweight and viewer-oriented. It does not modify canonical or feature contracts.

## Phase 4C: Readability refinements

The goal is chart-like readability (not pixel-perfect FAA reproduction):

- clear visual hierarchy
- progressive detail by zoom
- label prioritization + declutter
- QA/debug overlays above operational symbology
- lower visual dominance from background airspaces
- stricter waypoint density control
- more restrained issue marker weight

Priority order used by viewers:

1. airspaces
2. airways
3. airports/runways
4. waypoints/navaids
5. procedures/holds
6. debug + QA issues

## Why this separation exists

- Feature model stays stable and renderer-agnostic.
- Viewer logic can evolve (styles, labels, zoom gating) without touching parsing/domain pipelines.
- Cartographic decisions are centralized instead of spread across viewer files.

## API

Main entrypoint:

```js
import { buildCartography } from "@arinc424/view";

const cartography = buildCartography(featureModel);
```

Output shape:

```json
{
  "layers": [
    {
      "name": "airspaces",
      "geometryType": "polygon",
      "bounds": [-10, 35, 5, 45],
      "featureCount": 120,
      "minZoom": 4,
      "maxZoom": 12,
      "styleHint": "airspace"
    }
  ],
  "labelCandidates": [],
  "bounds": [-10, 35, 5, 45]
}
```

Related modules:

- `packages/view/src/cartography/build-cartography.js`
- `packages/view/src/cartography/layer-descriptors.js`
- `packages/view/src/cartography/label-candidates.js`
- `packages/view/src/cartography/style-system.js`

`style-system.js` provides reusable rules:

- `isFeatureVisibleAtZoom()`
- `getAirspaceStyle()`
- `getAirwayStyle()`
- `getAirportStyle()`
- `getWaypointStyle()`
- `getRunwayStyle()`
- `getProcedureStyle()`
- `getLabelRule()`
- `getChartStyleToken()`

## Viewer usage

OpenLayers viewer consumes cartography descriptors for:

- layer style hint (`styleHint`)
- geometry semantics (`geometryType`)
- zoom visibility (`minZoom`/`maxZoom`)
- label rules (candidate fields + min zoom)

Chart-like zoom behavior (approximate):

- zoom 4-6: major airspaces + major airports + selected airways
- zoom 7-9: more airways/airports + early labels
- zoom 10-12: runways + waypoints + smaller airspaces
- zoom 13+: procedures and full detail

The exact threshold may vary by feature `importance`/classification when present.

Phase 4C refinements:

- airspace fills are lighter; borders carry more of the shape definition
- smaller airspaces appear later than major ones
- waypoint symbols appear before waypoint labels
- waypoint labels are delayed to reduce clutter
- issue markers remain visible but smaller than airport symbols
- basemap can be muted so ARINC overlays read more clearly over OSM

The viewer can build descriptors:

- directly from a full feature model, or
- from `tiles/index.json` metadata (`layers`, bounds, zooms) when only tiled output is available.

## Simplification and tile strategy

`@arinc424/tiles` supports optional zoom-dependent simplification:

```js
generateTiles(featureModel, {
  outDir: "./tiles",
  minZoom: 4,
  maxZoom: 10,
  simplify: true,
  simplifyToleranceByZoom: {
    4: 0.1,
    6: 0.01,
    8: 0.001
  }
});
```

Notes:

- Douglas–Peucker simplification (pure JS).
- Existing `simplifyTolerance` option is still accepted as alias.
- Sparse tile outputs are supported; viewers treat missing tiles as empty.
- If `tiles/index.json` exposes `availableTiles`, viewer requests only existing tiles.

## Label strategy

Labels are prioritized in cartography metadata:

- major airspaces/restricted: highest priority
- airports: high
- major airways: medium
- waypoints/navaids: lower, shown later

Viewers apply halo/outline and rely on declutter to avoid overlap.

## Basemap treatment

Both viewers support:

- `?basemap=muted` (default)
- `?basemap=standard`

`muted` keeps OSM for context but lowers its visual competition:

- OpenLayers: grayscale/saturation/contrast/brightness filter on the base layer
- Cesium: lower imagery saturation/contrast, slightly higher brightness, lower alpha

## Debug mode

OpenLayers (`?debug=1`):

- tile request/load/error logs
- tile boundary overlay
- per-tile feature count labels
- stronger airspace boundary highlight
- airspace click inspector panel with:
  - id
  - class/type
  - lower/upper limits
  - sourceRefs
  - boundary segment types (if present)
  - validation warnings (if present)
  - reconstruction metadata (if present)
- toggle controls:
  - airspace inspector
  - arc centers
  - segment points
  - tile grid

Cesium (`?debug=1`):

- index resolution traces
- bounds-fit fallback traces
- tileset load summary logs
