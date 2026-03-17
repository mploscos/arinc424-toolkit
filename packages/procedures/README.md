# @arinc424/procedures

Incremental Attachment 5 procedure leg decoding and geometry helpers.

## Phase 2 scope (`0.1.6`)

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
- `CF` is approximated in phase 1 as an anchor-to-fix line with explicit metadata warning.
- `RF` and `AF` are interpolated as visual-use arcs from resolved center/radius metadata.
- The builder emits continuity warnings if chained legs do not connect cleanly.
- More leg types will be added incrementally in future `0.1.x` releases.

## Next phase

Planned for `0.1.7+`:

- additional Attachment 5 leg types
- richer sequencing validation
- more complete procedure composition/debug output
