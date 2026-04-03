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
  if (key === "procedure" || key === "hold" || key === "procedure-annotation" || key === "procedure-editorial") return "procedure";
  return "default";
}

function layerHintOfFeature(featureOrProps) {
  const props = featureOrProps?.properties ?? featureOrProps ?? {};
  return String(props.layerHint ?? props.layer ?? featureOrProps?.layer ?? "").toLowerCase();
}

export const AIRSPACE_STYLE_PALETTE = Object.freeze({
  classB: { stroke: "rgba(18, 126, 167, 0.98)", fill: "rgba(18, 126, 167, 0.065)", lineDash: null },
  classC: { stroke: "rgba(48, 142, 104, 0.98)", fill: "rgba(48, 142, 104, 0.058)", lineDash: null },
  classD: { stroke: "rgba(176, 117, 40, 0.98)", fill: "rgba(176, 117, 40, 0.05)", lineDash: [10, 5] },
  classE: { stroke: "rgba(118, 96, 164, 0.96)", fill: "rgba(118, 96, 164, 0.038)", lineDash: [4, 4] },
  terminalMajor: { stroke: "rgba(39, 132, 150, 0.95)", fill: "rgba(39, 132, 150, 0.05)", lineDash: null },
  terminalMinor: { stroke: "rgba(77, 147, 160, 0.88)", fill: "rgba(77, 147, 160, 0.03)", lineDash: [6, 4] },
  controlledMajor: { stroke: "rgba(58, 101, 168, 0.96)", fill: "rgba(58, 101, 168, 0.055)", lineDash: null },
  controlledMinor: { stroke: "rgba(96, 128, 176, 0.9)", fill: "rgba(96, 128, 176, 0.032)", lineDash: [6, 4] },
  moa: { stroke: "rgba(146, 106, 55, 0.96)", fill: "rgba(146, 106, 55, 0.045)", lineDash: [8, 5] },
  warning: { stroke: "rgba(157, 84, 62, 0.96)", fill: "rgba(157, 84, 62, 0.04)", lineDash: [3, 5] },
  restrictive: { stroke: "rgba(153, 73, 73, 0.98)", fill: "rgba(153, 73, 73, 0.065)", lineDash: [6, 4] },
  danger: { stroke: "rgba(128, 44, 44, 0.98)", fill: "rgba(128, 44, 44, 0.072)", lineDash: [2, 4] },
  fallback: { stroke: "rgba(109, 121, 137, 0.88)", fill: "rgba(109, 121, 137, 0.03)", lineDash: [5, 5] }
});

export const AIRWAY_STYLE_PALETTE = Object.freeze({
  major: { stroke: "rgba(120, 134, 149, 0.9)", casing: "rgba(245, 247, 249, 0.78)" },
  minor: { stroke: "rgba(149, 160, 171, 0.72)", casing: "rgba(245, 247, 249, 0.52)" }
});

function normalizeTextForMatching(value) {
  return String(value ?? "").trim().toUpperCase();
}

function navaidSymbolForFeature(featureOrProps) {
  const props = featureOrProps?.properties ?? featureOrProps ?? {};
  const displayClass = normalizeTextForMatching(props.navaidDisplayClass);
  if (displayClass === "VOR") return "vor";
  if (displayClass === "VOR_DME") return "vor_dme";
  if (displayClass === "VORTAC") return "vortac";
  if (displayClass === "NDB") return "ndb";
  return "navaid";
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

  if (/CLASS B|(^|[^A-Z])B($|[^A-Z])/.test(classText)) {
    return { category: "terminal-controlled", styleClass: "class-b", importance: importance === "unknown" ? "major" : importance };
  }
  if (/CLASS C|(^|[^A-Z])C($|[^A-Z])/.test(classText)) {
    return { category: "terminal-controlled", styleClass: "class-c", importance: importance === "unknown" ? "major" : importance };
  }
  if (/CLASS D|(^|[^A-Z])D($|[^A-Z])/.test(classText)) {
    return { category: "controlled", styleClass: "class-d", importance };
  }
  if (/CLASS E|(^|[^A-Z])E($|[^A-Z])/.test(classText)) {
    return { category: "controlled", styleClass: "class-e", importance };
  }
  if (
    restrictiveType ||
    /RESTRICT|PROHIB|DANGER/.test(classText)
  ) {
    const styleClass = /DANGER/.test(classText) ? "danger" : "restrictive";
    return { category: "restrictive", styleClass, importance };
  }
  if (/WARNING|ALERT/.test(classText)) {
    return { category: "special-use", styleClass: "warning", importance };
  }
  if (/MOA|SPECIAL USE/.test(classText)) {
    return { category: "special-use", styleClass: "moa", importance };
  }
  if (/CTR|TMA|CTA|CONTROL/.test(classText)) {
    return { category: "controlled", styleClass: "controlled", importance };
  }
  return { category: "fallback", styleClass: "fallback", importance };
}

