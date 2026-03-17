function parseImportance(feature) {
  const props = feature?.properties ?? {};
  const raw = props.importance ?? props.priority ?? props.classification;
  const text = String(raw ?? "").toLowerCase();
  if (typeof raw === "number" && Number.isFinite(raw)) {
    if (raw >= 8) return "major";
    if (raw >= 4) return "medium";
    return "minor";
  }
  if (["major", "high", "a", "b", "c", "class_b", "class_c"].includes(text)) return "major";
  if (["medium", "mid", "d", "e", "class_d", "class_e"].includes(text)) return "medium";
  if (text) return "minor";
  return "unknown";
}

function labelText(feature, fields = []) {
  const props = feature?.properties ?? {};
  for (const field of fields) {
    const value = props[field];
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

function parseProcedureIdParts(rawId) {
  const text = String(rawId ?? "").trim();
  if (!text) return {};
  const parts = text.split(":");
  if (parts[0] !== "procedure") return {};
  return {
    routeType: parts[1] ?? null,
    countryCode: parts[2] ?? null,
    airportIdent: parts[3] ?? null,
    ident: parts[4] ?? null,
    sequence: parts[5] ?? null,
    runwayToken: parts[6] ?? null
  };
}

export function normalizeProcedureCategory(rawType) {
  const raw = String(rawType ?? "").trim().toUpperCase();
  if (["APPROACH", "APP", "IAP", "PA", "PF", "PI"].includes(raw)) return "APPROACH";
  if (["SID", "PD", "PE"].includes(raw)) return "SID";
  if (["STAR", "STARS", "PS"].includes(raw)) return "STAR";
  if (raw) return raw;
  return "PROCEDURE";
}

function procedureKind(feature) {
  const props = feature?.properties ?? {};
  const parsed = parseProcedureIdParts(props.procedureId ?? props.id);
  const normalized = normalizeProcedureCategory(props.procedureType ?? props.routeType ?? parsed.routeType);
  if (normalized === "APPROACH") return "approach";
  if (normalized === "SID") return "sid";
  if (normalized === "STAR") return "star";
  return "procedure";
}

export function deriveProcedureDisplay(featureOrProps) {
  const props = featureOrProps?.properties ?? featureOrProps ?? {};
  const parsed = parseProcedureIdParts(props.procedureId ?? props.id);
  const category = normalizeProcedureCategory(props.procedureType ?? props.routeType ?? parsed.routeType);
  const ident = String(props.procedureName ?? props.name ?? props.ident ?? parsed.ident ?? "").trim();
  const runwayRaw = String(props.runway ?? props.runwayName ?? props.runwayId ?? parsed.runwayToken ?? "").trim();
  const runway = runwayRaw.replace(/^runway:/i, "").replace(/^runway:/, "");
  const transition = String(props.transition ?? props.transitionId ?? "").trim();
  const airportRaw = String(props.airportIdent ?? props.airportId ?? parsed.airportIdent ?? "").trim();
  const airport = airportRaw.replace(/^airport:[A-Z0-9]+:/i, "");

  const labelParts = [];
  if (ident) labelParts.push(ident);
  if (runway) labelParts.push(runway);
  if (transition && transition !== runway) labelParts.push(transition);
  const displayLabel = labelParts.join(" ") || ident || transition || runway || `${category} procedure`;

  return {
    key: String(props.procedureId ?? props.id ?? displayLabel),
    category,
    ident: ident || null,
    airport: airport || null,
    runway: runway || null,
    transition: transition || null,
    displayLabel
  };
}

function procedureLabelText(feature, zoom, descriptor) {
  const editorial = deriveProcedureDisplay(feature);
  const props = feature?.properties ?? {};
  if (zoom >= 13) {
    const fixLabel = labelText(feature, ["fixIdent", "fixId", "ident"]);
    if (fixLabel) return fixLabel;
  }
  return editorial.displayLabel || labelText(feature, descriptor?.label?.fields ?? ["procedureName", "name", "ident"]);
}

function classifyLayer(layerHint) {
  const key = String(layerHint || "").toLowerCase();
  if (key === "airspace") return "airspace";
  if (key === "airway") return "airway";
  if (key === "airport" || key === "heliport") return "airport";
  if (key === "runway") return "runway";
  if (key === "waypoint" || key === "navaid") return "waypoint";
  if (key === "procedure" || key === "hold") return "procedure";
  return "default";
}

function withAlpha(rgba, alpha) {
  const match = /^rgba\(([^,]+),([^,]+),([^,]+),([^)]+)\)$/.exec(String(rgba));
  if (!match) return rgba;
  return `rgba(${match[1].trim()}, ${match[2].trim()}, ${match[3].trim()}, ${alpha})`;
}

export function isFeatureVisibleAtZoom(feature, descriptor, zoom) {
  if (!Number.isFinite(zoom)) return true;
  const baseMin = Number.isFinite(feature?.minZoom) ? feature.minZoom : descriptor?.minZoom;
  const baseMax = Number.isFinite(feature?.maxZoom) ? feature.maxZoom : descriptor?.maxZoom;

  const importance = parseImportance(feature);
  const layerClass = classifyLayer(descriptor?.styleHint);
  let minZoom = Number.isFinite(baseMin) ? baseMin : 4;
  let maxZoom = Number.isFinite(baseMax) ? baseMax : 16;

  if (layerClass === "airspace") {
    if (importance === "major") minZoom = Math.max(4, minZoom - 1);
    if (importance === "medium") minZoom = Math.max(minZoom, 6);
    if (importance === "minor") minZoom = Math.max(minZoom, 9);
  } else if (layerClass === "airway") {
    if (importance === "major") minZoom = Math.max(5, minZoom - 1);
    if (importance === "minor") minZoom = Math.max(minZoom, 9);
  } else if (layerClass === "waypoint") {
    minZoom = Math.max(minZoom, 10);
    if (importance === "major") minZoom = Math.max(9, minZoom - 1);
    if (importance === "minor" || importance === "unknown") minZoom = Math.max(minZoom, 11);
  } else if (layerClass === "runway") {
    minZoom = Math.max(minZoom, 10);
  } else if (layerClass === "procedure") {
    minZoom = Math.max(minZoom, 7);
  }

  return zoom >= minZoom && zoom <= maxZoom;
}

export function getAirspaceStyle(feature, zoom) {
  const importance = parseImportance(feature);
  const restrictive = Boolean(feature?.properties?.restrictiveType);
  const large = importance === "major";
  const borderWidth = zoom >= 11 ? (large ? 1.9 : 1.5) : (large ? 1.6 : 1.2);
  const baseFill = restrictive
    ? (large ? "rgba(118, 78, 165, 0.08)" : "rgba(118, 78, 165, 0.05)")
    : (large ? "rgba(57, 110, 200, 0.06)" : "rgba(57, 110, 200, 0.035)");
  return {
    stroke: restrictive ? "rgba(118, 78, 165, 0.95)" : "rgba(57, 110, 200, 0.95)",
    fill: zoom >= 10 ? baseFill : withAlpha(baseFill, large ? 0.045 : 0.03),
    lineDash: restrictive ? [6, 4] : null,
    width: borderWidth
  };
}

export function getAirwayStyle(feature, zoom) {
  const importance = parseImportance(feature);
  const major = importance === "major";
  return {
    stroke: major ? "#df7c1d" : "#efa251",
    casing: major ? "rgba(255, 247, 230, 0.95)" : "rgba(255, 247, 230, 0.7)",
    width: zoom >= 10 ? (major ? 2.1 : 1.4) : (major ? 1.6 : 1.05),
    casingWidth: zoom >= 10 ? (major ? 3.4 : 2.1) : (major ? 2.6 : 1.8)
  };
}

export function getAirportStyle(feature, zoom) {
  const major = parseImportance(feature) === "major";
  return {
    radius: zoom >= 8 ? (major ? 7 : 6) : (major ? 6 : 5),
    fill: "#1f4f88",
    stroke: "#ffffff",
    strokeWidth: 1.5
  };
}

export function getWaypointStyle(_feature, zoom) {
  return {
    radius: zoom >= 13 ? 3.6 : 2.6,
    fill: "#19885f",
    stroke: "#ffffff",
    strokeWidth: 1
  };
}

export function getRunwayStyle(_feature, zoom) {
  return {
    stroke: "#2b2b2b",
    width: zoom >= 12 ? 3.4 : 2.6
  };
}

export function getProcedureStyle(_feature, zoom) {
  const kind = procedureKind(_feature);
  const isApproach = kind === "approach";
  const legType = String(_feature?.properties?.legType ?? "").toUpperCase();
  return {
    stroke: "rgba(255, 0, 255, 0.9)",
    width: zoom >= 14 ? (isApproach ? 2.4 : 2) : (isApproach ? 2.1 : 1.7),
    lineDash: null,
    pointRadius: legType === "IF" ? (zoom >= 13 ? 3.4 : 2.8) : 0
  };
}

export function getLabelRule(feature, descriptor, zoom) {
  const layerClass = classifyLayer(descriptor?.styleHint);
  const fields = descriptor?.label?.fields ?? ["name", "ident", "id"];
  const text = layerClass === "procedure"
    ? procedureLabelText(feature, zoom, descriptor)
    : labelText(feature, fields);
  if (!text) return { enabled: false };

  const baseMin = Number.isFinite(descriptor?.label?.minZoom) ? descriptor.label.minZoom : 7;
  const importance = parseImportance(feature);
  let minZoom = importance === "major" ? Math.max(5, baseMin - 1) : baseMin;
  if (layerClass === "waypoint") {
    minZoom = importance === "major" ? Math.max(minZoom, 11) : Math.max(minZoom, 12);
  } else if (layerClass === "airway") {
    minZoom = importance === "major" ? Math.max(minZoom, 8) : Math.max(minZoom, 10);
  } else if (layerClass === "airspace") {
    minZoom = importance === "minor" ? Math.max(minZoom, 9) : minZoom;
  } else if (layerClass === "procedure") {
    minZoom = Math.max(minZoom, 8);
  }
  if (Number.isFinite(zoom) && zoom < minZoom) return { enabled: false };

  const basePriority = Number.isFinite(descriptor?.label?.priority) ? descriptor.label.priority : 20;
  const priorityBoost = layerClass === "procedure"
    ? 6
    : (importance === "major" ? 20 : (importance === "medium" ? 8 : 0));
  return {
    enabled: true,
    text,
    priority: basePriority + priorityBoost,
    minZoom
  };
}

export function getChartStyleToken(feature, descriptor, zoom) {
  const layerClass = classifyLayer(descriptor?.styleHint);
  if (!isFeatureVisibleAtZoom(feature, descriptor, zoom)) return null;
  if (layerClass === "airspace") return { kind: "airspace", ...getAirspaceStyle(feature, zoom) };
  if (layerClass === "airway") return { kind: "airway", ...getAirwayStyle(feature, zoom) };
  if (layerClass === "airport") return { kind: "airport", ...getAirportStyle(feature, zoom) };
  if (layerClass === "runway") return { kind: "runway", ...getRunwayStyle(feature, zoom) };
  if (layerClass === "waypoint") return { kind: "waypoint", ...getWaypointStyle(feature, zoom) };
  if (layerClass === "procedure") return { kind: "procedure", ...getProcedureStyle(feature, zoom) };
  return { kind: "default" };
}
