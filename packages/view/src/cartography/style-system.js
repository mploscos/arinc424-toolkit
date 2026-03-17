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

function firstText(props, fields = []) {
  for (const field of fields) {
    const text = String(props?.[field] ?? "").trim();
    if (text) return text;
  }
  return "";
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

export const AIRSPACE_STYLE_PALETTE = Object.freeze({
  controlledMajor: { stroke: "rgba(58, 101, 168, 0.96)", fill: "rgba(58, 101, 168, 0.055)" },
  controlledMinor: { stroke: "rgba(96, 128, 176, 0.9)", fill: "rgba(96, 128, 176, 0.032)" },
  terminalMajor: { stroke: "rgba(39, 132, 150, 0.95)", fill: "rgba(39, 132, 150, 0.05)" },
  terminalMinor: { stroke: "rgba(77, 147, 160, 0.88)", fill: "rgba(77, 147, 160, 0.03)" },
  specialUse: { stroke: "rgba(134, 98, 52, 0.96)", fill: "rgba(134, 98, 52, 0.05)" },
  restrictive: { stroke: "rgba(153, 73, 73, 0.98)", fill: "rgba(153, 73, 73, 0.065)" },
  fallback: { stroke: "rgba(109, 121, 137, 0.88)", fill: "rgba(109, 121, 137, 0.03)" }
});

export const AIRWAY_STYLE_PALETTE = Object.freeze({
  major: { stroke: "rgba(120, 134, 149, 0.9)", casing: "rgba(245, 247, 249, 0.78)" },
  minor: { stroke: "rgba(149, 160, 171, 0.72)", casing: "rgba(245, 247, 249, 0.52)" }
});

function normalizeTextForMatching(value) {
  return String(value ?? "").trim().toUpperCase();
}

export function categorizeAirspaceFeatureProperties(featureOrProps) {
  const props = featureOrProps?.properties ?? featureOrProps ?? {};
  const importance = parseImportance(featureOrProps?.properties ? featureOrProps : { properties: props });
  const restrictiveType = normalizeTextForMatching(props.restrictiveType);
  const classText = normalizeTextForMatching(firstText(props, [
    "airspaceClass",
    "classification",
    "class",
    "type",
    "airspaceType",
    "usage",
    "name"
  ]));

  if (
    restrictiveType ||
    /RESTRICT|PROHIB|DANGER/.test(classText)
  ) {
    return { category: "restrictive", importance };
  }
  if (/MOA|WARNING|ALERT|SPECIAL USE/.test(classText)) {
    return { category: "special-use", importance };
  }
  if (/CLASS B|(^|[^A-Z])B($|[^A-Z])|CLASS C|(^|[^A-Z])C($|[^A-Z])/.test(classText)) {
    return { category: "terminal-controlled", importance: importance === "unknown" ? "major" : importance };
  }
  if (/CLASS D|(^|[^A-Z])D($|[^A-Z])|CLASS E|(^|[^A-Z])E($|[^A-Z])|CTR|TMA|CTA|CONTROL/.test(classText)) {
    return { category: "controlled", importance };
  }
  return { category: "fallback", importance };
}

function airspacePaletteForCategory(category, importance) {
  if (category === "restrictive") return AIRSPACE_STYLE_PALETTE.restrictive;
  if (category === "special-use") return AIRSPACE_STYLE_PALETTE.specialUse;
  if (category === "terminal-controlled") {
    return importance === "major" ? AIRSPACE_STYLE_PALETTE.terminalMajor : AIRSPACE_STYLE_PALETTE.terminalMinor;
  }
  if (category === "controlled") {
    return importance === "major" ? AIRSPACE_STYLE_PALETTE.controlledMajor : AIRSPACE_STYLE_PALETTE.controlledMinor;
  }
  return AIRSPACE_STYLE_PALETTE.fallback;
}

export function classifyAirwayTier(featureOrProps) {
  const props = featureOrProps?.properties ?? featureOrProps ?? {};
  const importance = parseImportance(featureOrProps?.properties ? featureOrProps : { properties: props });
  const routeType = normalizeTextForMatching(firstText(props, ["routeType", "airwayType", "classification", "airwayName", "name"]));
  if (importance === "major") return "major";
  if (/JET|HIGH|UPPER|\bQ\d|\bJ\d|^Q$|^J$/.test(routeType)) return "major";
  return "minor";
}

export function getLabelPriority(feature, descriptor) {
  const layerClass = classifyLayer(descriptor?.styleHint);
  const importance = parseImportance(feature);
  const baseByLayer = {
    airspace: 120,
    airport: 98,
    runway: 70,
    airway: 54,
    procedure: 56,
    waypoint: 24,
    default: 20
  };
  const base = Number.isFinite(descriptor?.label?.priority)
    ? descriptor.label.priority
    : (baseByLayer[layerClass] ?? baseByLayer.default);
  const importanceBoost = importance === "major" ? 18 : (importance === "medium" ? 7 : 0);
  return base + importanceBoost;
}

function withAlpha(rgba, alpha) {
  const match = /^rgba\(([^,]+),([^,]+),([^,]+),([^)]+)\)$/.exec(String(rgba));
  if (!match) return rgba;
  return `rgba(${match[1].trim()}, ${match[2].trim()}, ${match[3].trim()}, ${alpha})`;
}