function airspacePaletteForCategory(category, styleClass, importance) {
  if (styleClass === "class-b") return AIRSPACE_STYLE_PALETTE.classB;
  if (styleClass === "class-c") return AIRSPACE_STYLE_PALETTE.classC;
  if (styleClass === "class-d") return AIRSPACE_STYLE_PALETTE.classD;
  if (styleClass === "class-e") return AIRSPACE_STYLE_PALETTE.classE;
  if (styleClass === "moa") return AIRSPACE_STYLE_PALETTE.moa;
  if (styleClass === "warning") return AIRSPACE_STYLE_PALETTE.warning;
  if (styleClass === "danger") return AIRSPACE_STYLE_PALETTE.danger;
  if (category === "restrictive") return AIRSPACE_STYLE_PALETTE.restrictive;
  if (category === "special-use") return AIRSPACE_STYLE_PALETTE.moa;
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
    minZoom = Math.max(minZoom, 10);
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
  const { category, styleClass, importance } = categorizeAirspaceFeatureProperties(feature);
  const large = importance === "major";
  const palette = airspacePaletteForCategory(category, styleClass, importance);
  const widthBoost = styleClass === "class-b"
    ? 0.45
    : (styleClass === "class-c" ? 0.3 : (styleClass === "danger" ? 0.25 : 0));
  const borderWidth = zoom >= 11
    ? (large ? 1.85 + widthBoost : 1.45 + widthBoost)
    : (large ? 1.55 + widthBoost : 1.15 + widthBoost);
  return {
    stroke: palette.stroke,
    fill: zoom >= 10 ? palette.fill : withAlpha(palette.fill, large ? 0.04 : 0.024),
    lineDash: palette.lineDash,
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
  const facilityType = normalizeTextForMatching(firstText(feature?.properties ?? feature ?? {}, ["facilityType", "airportType", "type"]));
  const isHeliport = layerHintOfFeature(feature).startsWith("heliport") || facilityType.includes("HEL") || facilityType === "HP";
  return {
    symbol: isHeliport ? "heliport" : "airport",
    radius: zoom >= 10 ? (major ? 6.4 : 5.4) : (major ? 5.8 : 4.8),
    fill: isHeliport ? (major ? "#6e5a1f" : "#8e7330") : (major ? "#173a68" : "#39618e"),
    stroke: "#ffffff",
    strokeWidth: major ? 1.4 : 1.1
  };
}

export function getWaypointStyle(feature, zoom) {
  const major = parseImportance(feature) === "major";
  const props = feature?.properties ?? {};
  const layerName = String(props.layerHint ?? props.layer ?? feature?.layer ?? "").toLowerCase();
  const isNavaid = layerName === "navaid" || layerName === "navaids";
  const usage = normalizeTextForMatching(props.usage);
  const compulsory = usage === "B";
  return {
    symbol: isNavaid ? navaidSymbolForFeature(feature) : (compulsory ? "waypoint-compulsory" : "waypoint"),
    radius: zoom >= 13 ? (major ? 3.1 : 2.5) : (major ? 2.6 : 2.1),
    fill: isNavaid ? "#4f5c90" : (compulsory ? "#436f8b" : "#597b6e"),
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
  const layerHint = layerHintOfFeature(_feature);
  const props = _feature?.properties ?? {};
  const isAnnotation = layerHint === "procedure-annotation";
  const isApproach = kind === "approach";
  const depictionClass = String(props.depictionClass ?? "").trim().toLowerCase();
  const isHold = layerHint === "hold" || layerHint === "holds" || depictionClass === "hold";
  const isOpenLeg = depictionClass === "open-leg";
  const isChartPoint = depictionClass === "chart-point";
  const chartObjectClass = String(props.chartObjectClass ?? "").trim().toLowerCase();
  const approximationLevel = String(props.approximationLevel ?? "").trim().toLowerCase();
  if (isAnnotation) {
    return {
      stroke: "rgba(0, 0, 0, 0)",
      casing: "rgba(0, 0, 0, 0)",
      casingWidth: 0,
      width: 0,
      lineDash: null,
      pointFill: chartObjectClass === "hold-racetrack" ? "rgba(88, 112, 48, 0.96)" : "rgba(120, 90, 42, 0.92)",
      pointRadius: zoom >= 13 ? 2.8 : 2.2
    };
  }
  const palette = isHold
    ? { stroke: "rgba(88, 112, 48, 0.96)", casing: "rgba(255, 255, 255, 0.72)", lineDash: [6, 5] }
    : kind === "approach"
      ? { stroke: "rgba(176, 52, 52, 0.96)", casing: "rgba(255, 255, 255, 0.78)", lineDash: [10, 4, 2, 4] }
      : kind === "star"
        ? { stroke: "rgba(43, 118, 157, 0.94)", casing: "rgba(255, 255, 255, 0.75)", lineDash: [10, 6] }
        : { stroke: "rgba(150, 97, 45, 0.96)", casing: "rgba(255, 255, 255, 0.74)", lineDash: null };
  const lineDash = isOpenLeg
    ? [8, 5]
    : (approximationLevel === "approximate" ? [10, 5] : palette.lineDash);
  return {
    stroke: palette.stroke,
    casing: palette.casing,
    casingWidth: zoom >= 14 ? (isHold ? 2.4 : 2.8) : (isHold ? 2.05 : 2.35),
    width: zoom >= 14 ? (isHold ? 1.85 : (isApproach ? 2.4 : 2)) : (isHold ? 1.6 : (isApproach ? 2.1 : 1.7)),
    lineDash,
    pointFill: palette.stroke,
    pointRadius: isChartPoint ? (zoom >= 13 ? 3.6 : 3) : 0
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
