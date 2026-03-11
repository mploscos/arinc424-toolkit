# Test Fixtures

This directory contains small deterministic ARINC fixtures used for regression testing.

## Fixtures

- `minimal-airport.arinc`
Purpose: basic airport/runway/waypoint parsing and canonical entity generation.

- `airway-network.arinc`
Purpose: waypoint + navaid + airway segment parsing, cross-reference normalization, and line feature generation.

- `airspace.arinc`
Purpose: controlled airspace polygon parsing with vertical limits and 3D tiles input coverage.

- `procedure.arinc`
Purpose: procedure leg parsing and procedure feature generation.

- `sample.arinc`
Legacy sample retained for backward compatibility with earlier golden tests.

## Notes

- Fixtures are generated/updated by `scripts/update-goldens.mjs`.
- They are intentionally small and human-reviewable while still exercising the parser/model contracts.
