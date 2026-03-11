# ARINC Airspace Geometry (UC/UR)

This project reconstructs airspace boundaries from ARINC 424 UC/UR records as sequential boundary segments.

## Core rule

`Boundary Via` on record `i` defines the segment from:

- `P[i]` (record `i` lat/lon)
- to `P[i+1]` (next sequence point)

Special case:

- `E` closes from `P[i]` back to `origin = P[0]`.

## Reconstruction flow

1. Group records by logical airspace key (including multiple code partition).
2. Sort records by sequence number.
3. Build base points `P[i]`.
4. Iterate records and build segment paths by `Boundary Via`.
5. Stitch all segment vertices into one ring and close ring if needed.

## Supported Boundary Via values

- `G`: great-circle segment (interpolated)
- `H`: rhumb approximation (explicit warning)
- `L`: counter-clockwise arc
- `R`: clockwise arc
- `C`: full circle from center/radius
- `E`: close to origin point

`A` handling:

- treated as partially supported
- warning is emitted
- currently approximated explicitly (never silent)

Unsupported values produce validation errors.

## Arc reconstruction

For `L/R`:

- center from arc origin fields
- radius from arc distance (`NM`)
- interpolate arc vertices with configurable max angular step (default `2°`)
- direction respected:
  - `L` => CCW
  - `R` => CW

For `C`:

- build full 360° ring from center + radius

## Validation

`validateAirspaceGeometry(airspace)` checks:

- sequence ordering and duplicates
- missing next point
- missing arc center/radius for `L/R/C` (and `A` checks)
- invalid WGS84 coordinates
- continuity breaks
- polygon closure
- altitude lower/upper consistency
- unsupported/partial `Boundary Via` values

Return contract:

```json
{
  "valid": true,
  "errors": [],
  "warnings": []
}
```

## Debug support

Enable parse option:

- `includeAirspaceGeometryDebug: true`

Canonical airspaces then include:

- reconstruction warnings/errors
- segment metadata

Useful for OpenLayers/Cesium visual diagnostics.
