# Architecture

## Contracts

- Canonical contract: `navdata-canonical@1.0.0`
- Feature contract: `arinc-feature-model@1.0.0`

Both contracts are runtime-validated in their respective packages.

## Package responsibilities

- `@arinc/core`: parse/normalize/validate ARINC into canonical model
- `@arinc/features`: canonical-to-feature conversion and per-layer contract validation
- `@arinc/tiles`: 2D output (layered GeoJSON and clipped tiled GeoJSON)
- `@arinc/3dtiles`: feature-model driven 3D output
- `@arinc/view`: visualization adapters/examples only
