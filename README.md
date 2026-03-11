# arinc424-toolkit (Workspace Monorepo)

Modular Node.js platform for ARINC 424 ingestion, canonical normalization, feature transformation, pure-JS tiling, and Cesium 3D tile generation.

## Packages

- `@arinc/core`: ARINC parsing + canonical model
- `@arinc/features`: canonical -> feature model
- `@arinc/tiles`: grouped GeoJSON + `z/x/y.json` tiling + manifest
- `@arinc/3dtiles`: 3D tiles build pipeline driven by feature model input
- `@arinc/view`: OpenLayers/Cesium adapters and examples

## Workspace commands

```bash
npm install
npm test
```

## CLI

```bash
arinc parse <input.dat> <canonical.json>
arinc features <canonical.json> <features.json>
arinc tiles <features.json> <outDir> [--min-zoom N --max-zoom N]
arinc 3dtiles <features.json> <outDir>
```

## Architecture Overview

```text
ARINC424 -> @arinc/core -> canonical model
          -> @arinc/features -> feature model
          -> @arinc/tiles -> layers + clipped tiles + manifest
          -> @arinc/3dtiles -> 3D tiles artifacts
          -> @arinc/view -> demo adapters/viewers
```

Dependency direction:

- `core` -> none
- `features` -> `core`
- `tiles` -> `features`
- `3dtiles` -> `features`
- `view` -> consumes outputs

## Current scope notes

- `@arinc/tiles` implements tile indexing + basic geometry clipping.
- Geometry simplification remains limited and is tracked as follow-up work.


## Quality Commands

```bash
npm test
npm run test:golden
npm run test:smoke
npm run bench
npm run update:golden
```

See `docs/testing.md` for details.
Cartography and styling notes: `docs/cartography.md`.
ARINC UC/UR airspace boundary reconstruction notes: `docs/arinc-airspace-geometry.md`.

## Release 0.1.0

Version `0.1.0` is the first public modular release with:

- workspace package boundaries (`core` -> `features` -> `tiles`/`3dtiles` -> `view`)
- contract-driven outputs (`canonical.json`, `features.json`, tile/3D tiles indexes)
- deterministic tests, goldens, and smoke checks
- index-driven viewers for OpenLayers and Cesium

For release details, see [CHANGELOG.md](./CHANGELOG.md).

## Large Dataset Validation

Use the integration runner to exercise the full pipeline on a large ARINC dataset (for example a full FAA CIFP file):

```bash
npm run dataset:run -- \
  --input /path/to/FAACIFP18.dat \
  --out ./artifacts/faacifp18 \
  --dataset FAACIFP18
```

Aliases:

- `npm run run:dataset -- ...`
- `npm run benchmark:dataset -- ...`

Stages executed:
- parse -> canonical
- canonical -> features
- features -> tiled GeoJSON
- features -> 3D Tiles

The run writes `report.json`, `report.md`, and `readme-snippet.md` in the output directory.
It also writes a unified visualization contract:
- `visualization.index.json`
- `tiles/index.json`
- `3dtiles/index.json`

Viewers in `@arinc/view` can load the whole dataset using:
- OpenLayers: `openlayers-tiles/?index=/data/visualization.index.json`
- Cesium: `cesium-3dtiles/?index=/data/visualization.index.json`

Treat resulting timings/sizes as reference metrics for one machine/configuration, not universal guarantees.

See `docs/large-dataset.md` for full details.

## Visual Reference (OpenLayers + Cesium)

2D tiled GeoJSON (OpenLayers):

![OpenLayers Washington dataset](./docs/Washington.png)

3D Tiles (Cesium):

![Cesium Washington dataset](./docs/Washington3d.png)
