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
- `--with-procedure-legs`
- `--procedure-legs-airport <ident>`
- `--procedure-legs-type <SID|STAR|APPROACH>`
- `--procedure-legs-limit <n>`
- `--min-zoom <n>`
- `--max-zoom <n>`
- `--report-name <name>`

`procedure-legs.geojson` is a debug artifact for Path Terminator inspection and is intentionally disabled by default for large datasets.
Enable it selectively, for example:

```bash
npm run dataset:run -- \
  --input /path/to/FAACIFP18.dat \
  --out ./artifacts/test \
  --dataset TEST \
  --with-procedure-legs \
  --procedure-legs-airport KJFK \
  --procedure-legs-type APPROACH \
  --procedure-legs-limit 25
```

## Stages exercised

1. ARINC424 -> canonical model (`@arinc424/core`)
2. canonical -> feature model (`@arinc424/features`)
3. feature model -> tiled GeoJSON (`@arinc424/tiles`)
4. feature model -> 3D Tiles (`@arinc424/3dtiles`)

## Generated outputs

For output directory `./artifacts/test`:

- `canonical.json`
- `features.json`
- `visualization.index.json`
- `tiles/` (unless `--skip-tiles`)
  - `manifest.json`
  - `index.json`
    - includes `tileTemplate`, bounds, and `availableTiles` (sparse tile list)
- `3dtiles/` (unless `--skip-3dtiles` or no 3D-eligible features)
  - `tileset.json`
  - `index.json`
- `analysis/`
  - `consistency.json`
  - `issues.geojson`
  - `procedure-legs.geojson` only when `--with-procedure-legs`
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

`http://localhost:8080/openlayers-tiles/?index=/artifacts/<dataset>/visualization.index.json`

Alternative direct URL:

`http://localhost:8080/openlayers-tiles/?index=/artifacts/<dataset>/tiles/index.json`

You can also use the viewer button **Select visualization.index.json**.

### Cesium (3D Tiles)

```bash
npm run examples
# open http://localhost:8080/cesium-3dtiles/
```

Preferred URL:

`http://localhost:8080/cesium-3dtiles/?index=/artifacts/<dataset>/visualization.index.json`

Alternative direct URL:

`http://localhost:8080/cesium-3dtiles/?index=/artifacts/<dataset>/3dtiles/index.json`

You can also use the viewer button **Select visualization.index.json**.

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
