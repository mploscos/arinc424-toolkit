# @arinc/core

ARINC 424 parsing and canonical model generation.

## API

- `parseArincFile(inputFile, options)`
- `parseArincText(text, options)`
- `buildCanonicalModel(text, options)`
- `createCanonicalModel(metadata)`
- `readCanonicalModel(filepath)`
- `writeCanonicalModel(model, filepath)`
- `validateCanonicalModel(model)`
- `validateAirspaceGeometry(airspace)`

Canonical IDs and cross-references are deterministic and use canonical IDs as primary references.
Raw ARINC identifiers remain preserved for traceability.

Optional parse-time validation for UC/UR airspace geometry:

- `parseArincText(text, { validateAirspaceGeometry: true })`
- `parseArincFile(file, { validateAirspaceGeometry: true })`
- Optional strict mode: `throwOnAirspaceValidationError: true`
- Optional debug payload in canonical airspaces: `includeAirspaceGeometryDebug: true`

Optional callback:

- `onAirspaceValidationResult({ bucketKey, kind, result })`
