function formatObjectLines(obj, indent = "  ") {
  return Object.entries(obj ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${indent}- ${k}: ${v}`)
    .join("\n");
}

/**
 * Format summary/inspection payload for CLI text output.
 * @param {object} value
 * @returns {string}
 */
export function formatSummary(value) {
  if (!value || typeof value !== "object") return String(value);

  if (value.schema === "arinc-analysis-summary") {
    if (value.kind === "canonical") {
      return [
        `Summary (${value.kind})`,
        `- source: ${value.metadata?.source ?? "n/a"}`,
        `- total entities: ${value.totals?.entities ?? 0}`,
        "- entity counts:",
        formatObjectLines(value.entityCounts),
        "- airspace by class:",
        formatObjectLines(value.airspaces?.byClass)
      ].join("\n");
    }

    return [
      `Summary (${value.kind})`,
      `- source: ${value.metadata?.source ?? "n/a"}`,
      `- total features: ${value.totalFeatures ?? 0}`,
      "- layers:",
      formatObjectLines(value.layerCounts),
      "- geometry:",
      formatObjectLines(value.geometryCounts)
    ].join("\n");
  }

  if (value.found === false) {
    return `${value.kind ?? "entity"}: not found (${value.input ?? ""})`;
  }

  return JSON.stringify(value, null, 2);
}
