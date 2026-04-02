# Viewer Debug Notes

The example viewers no longer render analysis issue overlays. Visual QA stays in `@arinc424/analysis`; the viewers focus on tiled data, procedures, and geometry/debug inspection.

## Recommended workflow

1. Generate a dataset:

```bash
npm run dataset:run -- \
  --input /path/to/FAACIFP18.dat \
  --out ./artifacts/faacifp18 \
  --dataset FAACIFP18
```

2. Open a viewer and load `visualization.index.json`.

3. Use query params when needed:

- `?index=/data/<folder>/visualization.index.json`
- `&debug=1`
- `&basemap=muted` or `&basemap=standard`

## OpenLayers

`openlayers-tiles` is the primary 2D inspection surface.

With `&debug=1` enabled it exposes:

- airspace click inspector
- tile boundary overlay
- per-tile feature counts
- arc center and segment point overlays
- procedure-leg debug styling when `analysis/procedure-legs.geojson` is present
- request/load counters in the status panel

If the procedure-leg debug artifact is absent, OpenLayers keeps the normal aggregated procedure layer and skips the per-leg overlay.

## Cesium

`cesium-3dtiles` stays focused on 3D airspaces and volumes.

With `&debug=1` enabled it exposes:

- index load traces
- tileset load traces
- bounds/zoom diagnostics in the console

Cesium intentionally does not render dense 2D procedure overlays. That work stays in OpenLayers, where chart-style inspection is more useful.

## Notes

- OpenLayers tile `404` is still treated as an empty tile so sparse pyramids remain usable.
- Missing optional debug artifacts are non-fatal.
- Analysis outputs can still be generated for offline validation even though the viewers no longer render issue markers.
