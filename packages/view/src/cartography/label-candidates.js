import { getLabelPriority } from "./style-system.js";

function firstTextValue(properties, fields) {
  for (const field of fields) {
    const raw = properties?.[field];
    const text = typeof raw === "string" ? raw.trim() : String(raw ?? "").trim();
    if (text) return text;
  }
  return "";
}

/**
 * Build label candidates from already normalized features.
 * @param {Array<object>} features
 * @param {Map<string, object>} layerMap
 * @returns {Array<object>}
 */
export function buildLabelCandidates(features, layerMap) {
  const out = [];
  for (const feature of features ?? []) {
    let layer = String(feature?.layer || "").toLowerCase();
    if (layer === "procedure") layer = "procedures";
    if (layer === "hold") layer = "holds";
    const descriptor = layerMap.get(layer);
    if (!descriptor?.label?.enabled) continue;
    const text = firstTextValue(feature?.properties ?? {}, descriptor.label.fields ?? []);
    if (!text) continue;

    const labelMinZoom = Number.isFinite(descriptor.label.minZoom)
      ? descriptor.label.minZoom
      : (Number.isFinite(descriptor.minZoom) ? descriptor.minZoom : 7);

    out.push({
      featureId: feature.id,
      layer,
      text,
      minZoom: labelMinZoom,
      priority: getLabelPriority(feature, descriptor)
    });
  }
  return out.sort((a, b) => (b.priority - a.priority) || a.layer.localeCompare(b.layer) || a.text.localeCompare(b.text));
}
