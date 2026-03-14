# Analysis Layer (`@arinc424/analysis`)

## Purpose

The analysis layer adds understanding/query capabilities on top of the existing pipeline:

- ARINC parsing and canonical generation (`@arinc424/core`)
- feature transformation (`@arinc424/features`)

It focuses on:

- dataset statistics
- structured entity inspection
- reusable query/filter helpers
- relation builders
- cross-entity consistency validation
- CLI analysis commands

It is not a rendering, tiling, or viewer layer.

## Public APIs

- `summarizeDataset(canonicalModel)`
- `summarizeFeatures(featureModel)`
- `inspectAirspace(canonicalModel, idOrToken)`
- `inspectAirport(canonicalModel, idOrToken)`
- `inspectWaypoint(canonicalModel, idOrToken)`
- `inspectProcedure(canonicalModel, idOrToken)`
- `queryEntities(model, options)`
- `queryRelated(canonicalModel, options)`
- `buildLookups(canonicalModel)`
- `buildRelations(canonicalModel)`
- `validateCrossEntityConsistency(canonicalModel)`

## CLI usage

- `arinc stats <canonical.json> [--json]`
- `arinc inspect-airspace <canonical.json> <id|token> [--json]`
- `arinc inspect-airport <canonical.json> <id|ident> [--json]`
- `arinc inspect-waypoint <canonical.json> <id|ident> [--json]`
- `arinc inspect-procedure <canonical.json> <id|token> [--json]`
- `arinc query <canonical-or-features.json> [--layer L] [--type T] [--id X] [--bbox minX,minY,maxX,maxY] [--prop k=v] [--limit N] [--json]`
- `arinc related <canonical.json> (--airport X | --runway X | --waypoint X | --airway X | --procedure X | --airspace X) --relation R [--json]`
- `arinc validate-relations <canonical.json> [--json]`

## Notes

- Outputs are deterministic and sorted by id.
- BBox filtering is approximate (envelope intersection).
- Inspectors return structured payloads and warnings for missing/partial data.
- Relation builders expose airport/runway/waypoint/airway/procedure/airspace links.
- Consistency checks detect missing cross-references and ambiguous ident usage.
