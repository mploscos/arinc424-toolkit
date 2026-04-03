# arinc424-toolkit

End-to-end ARINC 424 pipeline for JavaScript and Node.js.

Parse → normalize → generate features → tile → visualize (2D & 3D)

<p align="center">
  <img src="./docs/2d.png" alt="OpenLayers 2D viewer" width="33%" />
  <img src="./docs/procedures.png" alt="procedures viewer" width="33%" />
  <img src="./docs/3d.png" alt="Cesium 3D viewer" width="33%" />
</p>

---

## ⚡ Quickstart (30 seconds)

From raw ARINC to a visualizable dataset:

```bash
npm install @arinc424/toolkit

arinc parse ./data/FAACIFP18.dat ./out/canonical.json
arinc features ./out/canonical.json ./out/features.json
arinc tiles ./out/features.json ./out/tiles
```

Now open the viewer:

```
http://localhost:8080/openlayers-tiles/?index=/out/visualization.index.json
```

👉 You now have a full ARINC dataset rendered without loading huge files in memory.

---

## ✨ What you get

* Full ARINC 424 parsing in JavaScript
* Canonical normalized model
* GeoJSON-like feature model
* Scalable tiled datasets (no 400MB JSON in browser)
* 3D Tiles for Cesium
* Procedure decoding (legs, arcs, holds…)
* Interactive viewers (OpenLayers + Cesium)

---

## 🧠 Why this toolkit exists

ARINC 424 tooling in JavaScript is still uncommon, and when it exists it is often:

* tightly coupled to one dataset
* tied to one viewer
* difficult to reuse

This project breaks the problem into a **composable pipeline**:

```text
ARINC → canonical → features → tiles → view
```

So you can:

* build your own pipeline
* inspect and validate aviation data
* experiment with cartography
* scale to large datasets without browser issues

---

## 📦 Install

### Recommended (full pipeline)

```bash
npm install @arinc424/toolkit
```

Best option if you want the full workflow from parsing to visualization.

---

### Modular install (advanced)

```bash
npm install \
  @arinc424/core \
  @arinc424/features \
  @arinc424/procedures \
  @arinc424/analysis \
  @arinc424/tiles \
  @arinc424/3dtiles \
  @arinc424/view
```

Use this if you only need specific stages or want tighter control.

---

## 🧩 Packages

| Package                | Purpose                                 |
| ---------------------- | --------------------------------------- |
| `@arinc424/core`       | ARINC parsing and canonical model       |
| `@arinc424/features`   | Canonical → geospatial feature model    |
| `@arinc424/procedures` | Procedure decoding (legs, arcs, holds…) |
| `@arinc424/analysis`   | Stats, inspectors and queries           |
| `@arinc424/tiles`      | Tiled GeoJSON generation (`z/x/y.json`) |
| `@arinc424/3dtiles`    | 3D Tiles export                         |
| `@arinc424/view`       | OpenLayers / Cesium visualization       |
| `@arinc424/toolkit`    | All-in-one bundle + CLI                 |

---

## 🧪 CLI

```bash
npm install @arinc424/toolkit
arinc --help
```

Main commands:

```bash
arinc parse <input.dat> <canonical.json>
arinc features <canonical.json> <features.json>
arinc tiles <features.json> <outDir> [--min-zoom N --max-zoom N]
arinc 3dtiles <features.json> <outDir>
arinc stats <canonical-or-features.json> [--json]
arinc inspect-airspace <canonical.json> <id|token> [--json]
arinc inspect-airport <canonical.json> <id|ident> [--json]
arinc inspect-waypoint <canonical.json> <id|ident> [--json]
arinc inspect-procedure <canonical.json> <id|token> [--json]
arinc procedure-geometry <canonical.json> <id|token> [--json]
arinc query <canonical-or-features.json> ...
```

---

## 🧑‍💻 Programmatic usage

```js
import { core, features, procedures, analysis, tiles, threeDTiles } from "@arinc424/toolkit";

const canonical = await core.parseArincFile("./data/FAACIFP18.dat");
const featureModel = features.buildFeaturesFromCanonical(canonical);

const procedureGeometry = procedures.buildProcedureGeometry(
  canonical,
  "procedure:PD:US:KPRC:PRC1:1:RW04"
);

const stats = analysis.summarizeDataset(canonical);

const { manifest } = tiles.generateTiles(featureModel, {
  outDir: "./out/tiles",
  minZoom: 4,
  maxZoom: 10
});

await threeDTiles.build3DTilesFromFeatures(featureModel, {
  outDir: "./out/3dtiles"
});

console.log(stats.entityCounts);
console.log(procedureGeometry.warnings);
```

---

## 👁️ Viewers

```bash
npm run view:examples
```

Open:

* OpenLayers:
  `http://localhost:8080/openlayers-tiles/?index=/artifacts/<dataset>/visualization.index.json`

* Cesium:
  `http://localhost:8080/cesium-3dtiles/?index=/artifacts/<dataset>/visualization.index.json`

Useful query params:

* `&debug=1`
* `&basemap=muted`
* `&basemap=standard`

---

## ⚠️ Large datasets

ARINC datasets can be very large (hundreds of MB).

Avoid loading full files like:

* `features.json`
* `procedure-legs.geojson`

Instead:

* use tiled datasets (`tiles/`)
* use `visualization.index.json` as entry point

---

## 🏗️ Architecture

```text
ARINC424 -> core -> canonical
          -> procedures -> geometry
          -> features -> feature model
          -> analysis -> stats / inspect
          -> tiles -> scalable tiles
          -> 3dtiles -> Cesium output
          -> view -> visualization
```

---

## 📊 Current release: 0.1.9

Focus:

* richer procedure depiction
* scalable viewer loading
* per-procedure artifacts
* chart-style rendering
* improved Cesium/OpenLayers alignment

---

## 📚 Documentation

* CHANGELOG.md
* docs/analysis.md
* docs/cartography.md
* docs/procedures.md
* docs/view-debug.md
* docs/large-dataset.md
* docs/testing.md

---

## 🧪 Quality

```bash
npm install
npm test
npm run test:golden
npm run test:smoke
npm run bench
```