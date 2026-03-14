# @arinc424/3dtiles

Cesium 3D Tiles builder package.

## API

- `build3DTilesFromFeatures(featureModel, options)`
- `build3DTilesFromLegacyLayers(options)` (compatibility adapter)

The public package contract is feature-model driven.

## Internal Pipeline Stages

The feature-driven builder is internally split into explicit stages:

1. `geometry/prepare-airspace-geometry.js`
2. `partition/spatial-partition.js`
3. `tileset/build-tileset.js`
4. `writer/write-tiles.js`

This keeps the current behavior while making future extensions (new entity types,
different partition strategies, additional tests) easier.
