# Procedures / Attachment 5

`@arinc424/procedures` introduces the first incremental implementation phase for ARINC 424 Attachment 5.

## Phase 1 scope (`0.1.5`)

Supported path terminators:

- `IF`
- `TF`
- `CF`
- `DF`

Unsupported path terminators are:

- detected
- preserved in output metadata
- marked as unsupported
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
  "legs": [
    {
      "index": 0,
      "pathTerminator": "IF",
      "supported": true,
      "geometry": { "type": "Point", "coordinates": [-72.8, 40.5] },
      "metadata": {}
    }
  ],
  "geometry": { "type": "MultiLineString", "coordinates": [] },
  "warnings": []
}
```

## Phase 1 interpretation notes

- `IF`: initial fix anchor
- `TF`: practical line between known fixes
- `CF`: terminates at fix, currently approximated as anchor-to-fix line with warning metadata
- `DF`: practical direct-to-fix line
- chained legs are checked for geometry continuity and reported with warnings if gaps are detected

## Roadmap direction

- `0.1.5`: Attachment 5 Phase 1 (`IF`, `TF`, `CF`, `DF`)
- `0.1.6`: `RF` / `AF` arc legs
- `0.1.7+`: additional leg types and richer procedure composition/debug output
- `0.2.0`: substantially completed Attachment 5 geometry engine
