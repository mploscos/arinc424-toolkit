# Procedures / Attachment 5

`@arinc424/procedures` introduces an incremental implementation of ARINC 424 Attachment 5.

## Current support

Supported path terminators:

- `IF`
- `TF`
- `CF`
- `DF`
- `RF`
- `AF`
- `CA`
- `FA`
- `VA`
- `VI`
- `VM`
- `FM`
- `HA`
- `HF`
- `HM`

Other path terminators are still incremental:

- detected
- preserved in output metadata
- either modeled as open legs / holds / unsupported
- never silently rendered as something else

## Public API

- `decodeProcedureLegs(canonicalModel, procedureId)`
- `buildProcedureGeometry(canonicalModel, procedureId)`
- `validateProcedureLegSequence(canonicalModel, procedureId)`

## Output shape

```json
{
  "procedureId": "procedure:PD:US:KPRC:PRC1:1:RW04",
  "routeType": "PD",
  "transitionId": "RW04",
  "applicability": {
    "aircraftCategories": null,
    "aircraftTypes": null,
    "operationTypes": null
  },
  "commonLegs": [
    {
      "index": 0,
      "pathTerminator": "IF",
      "supported": true,
      "semanticClass": "if",
      "geometryKind": "point",
      "depictionClass": "chart-point",
      "semanticGeometry": {
        "geometry": { "type": "Point", "coordinates": [-72.8, 40.5] }
      },
      "depictionGeometry": {
        "geometry": { "type": "Point", "coordinates": [-72.8, 40.5] }
      },
      "legacyGeometry": { "type": "Point", "coordinates": [-72.8, 40.5] },
      "metadata": {}
    }
  ],
  "branches": [],
  "geometry": { "type": "MultiLineString", "coordinates": [] },
  "warnings": []
}
```

## Current interpretation notes

- `IF`: point semantic + point chart depiction
- `TF`: track semantic + chart line depiction
- `CF`: course semantic + chart line depiction; currently approximated as anchor-to-fix geometry
- `DF`: direct semantic + chart line depiction using practical anchor-to-fix geometry
- `RF`: arc semantic + chart arc depiction with explicit arc curve metadata and sampled compatibility geometry
- `AF`: arc semantic + chart arc depiction with explicit arc curve metadata and sampled compatibility geometry
- `CA` / `FA` / `VA` / `VI` / `VM` / `FM`: open-leg chart objects with explicit open-ended depiction metadata
- `HA` / `HF` / `HM`: hold chart objects with racetrack-style depiction and chart annotations
- applicability is modeled separately from geometry and can appear at procedure, branch, or leg level
- optional `branches` can carry category-specific or operation-specific route variants without duplicating shared `commonLegs`
- chained legs are checked for depiction continuity with a practical configurable tolerance

## Viewer flow

To see procedures in the OpenLayers example, generate the dataset with `--with-procedure-legs`.

The dataset then includes:

- `analysis/procedure-catalog.json`
- split per-procedure artifacts under `analysis/procedure-legs/`
- `visualization.index.json` with `outputs.procedures`

The OpenLayers example loads:

1. `procedure-catalog.json`
2. the selected chart family only
3. editorial marks derived from the loaded procedure legs

It does not load FAA-wide `features.json` or FAA-wide `procedure-legs.geojson` just to inspect procedures.