export function isFeatureVisibleAtZoom(feature, descriptor, zoom) {
  if (!Number.isFinite(zoom)) return true;
  const baseMin = Number.isFinite(feature?.minZoom) ? feature.minZoom : descriptor?.minZoom;
  const baseMax = descriptor?.maxZoom;

  const importance = parseImportance(feature);
  const layerClass = classifyLayer(descriptor?.styleHint);
  let minZoom = Number.isFinite(baseMin) ? baseMin : 4;
  let maxZoom = Number.isFinite(baseMax) ? baseMax : 22;

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
  const { category, importance } = categorizeAirspaceFeatureProperties(feature);
  const large = importance === "major";
  const palette = airspacePaletteForCategory(category, importance);
  const borderWidth = zoom >= 11 ? (large ? 1.85 : 1.45) : (large ? 1.55 : 1.15);
  return {
    stroke: palette.stroke,
    fill: zoom >= 10 ? palette.fill : withAlpha(palette.fill, large ? 0.04 : 0.024),
    lineDash: category === "restrictive" ? [6, 4] : (category === "special-use" ? [4, 4] : null),
    width: borderWidth
  };
}

export function getAirwayStyle(feature, zoom) {
  const major = classifyAirwayTier(feature) === "major";
  const palette = major ? AIRWAY_STYLE_PALETTE.major : AIRWAY_STYLE_PALETTE.minor;
  return {
    stroke: palette.stroke,
    casing: palette.casing,
    width: zoom >= 10 ? (major ? 1.7 : 1.15) : (major ? 1.3 : 0.85),
    casingWidth: zoom >= 10 ? (major ? 2.6 : 1.85) : (major ? 2.1 : 1.45)
  };
}

export function getAirportStyle(feature, zoom) {
  const major = parseImportance(feature) === "major";
  return {
    radius: zoom >= 10 ? (major ? 6.4 : 5.4) : (major ? 5.8 : 4.8),
    fill: major ? "#173a68" : "#39618e",
    stroke: "#ffffff",
    strokeWidth: major ? 1.4 : 1.1
  };
}

export function getWaypointStyle(feature, zoom) {
  const major = parseImportance(feature) === "major";
  const props = feature?.properties ?? {};
  const layerName = String(props.layerHint ?? props.layer ?? feature?.layer ?? "").toLowerCase();
  const isNavaid = layerName === "navaid" || layerName === "navaids";
  return {
    radius: zoom >= 13 ? (major ? 3.1 : 2.5) : (major ? 2.6 : 2.1),
    fill: isNavaid ? "#5c6491" : "#597b6e",
    stroke: "#ffffff",
    strokeWidth: 0.9
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
  let minZoom = importance === "major" ? Math.max(6, baseMin - 1) : baseMin;
  if (layerClass === "waypoint") {
    minZoom = importance === "major" ? Math.max(minZoom, 12) : Math.max(minZoom, 13);
  } else if (layerClass === "airport") {
    minZoom = importance === "major" ? Math.max(minZoom, 7) : Math.max(minZoom, 8);
  } else if (layerClass === "airway") {
    minZoom = importance === "major" ? Math.max(minZoom, 10) : Math.max(minZoom, 11);
  } else if (layerClass === "airspace") {
    minZoom = importance === "major" ? Math.max(minZoom, 6) : (importance === "minor" ? Math.max(minZoom, 10) : Math.max(minZoom, 8));
  } else if (layerClass === "procedure") {
    minZoom = Math.max(minZoom, 9);
  }
  if (Number.isFinite(zoom) && zoom < minZoom) return { enabled: false };

  return {
    enabled: true,
    text,
    priority: getLabelPriority(feature, descriptor),
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
