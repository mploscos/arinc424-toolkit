# Large Dataset Integration Run

This project includes a large-dataset integration runner to exercise the full pure-Node pipeline on a real ARINC file (for example a full FAA CIFP distribution).

Purpose:

- validate end-to-end behavior on realistic input size
- capture stage timings and output sizes
- generate machine-readable and human-readable reports
- provide reference metrics for one machine/configuration

These metrics are reference values, not universal guarantees.

## Run dataset pipeline

```bash
npm run dataset:run -- \
  --input /path/to/FAACIFP18.dat \
  --out ./artifacts/test \
  --dataset TEST
```

Aliases:

- `npm run run:dataset -- ...`
- `npm run benchmark:dataset -- ...`

Optional flags:

- `--skip-tiles`
- `--skip-3dtiles`
- `--min-zoom <n>`
- `--max-zoom <n>`
- `--report-name <name>`

## Stages exercised

1. ARINC424 -> canonical model (`@arinc/core`)
2. canonical -> feature model (`@arinc/features`)
3. feature model -> tiled GeoJSON (`@arinc/tiles`)
4. feature model -> 3D Tiles (`@arinc/3dtiles`)

## Generated outputs

For output directory `./artifacts/test`:

- `canonical.json`
- `features.json`
- `visualization.index.json`
- `tiles/` (unless `--skip-tiles`)
  - `manifest.json`
  - `index.json`
- `3dtiles/` (unless `--skip-3dtiles` or no 3D-eligible features)
  - `tileset.json`
  - `index.json`
- `<report-name>.json` (default: `report.json`)
- `<report-name>.md` (default: `report.md`)
- `readme-snippet.md`

## Visual inspection

### OpenLayers (2D tiles)

```bash
npm run examples
# open http://localhost:8080/openlayers-tiles/
```

`npm run examples` serves `packages/view/examples` and mounts:
- `/data` -> `<repo>/data`
- `/artifacts` -> `<repo>/artifacts`

Preferred URL:

`http://localhost:8080/openlayers-tiles/?index=/data/visualization.index.json`

Alternative direct URL:

`http://localhost:8080/openlayers-tiles/?index=/data/tiles/index.json`

You can also use viewer buttons **Select tiles folder** / **Select index JSON** for local file inspection.

### Cesium (3D Tiles)

```bash
npm run examples
# open http://localhost:8080/cesium-3dtiles/
```

Preferred URL:

`http://localhost:8080/cesium-3dtiles/?index=/data/visualization.index.json`

Alternative direct URL:

`http://localhost:8080/cesium-3dtiles/?index=/data/3dtiles/index.json`

You can also use **Select 3dtiles folder** or **Select index JSON** from the UI.

## Report contents

`report.json` and `report.md` include:

- run metadata and environment
- per-stage duration (ms)
- canonical entity counts
- feature counts by layer
- tile metrics (count, sizes, zoom-level distribution)
- 3D tiles metrics (emitted files, tileset.json size, top-level summary)
- overall total duration

If a stage is skipped, report entries include `skipped: true` and reason.
