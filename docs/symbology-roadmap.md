# Symbology Roadmap (OpenLayers)

`examples/openlayers.html` includes ICAO/AIP-style symbology for points, routes, and airspace overlays, rendered with project-local canvas symbol generation.

## Current Point Symbol Mapping

- `D.geojson` (`type = "D"`)
  - `class = "V"` -> `vor`
  - `class = "VD"` -> `vor_dme`
  - `class = "VT"` -> `vortac`
- `DB.geojson` (`type = "DB"`) -> `ndb`
- `EA.geojson` / `PC.geojson`
  - `usage = "B"` -> `fix_comp` (compulsory reporting style)
  - otherwise -> `fix`
- `PA.geojson` -> `airport`
- `PG.geojson` -> `runway`

## Coverage Matrix (Canonical Fields -> Rendering)

| Canonical entity family | Current rendering | Canonical fields used for symbol/style decisions | Coverage status | Main gaps vs chart conventions |
|---|---|---|---|---|
| `PA` airports / heliports | `airport` / `heliport` variants + labels | `facilityType`, `controlType`, `privateUse`, airport/heliport identity fields | Partial | Full chart variant set (including emergency and exact standard glyphs per case) is not fully mapped yet |
| `PG` runways | Oriented runway bar (`bearing`) + `RWxx` label | `bearing`, runway id/designator, airport linkage fields | Partial | No composite "aerodrome runway disposition" symbol for procedure-chart view (currently rendered as separate runway features) |
| `D` navaids | `vor`, `vor_dme`, `vortac` | `class` | Good | Additional chart symbols still require explicit canonical-to-symbol mapping rules beyond current rendering set |
| `DB` navaids | `ndb` | entity type + navaid attrs (`class`) | Partial | Subtype-specific NDB chart variants / compass-rose style conventions are not mapped yet |
| `EA` / `PC` designated points | `fix`, `fix_comp`, `vfr_report`, `vfr_report_comp` | `usage`, `pointType` (when present), point attrs | Partial | VFR reporting-point coverage depends on canonical `pointType` semantics being present/validated in datasets |
| `ER` ATS routes | Line styles + labels | `route`, `routeType`, altitude/level fields, per-leg metadata (`legs[*]`) | Partial | Full chart ATS symbology catalog and complete direction semantics still pending |
| `PD` / `PE` / `PF` / `HD` / `HE` / `HF` procedure legs | Per-leg lines + compact labels | `legSegments[*]`, `turnDir`, altitude/speed restriction fields | Partial | Procedure-chart-specific overlays/annotation conventions still simplified |
| `EP` holdings | Racetrack line + turn hint label | holding geometry + turn direction metadata | Partial | More chart-faithful holding annotation and protected-area depiction not implemented |
| `ET` preferred routes | Styled polyline + labels | route identifiers + linked points/geometry | Partial | Chart-specific route presentation conventions simplified |
| `UC` / `UR` / `UF` airspaces | Polygon stroke/fill + category-aware boundary variants (double-stroke and dash by class/type) + labels | airspace class/type/category fields (`classification`, `restrictiveType`, etc.) | Partial | Full chart boundary/pattern catalog and all category-specific conventions are not fully mapped |

## Priority Improvements

- Aerodrome symbol variants (civil/military/mixed/water/emergency) when source semantics are available.
- Composite runway disposition display for procedure-chart contexts (using `PG` geometry instead of generic `PA` symbol).
- Route/airspace line conventions and boundary/pattern catalog closer to chart presentation rules.
- Canonical field coverage review for remaining chart-specific variants (e.g., emergency aerodrome, NDB subtype glyphs) before adding more symbols.

## Styling Notes

Airway style mapping (`ER`):

- Route line style is driven by layer/theme rules in the viewer.
- Route labels use available route identifiers and altitude/level attributes.

Airspace styling:

- `UC` (controlled): blue class-based boundaries (`B/C/D`)
- `UR` (special-use): type-based emphasis (`P/R/D/W/M`) with hatch overlays where available
- `UF` (FIR/UIR): dedicated boundary style

Operational style profile (AIP-like):

| Layer/Type | Stroke | Dash | Label rule |
|---|---|---|---|
| `ER` RNAV | cyan, medium | solid | route + level from zoom 11 |
| `ER` OTC | gray-blue, thin | dashed | route + level from zoom 11 |
| `ER` conventional | neutral gray, thin | short-dashed | route + level from zoom 11 |
| `PD` SID | brown | solid | line labels enabled |
| `PE` STAR | magenta | dashed | line labels enabled |
| `PF` APP | red | dash-dot | line labels enabled |
| `EP` Holding | green | dashed | line labels + turn hint |
| `ET` Preferred route | olive | long-dashed | line labels enabled |
| `UC/UR/UF` | class/type-based | mixed | polygon labels from zoom 8 |
| Point navaids/fixes | symbol atlas (canvas) | n/a | zoom-gated by type (`PA`, `D/DB`, `EA/PC`, `PG`) |

Zoom/performance rules:

- Tiled GeoJSON/OpenLayers: type visibility is zoom-gated and rendered with `declutter: true` in `VectorTileLayer`.
- OpenLayers symbols: project-generated canvas sprite icons by feature type, with zoom-adaptive scale.
- OpenLayers labels: line and point labels with halo, zoom-gated per type.
- Progressive zoom profile: detail is revealed from national view to terminal view.
- Line labels can be repeated/decluttered for route readability depending on viewer layer strategy.

Conditional overlays (enabled when fields exist in data):

- Unusable route segments: detects flags/text such as `unusable`, `usable=false`, `status=*closed*`
- Technical labels: `MEA`, `MOCA`, `MRA`, `MCA`, `MTA`, `MAA`, `gnssMea`
