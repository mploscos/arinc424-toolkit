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
  if (key === "procedure" || key === "hold") return "procedure";
  return "default";
}

const AIRSPACE_STYLE_PALETTE = Object.freeze({
  controlledMajor: { stroke: "rgba(58, 101, 168, 0.96)", fill: "rgba(58, 101, 168, 0.055)" },
  controlledMinor: { stroke: "rgba(96, 128, 176, 0.9)", fill: "rgba(96, 128, 176, 0.032)" },
  terminalMajor: { stroke: "rgba(39, 132, 150, 0.95)", fill: "rgba(39, 132, 150, 0.05)" },
  terminalMinor: { stroke: "rgba(77, 147, 160, 0.88)", fill: "rgba(77, 147, 160, 0.03)" },
  specialUse: { stroke: "rgba(134, 98, 52, 0.96)", fill: "rgba(134, 98, 52, 0.05)" },
  restrictive: { stroke: "rgba(153, 73, 73, 0.98)", fill: "rgba(153, 73, 73, 0.065)" },
  fallback: { stroke: "rgba(109, 121, 137, 0.88)", fill: "rgba(109, 121, 137, 0.03)" }
});

const AIRWAY_STYLE_PALETTE = Object.freeze({
  major: { stroke: "rgba(120, 134, 149, 0.9)", casing: "rgba(245, 247, 249, 0.78)" },
  minor: { stroke: "rgba(149, 160, 171, 0.72)", casing: "rgba(245, 247, 249, 0.52)" }
});

function normalizeTextForMatching(value) {
  return String(value ?? "").trim().toUpperCase();
}

function categorizeAirspaceFeature(feature) {
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

  if (restrictiveType || /RESTRICT|PROHIB|DANGER/.test(classText)) {
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
    const { category, importance: categorizedImportance } = categorizeAirspaceFeature(feature);
    const palette = airspacePaletteForCategory(category, categorizedImportance);
    const width = zoom >= 11 ? (categorizedImportance === "major" ? 1.85 : 1.45) : (categorizedImportance === "major" ? 1.55 : 1.15);
    return {
      kind: "airspace",
      stroke: palette.stroke,
      fill: zoom >= 10 ? palette.fill : withAlpha(palette.fill, categorizedImportance === "major" ? 0.04 : 0.024),
      lineDash: category === "restrictive" ? [6, 4] : (category === "special-use" ? [4, 4] : null),
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
    return {
      kind: "airport",
      radius: zoom >= 10 ? (major ? 6.4 : 5.4) : (major ? 5.8 : 4.8),
      fill: descriptor?.styleHint === "heliport" ? "#805300" : (major ? "#173a68" : "#39618e"),
      stroke: "#ffffff",
      strokeWidth: major ? 1.4 : 1.1
    };
  }

  if (layerClass === "runway") {
    return { kind: "runway", stroke: "#2b2b2b", width: zoom >= 12 ? 3.4 : 2.6 };
  }

  if (layerClass === "waypoint") {
    return {
      kind: "waypoint",
      radius: zoom >= 13 ? (importance === "major" ? 3.1 : 2.5) : (importance === "major" ? 2.6 : 2.1),
      fill: descriptor?.styleHint === "navaid" ? "#5c6491" : "#597b6e",
      stroke: "#ffffff",
      strokeWidth: 0.9
    };
  }

  if (layerClass === "procedure") {
    const procedureKind = procedureKindFromFeature(feature);
    const legType = String(feature.get("legType") ?? "").toUpperCase();
    return {
      kind: "procedure",
      stroke: descriptor?.styleHint === "hold" ? "#7d4d2a" : "rgba(255, 0, 255, 0.9)",
      width: descriptor?.styleHint === "hold"
        ? (zoom >= 14 ? 1.7 : 1.4)
        : (zoom >= 14 ? (procedureKind === "approach" ? 2.4 : 2) : (procedureKind === "approach" ? 2.1 : 1.7)),
      lineDash: descriptor?.styleHint === "hold" ? [3, 4] : null,
      pointRadius: legType === "IF" ? (zoom >= 13 ? 3.4 : 2.8) : 0
    };
  }

  return { kind: "default" };
}
