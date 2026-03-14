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
  if (Array.isArray(value)) {
    return `Results: ${value.length}\n${JSON.stringify(value, null, 2)}`;
  }
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

  if (value.valid !== undefined && Array.isArray(value.errors) && Array.isArray(value.warnings)) {
    return [
      `Cross-entity consistency: ${value.valid ? "VALID" : "INVALID"}`,
      `- errors: ${value.errors.length}`,
      `- warnings: ${value.warnings.length}`,
      value.errors.length ? `Errors:\n${value.errors.map((e) => `  - ${e}`).join("\n")}` : "",
      value.warnings.length ? `Warnings:\n${value.warnings.map((w) => `  - ${w}`).join("\n")}` : ""
    ].filter(Boolean).join("\n");
  }

  if (value.found === false) {
    return `${value.kind ?? "entity"}: not found (${value.input ?? ""})`;
  }

  if (value.kind === "procedure" || value.kind === "airport" || value.kind === "airspace" || value.kind === "waypoint") {
    return JSON.stringify(value, null, 2);
  }

  if (value.relation && Array.isArray(value.results)) {
    return [
      `Related query (${value.kind}:${value.id})`,
      `- relation: ${value.relation}`,
      `- count: ${value.results.length}`,
      value.results.length ? JSON.stringify(value.results, null, 2) : ""
    ].filter(Boolean).join("\n");
  }

  return JSON.stringify(value, null, 2);
}
