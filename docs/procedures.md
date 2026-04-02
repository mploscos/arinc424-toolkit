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

## Current interpretation notes

- `IF`: initial fix anchor
- `TF`: practical line between known fixes
- `CF`: terminates at fix, currently approximated as anchor-to-fix line with warning metadata
- `DF`: practical direct-to-fix line
- `RF`: constant-radius arc between fixes, built from center + radius metadata
- `AF`: arc-to-fix geometry using resolved center + radius metadata
- chained legs are checked for geometry continuity and reported with warnings if gaps are detected
