function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function pickFirstArray(obj, paths) {
  for (const path of paths) {
    const parts = path.split(".");
    let cur = obj;
    for (const p of parts) cur = cur?.[p];
    if (Array.isArray(cur)) return cur;
  }
  return [];
}

function pickAirspaceClass(props) {
  return props.airspaceClass ?? props.classification ?? props.class ?? null;
}

function pickSegmentTypes(props) {
  const segmentMeta = pickFirstArray(props, [
    "segmentMetadata",
    "reconstruction.segmentMetadata",
    "reconstructionMetadata.segmentMetadata"
  ]);
  if (!segmentMeta.length) return [];
  return segmentMeta
    .map((s) => String(s?.via ?? s?.boundaryVia ?? "").trim())
    .filter(Boolean);
}

function pickWarnings(props) {
  const warnings = [
    ...pickFirstArray(props, ["validationWarnings", "reconstructionWarnings", "reconstruction.warnings", "reconstructionMetadata.warnings"]),
    ...pickFirstArray(props, ["warnings"])
  ];
  return warnings.map((w) => String(w)).filter(Boolean);
}

export function isAirspaceFeature(feature) {
  const layer = String(feature?.get?.("layer") ?? "").toLowerCase();
  return layer === "airspaces";
}

/**
 * Build developer-facing airspace inspection payload from an OpenLayers feature.
 * Works with partial metadata (missing fields are tolerated).
 * @param {import("ol/Feature").default} feature
 * @returns {object}
 */
export function extractAirspaceInspection(feature) {
  const props = { ...(feature?.getProperties?.() ?? {}) };
  const sourceRefs = asArray(props.sourceRefs);
  const segmentTypes = pickSegmentTypes(props);
  const warnings = pickWarnings(props);
  const reconstructionMetadata = props.reconstructionMetadata ?? props.reconstruction ?? null;

  const segmentCount =
    Number(props.segmentCount)
    || (Array.isArray(reconstructionMetadata?.segmentMetadata) ? reconstructionMetadata.segmentMetadata.length : 0)
    || null;

  return {
    id: props.id ?? null,
    layer: props.layer ?? null,
    type: props.type ?? null,
    classification: pickAirspaceClass(props),
    lowerLimit: props.lowerLimit ?? props.lowerLimitM ?? null,
    upperLimit: props.upperLimit ?? props.upperLimitM ?? null,
    sourceRefs,
    segmentTypes,
    segmentCount,
    validationWarnings: warnings,
    reconstructionMetadata
  };
}

function esc(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function renderAirspaceInspectionHtml(info) {
  const refs = info.sourceRefs.length
    ? `<pre>${esc(JSON.stringify(info.sourceRefs, null, 2))}</pre>`
    : "<em>n/a</em>";
  const warnings = info.validationWarnings.length
    ? `<ul>${info.validationWarnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>`
    : "<em>none</em>";
  const segmentTypes = info.segmentTypes.length
    ? esc(info.segmentTypes.join(", "))
    : "<em>n/a</em>";
  const reconstruction = info.reconstructionMetadata
    ? `<details><summary>reconstruction metadata</summary><pre>${esc(JSON.stringify(info.reconstructionMetadata, null, 2))}</pre></details>`
    : "<em>n/a</em>";

  return `
    <div><strong>Airspace ID:</strong> ${esc(info.id ?? "n/a")}</div>
    <div><strong>Class/Type:</strong> ${esc(info.classification ?? info.type ?? "n/a")}</div>
    <div><strong>Lower limit:</strong> ${esc(info.lowerLimit ?? "n/a")}</div>
    <div><strong>Upper limit:</strong> ${esc(info.upperLimit ?? "n/a")}</div>
    <div><strong>Segment count:</strong> ${esc(info.segmentCount ?? "n/a")}</div>
    <div><strong>Boundary segment types:</strong> ${segmentTypes}</div>
    <div><strong>Validation warnings:</strong> ${warnings}</div>
    <div><strong>sourceRefs:</strong> ${refs}</div>
    <div><strong>Reconstruction:</strong> ${reconstruction}</div>
  `;
}
