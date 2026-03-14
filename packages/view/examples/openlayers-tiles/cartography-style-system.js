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
  const baseMax = Number.isFinite(feature.get("maxZoom")) ? feature.get("maxZoom") : descriptor?.maxZoom;
  const importance = parseImportanceFromOlFeature(feature);
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
    minZoom = Math.max(minZoom, 9);
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
  let minZoom = importance === "major" ? Math.max(5, baseMin - 1) : baseMin;
  if (layerClass === "waypoint") {
    minZoom = importance === "major" ? Math.max(minZoom, 11) : Math.max(minZoom, 12);
  } else if (layerClass === "airway") {
    minZoom = importance === "major" ? Math.max(minZoom, 8) : Math.max(minZoom, 10);
  } else if (layerClass === "airspace") {
    minZoom = importance === "minor" ? Math.max(minZoom, 9) : minZoom;
  } else if (layerClass === "procedure") {
    minZoom = Math.max(minZoom, 10);
  }
  if (Number.isFinite(zoom) && zoom < minZoom) return { enabled: false };

  const basePriority = Number.isFinite(descriptor?.label?.priority) ? descriptor.label.priority : 20;
  const priorityBoost = layerClass === "procedure" ? 6 : (importance === "major" ? 20 : (importance === "medium" ? 8 : 0));
  return { enabled: true, text, minZoom, priority: basePriority + priorityBoost };
}

export function getChartStyleToken(feature, descriptor, zoom) {
  if (!isFeatureVisibleAtZoom(feature, descriptor, zoom)) return null;
  const layerClass = classifyLayer(descriptor?.styleHint);
  const restrictive = Boolean(feature.get("restrictiveType"));
  const importance = parseImportanceFromOlFeature(feature);

  if (layerClass === "airspace") {
    const width = zoom >= 11 ? (importance === "major" ? 1.9 : 1.5) : (importance === "major" ? 1.6 : 1.2);
    const baseFill = restrictive
      ? (importance === "major" ? "rgba(118, 78, 165, 0.08)" : "rgba(118, 78, 165, 0.05)")
      : (importance === "major" ? "rgba(57, 110, 200, 0.06)" : "rgba(57, 110, 200, 0.035)");
    return {
      kind: "airspace",
      stroke: restrictive ? "rgba(118, 78, 165, 0.95)" : "rgba(57, 110, 200, 0.95)",
      fill: zoom >= 10 ? baseFill : withAlpha(baseFill, importance === "major" ? 0.045 : 0.03),
      lineDash: restrictive ? [6, 4] : null,
      width
    };
  }

  if (layerClass === "airway") {
    const major = importance === "major";
    return {
      kind: "airway",
      stroke: major ? "#df7c1d" : "#efa251",
      casing: major ? "rgba(255, 247, 230, 0.95)" : "rgba(255, 247, 230, 0.7)",
      width: zoom >= 10 ? (major ? 2.1 : 1.4) : (major ? 1.6 : 1.05),
      casingWidth: zoom >= 10 ? (major ? 3.4 : 2.1) : (major ? 2.6 : 1.8)
    };
  }

  if (layerClass === "airport") {
    const major = importance === "major";
    return {
      kind: "airport",
      radius: zoom >= 8 ? (major ? 7 : 6) : (major ? 6 : 5),
      fill: descriptor?.styleHint === "heliport" ? "#805300" : "#1f4f88",
      stroke: "#ffffff",
      strokeWidth: 1.5
    };
  }

  if (layerClass === "runway") {
    return { kind: "runway", stroke: "#2b2b2b", width: zoom >= 12 ? 3.4 : 2.6 };
  }

  if (layerClass === "waypoint") {
    return {
      kind: "waypoint",
      radius: zoom >= 13 ? 3.6 : 2.6,
      fill: descriptor?.styleHint === "navaid" ? "#6940b5" : "#19885f",
      stroke: "#ffffff",
      strokeWidth: 1
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
