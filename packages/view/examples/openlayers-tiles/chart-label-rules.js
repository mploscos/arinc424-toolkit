import {
  CHART_MODE_ENROUTE,
  CHART_MODE_PROCEDURE,
  CHART_MODE_TERMINAL,
  normalizeChartMode
} from "./chart-modes.js";
import { bboxIntersects, getFeatureBBox } from "./spatial-helpers.js";
import { categorizeAirspaceFeature } from "./cartography-style-system.js";

function matchesFocusFix(feature, focus) {
  if (!focus?.selected || !focus.fixIdents?.size) return false;
  const ident = String(feature.get("ident") ?? feature.get("fixIdent") ?? feature.get("fixId") ?? "").trim();
  return ident ? focus.fixIdents.has(ident) : false;
}

function isProcedureLayer(layer) {
  return ["procedure", "procedures", "hold", "holds"].includes(layer);
}

export function getLabelRuleForChartMode({
  feature,
  descriptor,
  baseRule,
  zoom,
  mode,
  procedureState = {},
  focusContext = {},
  spatialContext = {},
  deriveProcedureDisplayFromFeature
}) {
  if (!baseRule?.enabled) return baseRule;
  const chartMode = normalizeChartMode(mode);
  const layer = String(feature.get("layer") || descriptor?.name || "").toLowerCase();
  const out = { ...baseRule };

  if (chartMode === CHART_MODE_ENROUTE) {
    if (layer === "airspaces") {
      const airspace = categorizeAirspaceFeature(feature);
      if (airspace.styleClass === "class-b" || airspace.styleClass === "class-c") out.minZoom = Math.max(out.minZoom, 6);
      else if (airspace.styleClass === "restrictive" || airspace.styleClass === "danger") out.minZoom = Math.max(out.minZoom, 7);
      else if (airspace.styleClass === "class-d" || airspace.styleClass === "moa" || airspace.styleClass === "warning") out.minZoom = Math.max(out.minZoom, 8);
      else out.minZoom = Math.max(out.minZoom, 9);
      return zoom >= out.minZoom ? out : { enabled: false };
    }
    if (layer === "airports") {
      out.minZoom = Math.max(out.minZoom, 8);
      return zoom >= out.minZoom ? out : { enabled: false };
    }
    return { enabled: false };
  }

  if (chartMode === CHART_MODE_TERMINAL) {
    if (spatialContext.terminalFocusBBox && !bboxIntersects(getFeatureBBox(feature), spatialContext.terminalFocusBBox)) {
      return { enabled: false };
    }
    if (layer === "airspaces") {
      const airspace = categorizeAirspaceFeature(feature);
      if (airspace.styleClass === "class-b" || airspace.styleClass === "class-c") out.minZoom = Math.max(out.minZoom, 7);
      else if (airspace.styleClass === "class-d") out.minZoom = Math.max(out.minZoom, 8);
      else if (airspace.styleClass === "class-e" || airspace.styleClass === "fallback") out.minZoom = Math.max(out.minZoom, 10);
      else out.minZoom = Math.max(out.minZoom, 9);
    }
    if (layer === "airways") out.minZoom = Math.max(out.minZoom, 11);
    if (layer === "waypoints") out.minZoom = Math.max(out.minZoom, 13);
    if (isProcedureLayer(layer)) {
      out.minZoom = Math.max(out.minZoom, 10);
      const meta = deriveProcedureDisplayFromFeature(feature);
      const selected = procedureState.selected && procedureState.selected !== "all" && (meta.familyKey || meta.key) === procedureState.selected;
      if (!selected) return { enabled: false };
    }
    return zoom >= out.minZoom ? out : { enabled: false };
  }

  if (chartMode === CHART_MODE_PROCEDURE) {
    if (spatialContext.procedureFocusBBox && !bboxIntersects(getFeatureBBox(feature), spatialContext.procedureFocusBBox)) {
      return { enabled: false };
    }
    if (isProcedureLayer(layer)) {
      const meta = deriveProcedureDisplayFromFeature(feature);
      if (focusContext?.selected && (meta.familyKey || meta.key) !== focusContext.selectedKey) return { enabled: false };
      out.minZoom = Math.max(out.minZoom, 10);
      return zoom >= out.minZoom ? out : { enabled: false };
    }
    if (matchesFocusFix(feature, focusContext)) {
      out.minZoom = Math.max(out.minZoom, 12);
      out.priority += 18;
      return zoom >= out.minZoom ? out : { enabled: false };
    }
    return { enabled: false };
  }

  return out;
}
