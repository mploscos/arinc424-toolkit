import fs from "node:fs";
import path from "node:path";

/**
 * Group feature model into one GeoJSON per layer.
 * @param {{features: object[]}} featureModel
 * @param {{outDir: string}} options
 * @returns {string[]}
 */
export function buildGeoJSONLayers(featureModel, { outDir }) {
  fs.mkdirSync(outDir, { recursive: true });
  const byLayer = new Map();
  for (const feature of featureModel.features ?? []) {
    const list = byLayer.get(feature.layer) ?? [];
    list.push({ type: "Feature", geometry: feature.geometry, properties: feature.properties, id: feature.id });
    byLayer.set(feature.layer, list);
  }

  const written = [];
  const layers = [...byLayer.keys()].sort();
  for (const layer of layers) {
    const features = [...(byLayer.get(layer) ?? [])].sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const file = path.join(outDir, `${layer}.geojson`);
    fs.writeFileSync(file, `${JSON.stringify({ type: "FeatureCollection", features }, null, 2)}\n`, "utf8");
    written.push(file);
  }
  return written;
}
