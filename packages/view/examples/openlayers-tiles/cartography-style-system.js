import {
  AIRSPACE_STYLE_PALETTE,
  AIRWAY_STYLE_PALETTE
} from "../shared/chart-semantic-palette.js";

function parseImportanceFromOlFeature(feature) {
  const raw = feature.get("importance") ?? feature.get("priority") ?? feature.get("classification");
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

function firstText(feature, fields = []) {
  for (const field of fields) {
    const text = String(feature.get(field) ?? "").trim();
    if (text) return text;
  }
  return "";
}

function classifyLayer(styleHint) {
  const key = String(styleHint || "").toLowerCase();
  if (key === "airspace") return "airspace";
  if (key === "airway") return "airway";
  if (key === "airport" || key === "heliport") return "airport";
  if (key === "runway") return "runway";
  if (key === "waypoint" || key === "navaid") return "waypoint";
  if (key === "procedure" || key === "hold" || key === "procedure-annotation" || key === "procedure-editorial") return "procedure";
  return "default";
}

function layerHintOfFeature(feature) {
  return String(feature.get("layerHint") ?? feature.get("layer") ?? "").toLowerCase();
}

function normalizeTextForMatching(value) {
  return String(value ?? "").trim().toUpperCase();
}

function navaidSymbolForFeature(feature) {
  const displayClass = normalizeTextForMatching(feature.get("navaidDisplayClass"));
  if (displayClass === "VOR") return "vor";
  if (displayClass === "VOR_DME") return "vor_dme";
  if (displayClass === "VORTAC") return "vortac";
  if (displayClass === "NDB") return "ndb";
  return "navaid";
}

export function categorizeAirspaceFeature(feature) {
  const importance = parseImportanceFromOlFeature(feature);
  const restrictiveType = normalizeTextForMatching(feature.get("restrictiveType"));
  const classText = normalizeTextForMatching(firstText(feature, [
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
  if (restrictiveType || /RESTRICT|PROHIB|DANGER/.test(classText)) {
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

function classifyAirwayTier(feature) {
  const importance = parseImportanceFromOlFeature(feature);
  const routeType = normalizeTextForMatching(firstText(feature, ["routeType", "airwayType", "classification", "airwayName", "name"]));
  if (importance === "major") return "major";
  if (/JET|HIGH|UPPER|\bQ\d|\bJ\d|^Q$|^J$/.test(routeType)) return "major";
  return "minor";
}

function getLabelPriority(feature, descriptor) {
  const layerClass = classifyLayer(descriptor?.styleHint);
  const importance = parseImportanceFromOlFeature(feature);
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

function procedureKindFromFeature(feature) {
  const raw = String(feature.get("procedureType") ?? feature.get("routeType") ?? feature.get("type") ?? "").trim().toUpperCase();
  if (["APPROACH", "APP", "IAP", "PA", "PF", "PI"].includes(raw)) return "approach";
  if (["SID", "PD", "PE"].includes(raw)) return "sid";
  if (["STAR", "STARS", "PS"].includes(raw)) return "star";
  return "procedure";
}

function parseProcedureIdParts(rawId) {
  const text = String(rawId ?? "").trim();
  if (!text) return {};
  const parts = text.split(":");
  if (parts[0] !== "procedure") return {};
  return {
    routeType: parts[1] ?? null,
    ident: parts[4] ?? null,
    runwayToken: parts[6] ?? null
  };
}

function deriveProcedureDisplayFromFeature(feature) {
  const parsed = parseProcedureIdParts(feature.get("procedureId") ?? feature.get("id"));
  const ident = String(feature.get("procedureName") ?? feature.get("name") ?? feature.get("ident") ?? parsed.ident ?? "").trim();
  const runwayRaw = String(feature.get("runway") ?? feature.get("runwayName") ?? feature.get("runwayId") ?? parsed.runwayToken ?? "").trim();
  const runway = runwayRaw.replace(/^runway:/i, "");
  const transition = String(feature.get("transition") ?? feature.get("transitionId") ?? "").trim();
  const parts = [];
  if (ident) parts.push(ident);
  if (runway) parts.push(runway);
  if (transition && transition !== runway) parts.push(transition);
  return parts.join(" ") || ident || transition || runway || "";
}

function procedureLabelText(feature, descriptor, zoom) {
  if (zoom >= 13) {
    const fixLabel = String(feature.get("fixIdent") ?? feature.get("fixId") ?? feature.get("ident") ?? "").trim();
    if (fixLabel) return fixLabel;
  }
  return deriveProcedureDisplayFromFeature(feature);
}

function withAlpha(rgba, alpha) {
  const match = /^rgba\(([^,]+),([^,]+),([^,]+),([^)]+)\)$/.exec(String(rgba));
  if (!match) return rgba;
  return `rgba(${match[1].trim()}, ${match[2].trim()}, ${match[3].trim()}, ${alpha})`;
}

export function isFeatureVisibleAtZoom(feature, descriptor, zoom) {
  if (!Number.isFinite(zoom)) return true;
  const baseMin = Number.isFinite(feature.get("minZoom")) ? feature.get("minZoom") : descriptor?.minZoom;
  const baseMax = descriptor?.maxZoom;
  const importance = parseImportanceFromOlFeature(feature);
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

export function getLabelRule(feature, descriptor, zoom, fallbackMinZoom = 7) {
  const layerClass = classifyLayer(descriptor?.styleHint);
  const fields = Array.isArray(descriptor?.label?.fields) ? descriptor.label.fields : ["name", "ident", "id"];
  const text = layerClass === "procedure"
    ? procedureLabelText(feature, descriptor, zoom)
    : String(fields.map((f) => feature.get(f)).find((v) => String(v ?? "").trim()) || "").trim();
  if (!text) return { enabled: false };

  const importance = parseImportanceFromOlFeature(feature);
  const baseMin = Number.isFinite(descriptor?.label?.minZoom) ? descriptor.label.minZoom : fallbackMinZoom;
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

  return { enabled: true, text, minZoom, priority: getLabelPriority(feature, descriptor) };
}

export function getChartStyleToken(feature, descriptor, zoom) {
  if (!isFeatureVisibleAtZoom(feature, descriptor, zoom)) return null;
  const layerClass = classifyLayer(descriptor?.styleHint);
  const importance = parseImportanceFromOlFeature(feature);

  if (layerClass === "airspace") {
    const { category, styleClass, importance: categorizedImportance } = categorizeAirspaceFeature(feature);
    const palette = airspacePaletteForCategory(category, styleClass, categorizedImportance);
    const widthBoost = styleClass === "class-b"
      ? 0.45
      : (styleClass === "class-c" ? 0.3 : (styleClass === "danger" ? 0.25 : 0));
    const width = zoom >= 11
      ? (categorizedImportance === "major" ? 1.85 + widthBoost : 1.45 + widthBoost)
      : (categorizedImportance === "major" ? 1.55 + widthBoost : 1.15 + widthBoost);
    return {
      kind: "airspace",
      stroke: palette.stroke,
      fill: zoom >= 10 ? palette.fill : withAlpha(palette.fill, categorizedImportance === "major" ? 0.04 : 0.024),
      lineDash: palette.lineDash,
      width
    };
  }

  if (layerClass === "airway") {
    const major = classifyAirwayTier(feature) === "major";
    const palette = major ? AIRWAY_STYLE_PALETTE.major : AIRWAY_STYLE_PALETTE.minor;
    return {
      kind: "airway",
      stroke: palette.stroke,
      casing: palette.casing,
      width: zoom >= 10 ? (major ? 1.7 : 1.15) : (major ? 1.3 : 0.85),
      casingWidth: zoom >= 10 ? (major ? 2.6 : 1.85) : (major ? 2.1 : 1.45)
    };
  }

  if (layerClass === "airport") {
    const major = importance === "major";
    const facilityType = normalizeTextForMatching(firstText(feature, ["facilityType", "airportType", "type"]));
    const isHeliport = descriptor?.styleHint === "heliport" || layerHintOfFeature(feature).startsWith("heliport") || facilityType.includes("HEL") || facilityType === "HP";
    return {
      kind: "airport",
      symbol: isHeliport ? "heliport" : "airport",
      radius: zoom >= 10 ? (major ? 6.4 : 5.4) : (major ? 5.8 : 4.8),
      fill: isHeliport ? (major ? "#6e5a1f" : "#8e7330") : (major ? "#173a68" : "#39618e"),
      stroke: "#ffffff",
      strokeWidth: major ? 1.4 : 1.1
    };
  }

  if (layerClass === "runway") {
    return { kind: "runway", stroke: "#2b2b2b", width: zoom >= 12 ? 3.4 : 2.6 };
  }

  if (layerClass === "waypoint") {
    const isNavaid = descriptor?.styleHint === "navaid" || layerHintOfFeature(feature) === "navaids" || layerHintOfFeature(feature) === "navaid";
    const usage = normalizeTextForMatching(feature.get("usage"));
    const compulsory = usage === "B";
    return {
      kind: "waypoint",
      symbol: isNavaid ? navaidSymbolForFeature(feature) : (compulsory ? "waypoint-compulsory" : "waypoint"),
      radius: zoom >= 13 ? (importance === "major" ? 3.1 : 2.5) : (importance === "major" ? 2.6 : 2.1),
      fill: isNavaid ? "#4f5c90" : (compulsory ? "#436f8b" : "#597b6e"),
      stroke: "#ffffff",
      strokeWidth: 0.9
    };
  }

  if (layerClass === "procedure") {
    const procedureKind = procedureKindFromFeature(feature);
    const layerHint = layerHintOfFeature(feature);
    const isAnnotation = layerHint === "procedure-annotation";
    const depictionClass = String(feature.get("depictionClass") ?? "").trim().toLowerCase();
    const isHold = descriptor?.styleHint === "hold" || layerHintOfFeature(feature) === "hold" || layerHintOfFeature(feature) === "holds" || depictionClass === "hold";
    const isArc = depictionClass === "chart-arc";
    const isOpenLeg = depictionClass === "open-leg";
    const isChartPoint = depictionClass === "chart-point";
    const chartObjectClass = String(feature.get("chartObjectClass") ?? "").trim().toLowerCase();
    const approximationLevel = String(feature.get("approximationLevel") ?? "").trim().toLowerCase();
    if (isAnnotation) {
      return {
        kind: "procedure",
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
      ? { stroke: "rgba(67, 92, 34, 0.98)", casing: "rgba(255, 255, 255, 0.82)", lineDash: null }
      : isArc
        ? { stroke: "rgba(36, 105, 132, 0.98)", casing: "rgba(255, 255, 255, 0.82)", lineDash: null }
        : isOpenLeg
          ? { stroke: "rgba(144, 108, 36, 0.98)", casing: "rgba(255, 255, 255, 0.8)", lineDash: [9, 6] }
      : procedureKind === "approach"
        ? { stroke: "rgba(176, 52, 52, 0.96)", casing: "rgba(255, 255, 255, 0.78)", lineDash: [10, 4, 2, 4] }
        : procedureKind === "star"
          ? { stroke: "rgba(43, 118, 157, 0.94)", casing: "rgba(255, 255, 255, 0.75)", lineDash: [10, 6] }
          : { stroke: "rgba(150, 97, 45, 0.96)", casing: "rgba(255, 255, 255, 0.74)", lineDash: null };
    const lineDash = isOpenLeg
      ? [9, 6]
      : (approximationLevel === "approximate" ? [10, 5] : palette.lineDash);
    return {
      kind: "procedure",
      stroke: palette.stroke,
      casing: palette.casing,
      casingWidth: zoom >= 14
        ? (isHold ? 3.1 : (isArc ? 3 : 2.8))
        : (isHold ? 2.7 : (isArc ? 2.6 : 2.35)),
      width: zoom >= 14
        ? (isHold ? 2.4 : (isArc ? 2.35 : (procedureKind === "approach" ? 2.4 : 2)))
        : (isHold ? 2.1 : (isArc ? 2.05 : (procedureKind === "approach" ? 2.1 : 1.7))),
      lineDash,
      pointFill: palette.stroke,
      pointRadius: isChartPoint ? (zoom >= 13 ? 3.6 : 3) : 0
    };
  }

  return { kind: "default" };
}
