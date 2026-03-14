# @arinc424/procedures

Attachment 5 Phase 1 procedure leg decoding and geometry helpers.

## Phase 1 scope

Supported path terminators:

- `IF`
- `TF`
- `CF`
- `DF`

Unsupported path terminators are preserved and explicitly marked as unsupported.

## API

- `decodeProcedureLegs(canonicalModel, procedureId)`
- `buildProcedureGeometry(canonicalModel, procedureId)`
- `validateProcedureLegSequence(canonicalModel, procedureId)`

## Notes

- This is not a full FMS-grade procedure engine.
- `CF` is approximated in phase 1 as an anchor-to-fix line with explicit metadata warning.
- The builder emits continuity warnings if chained legs do not connect cleanly.
- More leg types will be added incrementally in future `0.1.x` releases.

## Next phase

Planned for `0.1.6`:

- `RF` - Constant Radius Arc
- `AF` - Arc to Fix (DME arc)
