import {
  categorizeAirspaceFeatureProperties,
  classifyAirwayTier,
  deriveProcedureDisplay
} from "./style-system.js";
import {
  CHART_MODE_ENROUTE,
  CHART_MODE_PROCEDURE,
  CHART_MODE_TERMINAL,
  normalizeChartMode
} from "./chart-modes.js";
import { bboxIntersects, getFeatureBBox } from "./spatial-helpers.js";

function propsOf(feature) {
  return feature?.properties ?? feature ?? {};
}

function layerName(feature, descriptor) {
  const props = propsOf(feature);
  return String(props.layer ?? feature?.layer ?? descriptor?.name ?? "").toLowerCase();
}

function matchesFocusAirport(feature, focus) {
  if (!focus?.airport) return false;
  const props = propsOf(feature);
  const values = [
    props.airportIdent,
    props.airportId,
    props.ident,
    props.icao,
    props.name
  ].map((v) => String(v ?? "").trim());
  return values.some((value) => value === focus.airport || value.endsWith(`:${focus.airport}`));
}

function matchesFocusRunway(feature, focus) {
  if (!focus?.runway) return false;
  const props = propsOf(feature);
  const values = [
    props.runway,
    props.runwayId,
    props.name,
    props.ident
  ].map((v) => String(v ?? "").trim());
  return values.some((value) => value === focus.runway || value.endsWith(`:${focus.runway}`));
}

function matchesFocusFix(feature, focus) {
  if (!focus?.selected || !focus.fixIdents?.size) return false;
  const props = propsOf(feature);
  const ident = String(props.ident ?? props.fixIdent ?? props.fixId ?? "").trim();
  return ident ? focus.fixIdents.has(ident) : false;
}

function isProcedureLayer(layer) {
  return [
    "procedure",
    "procedures",
    "hold",
    "holds",
    "procedure-annotations",
    "procedure-editorial"
  ].includes(layer);
}

export function isFeatureVisibleInChartMode({
  feature,
  descriptor,
  zoom,
  mode,
  procedureState = {},
  focusContext = {},
  spatialContext = {}
}) {
  const chartMode = normalizeChartMode(mode);
  const layer = layerName(feature, descriptor);
  const props = propsOf(feature);

  if (chartMode === CHART_MODE_ENROUTE) {
    if (isProcedureLayer(layer)) return false;
    if (layer === "waypoints" || layer === "waypoint" || layer === "holds" || layer === "hold") return false;
    if (layer === "runways") return false;
    if (layer === "airways" || layer === "airway") return classifyAirwayTier(feature) === "major";
    if (layer === "airports" || layer === "airport") return String(props.importance ?? "").toLowerCase() === "major";
    if (layer === "navaids" || layer === "navaid") return classifyAirwayTier(props) === "major" || zoom >= 7;
    if (layer === "airspaces" || layer === "airspace") {
      const airspace = categorizeAirspaceFeatureProperties(feature);
      return airspace.category === "restrictive"
        || airspace.category === "special-use"
        || airspace.importance === "major";
    }
    return false;
  }

  if (chartMode === CHART_MODE_TERMINAL) {
    const inTerminalFocus = !spatialContext.terminalContextBBox || bboxIntersects(getFeatureBBox(feature), spatialContext.terminalContextBBox);
    const inTerminalLocal = !spatialContext.terminalFocusBBox || bboxIntersects(getFeatureBBox(feature), spatialContext.terminalFocusBBox);
    if (isProcedureLayer(layer)) {
      const meta = deriveProcedureDisplay(props);
      const selected = procedureState.selected && procedureState.selected !== "all" && meta.key === procedureState.selected;
      return Boolean(selected || procedureState.show);
    }
    if (layer === "airspaces" || layer === "airspace") {
      if (!inTerminalFocus) return false;
      const airspace = categorizeAirspaceFeatureProperties(feature);
      if (airspace.category === "fallback" && airspace.importance !== "major") return zoom >= 9;
      return true;
    }
    if (layer === "airways" || layer === "airway") {
      if (!inTerminalFocus) return false;
      return zoom >= 10;
    }
    if (layer === "waypoints" || layer === "waypoint") return inTerminalLocal && zoom >= 10;
    if (layer === "navaids" || layer === "navaid") return inTerminalLocal && zoom >= 9;
    if (layer === "runways") return inTerminalLocal && zoom >= 10;
    if (layer === "airports" || layer === "airport" || layer === "heliports" || layer === "heliport") {
      return inTerminalFocus || matchesFocusAirport(feature, focusContext);
    }
    if (spatialContext.terminalContextBBox) return inTerminalFocus;
    return true;
  }

  if (chartMode === CHART_MODE_PROCEDURE) {
    const inProcedureContext = !spatialContext.procedureContextBBox || bboxIntersects(getFeatureBBox(feature), spatialContext.procedureContextBBox);
    const inProcedureFocus = !spatialContext.procedureFocusBBox || bboxIntersects(getFeatureBBox(feature), spatialContext.procedureFocusBBox);
    if (isProcedureLayer(layer)) {
      const meta = deriveProcedureDisplay(props);
      if (focusContext?.selected) return meta.key === focusContext.selectedKey;
      return Boolean(procedureState.show);
    }
    if (layer === "airways" || layer === "airway") return false;
    if (layer === "waypoints" || layer === "waypoint" || layer === "navaids" || layer === "navaid") {
      return inProcedureFocus && matchesFocusFix(feature, focusContext);
    }
    if (layer === "runways") return matchesFocusRunway(feature, focusContext) || matchesFocusAirport(feature, focusContext);
    if (layer === "airports" || layer === "airport" || layer === "heliports" || layer === "heliport") {
      return (matchesFocusAirport(feature, focusContext) || (!focusContext.selected && zoom >= 9)) && inProcedureContext;
    }
    if (layer === "airspaces" || layer === "airspace") {
      if (!inProcedureContext) return false;
      const airspace = categorizeAirspaceFeatureProperties(feature);
      return airspace.category === "restrictive"
        || airspace.category === "special-use"
        || airspace.category === "terminal-controlled";
    }
    return false;
  }

  return true;
}
