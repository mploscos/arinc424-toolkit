import { deriveProcedureDisplay } from "./style-system.js";
import {
  CHART_MODE_ENROUTE,
  CHART_MODE_PROCEDURE,
  CHART_MODE_TERMINAL,
  normalizeChartMode
} from "./chart-modes.js";
import { bboxIntersects, getFeatureBBox } from "./spatial-helpers.js";

function layerName(feature, descriptor) {
  const props = feature?.properties ?? feature ?? {};
  return String(props.layer ?? feature?.layer ?? descriptor?.name ?? "").toLowerCase();
}

function isProcedureLayer(layer) {
  return layer === "procedure" || layer === "procedures" || layer === "hold" || layer === "holds";
}

function matchesFocusFix(feature, focus) {
  if (!focus?.selected || !focus.fixIdents?.size) return false;
  const props = feature?.properties ?? feature ?? {};
  const ident = String(props.ident ?? props.fixIdent ?? props.fixId ?? "").trim();
  return ident ? focus.fixIdents.has(ident) : false;
}

export function getLabelRuleForChartMode({
  feature,
  descriptor,
  baseRule,
  zoom,
  mode,
  procedureState = {},
  focusContext = {},
  spatialContext = {}
}) {
  if (!baseRule?.enabled) return baseRule;
  const chartMode = normalizeChartMode(mode);
  const layer = layerName(feature, descriptor);
  const out = { ...baseRule };

  if (chartMode === CHART_MODE_ENROUTE) {
    if (layer === "airspaces" || layer === "airspace") {
      out.minZoom = Math.max(out.minZoom, 7);
      return zoom >= out.minZoom ? out : { enabled: false };
    }
    if (layer === "airports" || layer === "airport") {
      out.minZoom = Math.max(out.minZoom, 8);
      return zoom >= out.minZoom ? out : { enabled: false };
    }
    return { enabled: false };
  }

  if (chartMode === CHART_MODE_TERMINAL) {
    if (spatialContext.terminalFocusBBox && !bboxIntersects(getFeatureBBox(feature), spatialContext.terminalFocusBBox)) {
      return { enabled: false };
    }
    if (layer === "airways" || layer === "airway") out.minZoom = Math.max(out.minZoom, 11);
    if (layer === "waypoints" || layer === "waypoint") out.minZoom = Math.max(out.minZoom, 13);
    if (isProcedureLayer(layer)) {
      out.minZoom = Math.max(out.minZoom, 10);
      const meta = deriveProcedureDisplay(feature?.properties ?? feature ?? {});
      const selected = procedureState.selected && procedureState.selected !== "all" && meta.key === procedureState.selected;
      if (!selected) return { enabled: false };
    }
    return zoom >= out.minZoom ? out : { enabled: false };
  }

  if (chartMode === CHART_MODE_PROCEDURE) {
    if (spatialContext.procedureFocusBBox && !bboxIntersects(getFeatureBBox(feature), spatialContext.procedureFocusBBox)) {
      return { enabled: false };
    }
    if (isProcedureLayer(layer)) {
      const meta = deriveProcedureDisplay(feature?.properties ?? feature ?? {});
      if (focusContext?.selected && meta.key !== focusContext.selectedKey) return { enabled: false };
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
