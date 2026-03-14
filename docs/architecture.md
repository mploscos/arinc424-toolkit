# Architecture

## Contracts

- Canonical contract: `navdata-canonical@1.0.0`
- Feature contract: `arinc-feature-model@1.0.0`

Both contracts are runtime-validated in their respective packages.

## Package responsibilities

- `@arinc424/toolkit`: convenience metapackage that re-exports the modular APIs
- `@arinc424/core`: parse/normalize/validate ARINC into canonical model
- `@arinc424/features`: canonical-to-feature conversion and per-layer contract validation
- `@arinc424/tiles`: 2D output (layered GeoJSON and clipped tiled GeoJSON)
- `@arinc424/3dtiles`: feature-model driven 3D output
- `@arinc424/view`: visualization adapters/examples only
