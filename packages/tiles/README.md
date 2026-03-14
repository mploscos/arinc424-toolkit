# @arinc424/tiles

Pure Node.js tiling package.

## API

- `buildGeoJSONLayers(featureModel, { outDir })`
- `generateTiles(featureModel, { outDir, minZoom, maxZoom, generatedAt, simplify, simplifyTolerance })`
- `writeTileManifest(manifest, outFile)`

## Notes

- Tile output includes basic geometry clipping.
- Optional per-zoom geometry simplification is available (Douglas–Peucker, pure JS).
- Default simplification tolerances:
  - zoom `4-5`: `0.1`
  - zoom `6-7`: `0.01`
  - zoom `8+`: `0.001`
- Example:

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
