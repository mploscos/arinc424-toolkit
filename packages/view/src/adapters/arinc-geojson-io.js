/**
 * Parse GeoJSON text or NDJSON (one feature per line) into GeoJSON.
 * @param {string} text
 * @returns {GeoJSON.FeatureCollection|GeoJSON.Feature|GeoJSON.Geometry|null}
 */
export function parseGeoJsonText(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return JSON.parse(trimmed);
  }

  const features = [];
  for (const line of trimmed.split(/\r?\n/)) {
    const row = line.trim();
    if (!row) continue;
    features.push(JSON.parse(row));
  }
  if (!features.length) return null;
  return { type: "FeatureCollection", features };
}
