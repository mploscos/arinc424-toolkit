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
