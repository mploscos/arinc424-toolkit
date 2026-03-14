# @arinc424/analysis

Analysis and inspection helpers for ARINC canonical and feature models.

## Scope

`@arinc424/analysis` sits above `@arinc424/core` and `@arinc424/features`.
It provides dataset summaries, entity inspection, and query helpers.
It does not render maps or generate tiles.

## API

- `summarizeDataset(canonicalModel)`
- `summarizeFeatures(featureModel)`
- `inspectAirspace(canonicalModel, idOrToken)`
- `inspectAirport(canonicalModel, idOrToken)`
- `inspectWaypoint(canonicalModel, idOrToken)`
- `queryEntities(model, filters)`
- `buildLookups(canonicalModel)`

## Example

```js
import { summarizeDataset, inspectAirport, queryEntities } from "@arinc424/analysis";

const summary = summarizeDataset(canonical);
const airport = inspectAirport(canonical, "KJFK");
const airspaces = queryEntities(canonical, { layer: "airspaces" });
```
