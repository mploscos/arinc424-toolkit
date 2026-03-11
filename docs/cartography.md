# Cartography Notes

This project uses a pure Node.js tiling + OpenLayers rendering flow.

## Geometry Simplification (`@arinc/tiles`)

`generateTiles()` supports optional per-zoom simplification:

```js
generateTiles(featureModel, {
  outDir: "./tiles",
  minZoom: 4,
  maxZoom: 10,
  simplify: true,
  simplifyTolerance: {
    4: 0.1,
    6: 0.01,
    8: 0.001
  }
});
```

Behavior:

- Simplification runs after clipping per tile.
- Douglas–Peucker is used (pure JS implementation).
- Polygon rings stay closed after simplification.
- If simplification would collapse geometry, original clipped geometry is kept or the feature is dropped safely.

Defaults:

- `simplify: false`
- `simplifyTolerance` default map:
  - `4: 0.1`
  - `6: 0.01`
  - `8: 0.001`

## Layer Styling (`@arinc/view` OpenLayers example)

The viewer styles by `feature.properties.layer` (injected by the tiler), not only by entity type.

Main visual rules:

- `airports` / `heliports`: point symbols
- `runways`: thick dark line
- `waypoints`: small green point
- `airways`: orange lines
- `airspaces`: blue translucent fills + outlines
- `procedures` / `holds`: dashed route styles

Restricted airspace records use a dashed purple variant when `restrictiveType` is present.

## Labels (Optional)

OpenLayers labels are enabled by default for:

- airports
- airspaces
- waypoints

Label source fields:

- `name`
- `ident`
- fallback `id`

Label visibility:

- default `zoom >= 7`
- override via query param: `?labelsMinZoom=8`
- disable labels with: `?labels=0`

## Sparse Tile Behavior

Tile outputs are sparse by design (`z/x/y.json` only for tiles with data).

Viewer behavior:

- 404 tile responses are treated as empty tiles.
- Non-404 errors are logged as true load errors.
- Debug logging can be enabled with `?debug=1`.
