# Cartography Preparation Layer

This project keeps three distinct levels:

1. Canonical model (`@arinc424/core`): ARINC domain truth.
2. Feature model (`@arinc424/features`): normalized geospatial features.
3. Cartography preparation (`@arinc424/view/cartography`): rendering hints for viewers.

The cartography layer is intentionally lightweight and viewer-oriented. It does not modify canonical or feature contracts.

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

## Viewer usage

OpenLayers viewer consumes cartography descriptors for:

- layer style hint (`styleHint`)
- geometry semantics (`geometryType`)
- zoom visibility (`minZoom`/`maxZoom`)
- label rules (candidate fields + min zoom)

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
