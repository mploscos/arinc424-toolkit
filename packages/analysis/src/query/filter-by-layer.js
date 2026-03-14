/**
 * Filter features/entities by layer key.
 * @param {Array<object>} entities
 * @param {string} layer
 * @returns {Array<object>}
 */
export function filterByLayer(entities, layer) {
  const wanted = String(layer || "").toLowerCase();
  if (!wanted) return [...(entities ?? [])];
  return (entities ?? []).filter((item) => String(item.layer || item.__layer || "").toLowerCase() === wanted);
}
