import {
  CHART_MODE_ENROUTE,
  CHART_MODE_PROCEDURE,
  CHART_MODE_TERMINAL,
  normalizeChartMode
} from "./chart-modes.js";
import { bboxIntersects, getFeatureBBox } from "./spatial-helpers.js";

function readFeatureValue(feature, fields = []) {
  for (const field of fields) {
    const value = feature.get(field);
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

function parseImportance(feature) {
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

function classifyAirwayTier(feature) {
  const importance = parseImportance(feature);
  const routeType = readFeatureValue(feature, ["routeType", "airwayType", "classification", "airwayName", "name"]).toUpperCase();
  if (importance === "major") return "major";
  if (/JET|HIGH|UPPER|\bQ\d|\bJ\d|^Q$|^J$/.test(routeType)) return "major";
  return "minor";
}

function categorizeAirspace(feature) {
  const importance = parseImportance(feature);
  const restrictiveType = readFeatureValue(feature, ["restrictiveType"]).toUpperCase();
  const classText = readFeatureValue(feature, ["airspaceClass", "classification", "class", "type", "airspaceType", "usage", "name"]).toUpperCase();
  if (restrictiveType || /RESTRICT|PROHIB|DANGER/.test(classText)) return { category: "restrictive", importance };
  if (/MOA|WARNING|ALERT|SPECIAL USE/.test(classText)) return { category: "special-use", importance };
  if (/CLASS B|(^|[^A-Z])B($|[^A-Z])|CLASS C|(^|[^A-Z])C($|[^A-Z])/.test(classText)) {
    return { category: "terminal-controlled", importance: importance === "unknown" ? "major" : importance };
  }
  if (/CLASS D|(^|[^A-Z])D($|[^A-Z])|CLASS E|(^|[^A-Z])E($|[^A-Z])|CTR|TMA|CTA|CONTROL/.test(classText)) {
    return { category: "controlled", importance };
  }
  return { category: "fallback", importance };
}

function matchesFocusAirport(feature, focus) {
  if (!focus?.airport) return false;
  const values = [
    feature.get("airportIdent"),
    feature.get("airportId"),
    feature.get("ident"),
    feature.get("icao"),
    feature.get("name")
  ].map((v) => String(v ?? "").trim());
  return values.some((value) => value === focus.airport || value.endsWith(`:${focus.airport}`));
}

function matchesFocusRunway(feature, focus) {
  if (!focus?.runway) return false;
  const values = [
    feature.get("runway"),
    feature.get("runwayId"),
    feature.get("name"),
    feature.get("ident")
  ].map((v) => String(v ?? "").trim());
  return values.some((value) => value === focus.runway || value.endsWith(`:${focus.runway}`));
}

function matchesFocusFix(feature, focus) {
  if (!focus?.selected || !focus.fixIdents?.size) return false;
  const ident = String(feature.get("ident") ?? feature.get("fixIdent") ?? feature.get("fixId") ?? "").trim();
  return ident ? focus.fixIdents.has(ident) : false;
}

function isProcedureLayer(layer) {
  return ["procedure", "procedures", "hold", "holds", "procedure-annotations", "procedure-editorial"].includes(layer);
}

export function isFeatureVisibleInChartMode({
  feature,
  descriptor,
  zoom,
  mode,
  procedureState = {},
  focusContext = {},
  spatialContext = {},
  deriveProcedureDisplayFromFeature
}) {
  const chartMode = normalizeChartMode(mode);
  const layer = String(feature.get("layer") || descriptor?.name || "").toLowerCase();

  if (chartMode === CHART_MODE_ENROUTE) {
    if (isProcedureLayer(layer) || layer === "runways" || layer === "waypoints" || layer === "holds") return false;
    if (layer === "airways") return classifyAirwayTier(feature) === "major";
    if (layer === "airports") return parseImportance(feature) === "major";
    if (layer === "navaids") return parseImportance(feature) === "major" || zoom >= 7;
    if (layer === "airspaces") {
      const airspace = categorizeAirspace(feature);
      return airspace.category === "restrictive" || airspace.category === "special-use" || airspace.importance === "major";
    }
    return false;
  }

  if (chartMode === CHART_MODE_TERMINAL) {
    const featureBBox = getFeatureBBox(feature);
    const inTerminalFocus = !spatialContext.terminalContextBBox || bboxIntersects(featureBBox, spatialContext.terminalContextBBox);
    const inTerminalLocal = !spatialContext.terminalFocusBBox || bboxIntersects(featureBBox, spatialContext.terminalFocusBBox);
    if (isProcedureLayer(layer)) {
      const meta = deriveProcedureDisplayFromFeature(feature);
      const selected = procedureState.selected && procedureState.selected !== "all" && (meta.familyKey || meta.key) === procedureState.selected;
      return Boolean(selected || procedureState.show);
    }
    if (layer === "airspaces") {
      if (!inTerminalFocus) return false;
      const airspace = categorizeAirspace(feature);
      if (airspace.category === "fallback" && airspace.importance !== "major") return zoom >= 9;
      return true;
    }
    if (layer === "airways") return inTerminalFocus && zoom >= 10;
    if (layer === "waypoints") return inTerminalLocal && zoom >= 10;
    if (layer === "navaids") return inTerminalLocal && zoom >= 9;
    if (layer === "runways") return inTerminalLocal && zoom >= 10;
    if (layer === "airports" || layer === "heliports") return inTerminalFocus || matchesFocusAirport(feature, focusContext);
    if (spatialContext.terminalContextBBox) return inTerminalFocus;
    return true;
  }

  if (chartMode === CHART_MODE_PROCEDURE) {
    const featureBBox = getFeatureBBox(feature);
    const inProcedureContext = !spatialContext.procedureContextBBox || bboxIntersects(featureBBox, spatialContext.procedureContextBBox);
    const inProcedureFocus = !spatialContext.procedureFocusBBox || bboxIntersects(featureBBox, spatialContext.procedureFocusBBox);
    if (isProcedureLayer(layer)) {
      const meta = deriveProcedureDisplayFromFeature(feature);
      if (focusContext?.selected) return (meta.familyKey || meta.key) === focusContext.selectedKey;
      return Boolean(procedureState.show);
    }
    if (layer === "airways") return false;
    if (layer === "waypoints" || layer === "navaids") return inProcedureFocus && matchesFocusFix(feature, focusContext);
    if (layer === "runways") return matchesFocusRunway(feature, focusContext) || matchesFocusAirport(feature, focusContext);
    if (layer === "airports" || layer === "heliports") return (matchesFocusAirport(feature, focusContext) || (!focusContext.selected && zoom >= 9)) && inProcedureContext;
    if (layer === "airspaces") {
      if (!inProcedureContext) return false;
      const airspace = categorizeAirspace(feature);
      return airspace.category === "restrictive" || airspace.category === "special-use" || airspace.category === "terminal-controlled";
    }
    return false;
  }

  return true;
}
