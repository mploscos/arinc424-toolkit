# Analysis Layer (`@arinc424/analysis`)

## Purpose

The analysis layer adds understanding/query capabilities on top of the existing pipeline:

- ARINC parsing and canonical generation (`@arinc424/core`)
- feature transformation (`@arinc424/features`)

It focuses on:

- dataset statistics
- structured entity inspection
- reusable query/filter helpers
- CLI analysis commands

It is not a rendering, tiling, or viewer layer.

## Public APIs

- `summarizeDataset(canonicalModel)`
- `summarizeFeatures(featureModel)`
- `inspectAirspace(canonicalModel, idOrToken)`
- `inspectAirport(canonicalModel, idOrToken)`
- `inspectWaypoint(canonicalModel, idOrToken)`
- `queryEntities(model, options)`

## CLI usage

- `arinc stats <canonical.json> [--json]`
- `arinc inspect-airspace <canonical.json> <id|token> [--json]`
- `arinc inspect-airport <canonical.json> <id|ident> [--json]`
- `arinc inspect-waypoint <canonical.json> <id|ident> [--json]`
- `arinc query <canonical-or-features.json> [--layer L] [--type T] [--id X] [--bbox minX,minY,maxX,maxY] [--prop k=v] [--limit N] [--json]`

## Notes

- Outputs are deterministic and sorted by id.
- BBox filtering is approximate (envelope intersection).
- Inspectors return structured payloads and warnings for missing/partial data.
