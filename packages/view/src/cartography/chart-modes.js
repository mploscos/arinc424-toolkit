export const CHART_MODE_ENROUTE = "ENROUTE";
export const CHART_MODE_TERMINAL = "TERMINAL";
export const CHART_MODE_PROCEDURE = "PROCEDURE";

export const CHART_MODES = Object.freeze([
  CHART_MODE_ENROUTE,
  CHART_MODE_TERMINAL,
  CHART_MODE_PROCEDURE
]);

export function normalizeChartMode(rawMode) {
  const value = String(rawMode ?? "").trim().toUpperCase();
  if (CHART_MODES.includes(value)) return value;
  return CHART_MODE_TERMINAL;
}

export function isProcedureMode(mode) {
  return normalizeChartMode(mode) === CHART_MODE_PROCEDURE;
}
