# @arinc424/procedures

Incremental Attachment 5 procedure leg decoding and geometry helpers.

## Current support

Supported path terminators:

- `IF`
- `TF`
- `CF`
- `DF`
- `RF`
- `AF`

Unsupported path terminators are preserved and explicitly marked as unsupported.

## API

- `decodeProcedureLegs(canonicalModel, procedureId)`
- `buildProcedureGeometry(canonicalModel, procedureId)`
- `validateProcedureLegSequence(canonicalModel, procedureId)`

## Notes

- This is not a full FMS-grade procedure engine.
- `CF` is approximated as an anchor-to-fix line with explicit metadata warning.
- `RF` and `AF` are interpolated as visual-use arcs from resolved center/radius metadata.
- The builder emits continuity warnings if chained legs do not connect cleanly.
- More leg types will be added incrementally in future `0.1.x` releases.
