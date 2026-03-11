import { ARINC_OL_THEME } from "./arinc-ol-config.js";

/**
 * Build an OL flatstyle "match" expression from a key-value map.
 * @param {string} property
 * @param {Record<string, any>} map
 * @param {any} fallback
 * @returns {any[]}
 */
function matchByProperty(property, map, fallback) {
  const expr = ["match", ["get", property]];
  for (const [k, v] of Object.entries(map)) {
    if (k === "default") continue;
    expr.push(k, v);
  }
  expr.push(fallback);
  return expr;
}

/**
 * Create a WebGL flat style for ARINC-424 line/polygon features.
 * Uses ICAO/AIP-like route/category attributes for enroute readability.
 * @returns {import("ol/style/flat").FlatStyle}
 */
export function createArincWebglLineStyle() {
  const theme = ARINC_OL_THEME.webgl.line;
  const er = theme.stroke.erFamily;
  const widths = theme.width;
  return {
    "stroke-color": [
      "case",
      // Conventional/upper ATS black, RNAV blue, OTC black dashed.
      ["==", ["get", "type"], "ER"],
      [
        "case",
        ["==", ["get", "routeFamily"], "RNAV"], er.RNAV,
        ["==", ["get", "routeFamily"], "OTC"], er.OTC,
        er.default
      ],
      // Flight procedures.
      ["==", ["get", "type"], "PD"], theme.stroke.byType.PD,
      ["==", ["get", "type"], "PE"], theme.stroke.byType.PE,
      ["==", ["get", "type"], "PF"], theme.stroke.byType.PF,
      ["==", ["get", "type"], "EP"], theme.stroke.byType.EP,
      ["==", ["get", "type"], "ET"], theme.stroke.byType.ET,
      // Controlled/restricted/FIR boundaries.
      ["==", ["get", "type"], "UC"],
      matchByProperty("classification", theme.stroke.ucByClass, theme.stroke.ucByClass.default),
      ["==", ["get", "type"], "UR"],
      matchByProperty("restrictiveType", theme.stroke.urByType, theme.stroke.urByType.default),
      ["==", ["get", "type"], "UF"], theme.stroke.byType.UF,
      theme.stroke.default
    ],
    "stroke-width": [
      "case",
      ["==", ["get", "type"], "ER"],
      [
        "case",
        ["==", ["get", "routeFamily"], "RNAV"], widths.erFamily.RNAV,
        ["==", ["get", "routeFamily"], "OTC"], widths.erFamily.OTC,
        widths.erFamily.default
      ],
      matchByProperty("type", widths.byType, widths.default)
    ],
    "fill-color": [
      "case",
      ["==", ["get", "type"], "UC"],
      matchByProperty("classification", theme.fill.ucByClass, theme.fill.ucByClass.default),
      ["==", ["get", "type"], "UR"],
      matchByProperty("restrictiveType", theme.fill.urByType, theme.fill.urByType.default),
      ["==", ["get", "type"], "UF"], theme.fill.uf,
      theme.fill.default
    ]
  };
}

/**
 * Create a WebGL flat style for ARINC-424 point features.
 * @returns {import("ol/style/flat").FlatStyle}
 */
export function createArincWebglPointStyle() {
  const point = ARINC_OL_THEME.webgl.point;
  return {
    "circle-radius": matchByProperty("type", point.radiusByType, point.radiusByType.default),
    "circle-fill-color": matchByProperty("type", point.fillByType, point.fillByType.default),
    "circle-stroke-color": matchByProperty("type", point.strokeByType, point.strokeByType.default),
    "circle-stroke-width": point.strokeWidth
  };
}

/**
 * Style for ER segments flagged as unusable.
 * @returns {import("ol/style/flat").FlatStyle}
 */
export function createArincWebglUnusableStyle() {
  const style = ARINC_OL_THEME.webgl.unusable;
  return {
    "stroke-color": style.strokeColor,
    "stroke-width": style.strokeWidth,
    "stroke-line-dash": style.strokeDash
  };
}

/**
 * Style for OTC routes.
 * @returns {import("ol/style/flat").FlatStyle}
 */
export function createArincWebglOtcStyle() {
  const style = ARINC_OL_THEME.webgl.otc;
  return {
    "stroke-color": style.strokeColor,
    "stroke-width": style.strokeWidth,
    "stroke-line-dash": style.strokeDash
  };
}

/**
 * Style for UC/UR/UF polygon overlays.
 * @returns {import("ol/style/flat").FlatStyle}
 */
export function createArincWebglSpecialAirspaceStyle() {
  const style = ARINC_OL_THEME.webgl.specialAirspace;
  return {
    "stroke-color": [
      "case",
      ["==", ["get", "type"], "UC"],
      matchByProperty("classification", style.stroke.ucByClass, style.stroke.ucByClass.default),
      ["==", ["get", "type"], "UF"], style.stroke.uf,
      matchByProperty("restrictiveType", style.stroke.urByType, style.stroke.urByType.default)
    ],
    "stroke-width": [
      "case",
      ["==", ["get", "type"], "UF"], style.strokeWidth.uf,
      ["==", ["get", "type"], "UC"], style.strokeWidth.uc,
      style.strokeWidth.default
    ],
    // Keep dash constant; OL WebGL does not robustly support expression-based dash arrays.
    "stroke-line-dash": style.strokeDash,
    "fill-color": [
      "case",
      ["==", ["get", "type"], "UC"],
      matchByProperty("classification", style.fill.ucByClass, style.fill.ucByClass.default),
      ["==", ["get", "type"], "UF"], style.fill.uf,
      matchByProperty("restrictiveType", style.fill.urByType, style.fill.urByType.default)
    ]
  };
}

/**
 * Assign a route family from route id/type for style expressions.
 * @param {string|null|undefined} route
 * @param {string|null|undefined} routeType
 * @returns {"OTC"|"RNAV"|"CONVENTIONAL"}
 */
export function routeFamily(route, routeType) {
  const r = String(route || "").toUpperCase();
  const rt = String(routeType || "").toUpperCase();
  if (r.includes("OTC") || rt === "O") return "OTC";
  if (/^[QTNPLMUL]/.test(r) || rt === "R") return "RNAV";
  return "CONVENTIONAL";
}

/**
 * Whether a feature should be treated as unusable/closed.
 * @param {import("ol/Feature").default} feature
 * @returns {boolean}
 */
export function isUnusableFeature(feature) {
  const keys = ["unusable", "usable", "status", "routeStatus", "state", "remarks", "note"];
  for (const k of keys) {
    const v = feature.get(k);
    if (v == null) continue;
    if (k === "unusable" && (v === true || String(v).toLowerCase() === "true")) return true;
    if (k === "usable" && (v === false || String(v).toLowerCase() === "false")) return true;
    const s = String(v).toLowerCase();
    if (/unusable|closed|withdrawn|decommission|not\s+usable|invalid/.test(s)) return true;
  }
  return false;
}

/**
 * Default technical label resolver for altitude constraints.
 * @param {import("ol/Feature").default} feature
 * @returns {string}
 */
export function defaultTechnicalLabelForFeature(feature) {
  const entries = [];
  const candidates = [
    ["MEA", "mea"],
    ["MOCA", "moca"],
    ["MRA", "mra"],
    ["MCA", "mca"],
    ["MTA", "mta"],
    ["MAA", "maa"],
    ["GMEA", "gnssMea"]
  ];
  for (const [tag, key] of candidates) {
    const v = feature.get(key);
    if (v == null || v === "") continue;
    entries.push(`${tag} ${v}`);
  }
  return entries.join("  ");
}

/**
 * Default label resolver for ARINC-424 features.
 * @param {import("ol/Feature").default} feature
 * @returns {string}
 */
export function defaultLabelForFeature(feature) {
  const type = feature.get("type") || "";
  const source = feature.get("source") || "";
  // Avoid falling back to opaque IDs in labels.
  const isXmlSource = typeof source === "string" && /\.xml$/i.test(source);
  /**
   * Pick a primary label, falling back to an alternate value.
   * @param {string|null} primary
   * @param {string|null} fallback
   * @returns {string|null}
   */
  const pickText = (primary, fallback) => (primary && String(primary).trim()) ? primary : fallback;
  const toFeetLabel = (value, uom) => {
    if (value == null || value === "") return "";
    const n = Number(String(value).trim().replace(",", "."));
    if (!Number.isFinite(n)) return "";
    const uu = String(uom || "").trim().toUpperCase();
    let ft = n;
    if (uu === "M" || uu === "METRE" || uu === "METER" || uu === "METERS") ft = n * 3.28084;
    return `${Math.round(ft)}FT`;
  };
  const formatNavaidFrequency = (raw, t) => {
    if (raw == null || raw === "") return "";
    const s = String(raw).trim();
    if (!s) return "";
    if (!/^\d+$/.test(s)) return s;
    const n = Number(s);
    if (String(t).toUpperCase() === "D") {
      // ARINC VHF navaid frequencies are typically hundredths of MHz, e.g. 11510 -> 115.10
      return (n / 100).toFixed(2);
    }
    if (String(t).toUpperCase() === "DB") {
      // ARINC NDB frequencies are usually tenths of kHz, e.g. 03400 -> 340.0
      return (n / 10).toFixed(1);
    }
    return s;
  };
  if (type === "ER") {
    const route = feature.get("route") || feature.get("routeId") || "";
    const lo = feature.get("minAlt") ?? feature.get("lowerLimit");
    const hi = feature.get("maxAlt") ?? feature.get("upperLimit");
    const loUom = feature.get("lowerLimitUom");
    const hiUom = feature.get("upperLimitUom");
    const loText = formatFlightLevelText(lo, loUom);
    const hiText = formatFlightLevelText(hi, hiUom);
    const range = loText || hiText ? `${loText || "?"}-${hiText || "?"}` : "";
    return singleLine(range ? `${route} ${range}` : route);
  }
  if (type === "PA") {
    const label = pickText(feature.get("name"), feature.get("designator"));
    return isXmlSource ? (label || "") : (label || feature.get("id") || "");
  }
  if (type === "PG") {
    const rid = pickText(feature.get("runwayId"), feature.get("name"));
    const apt = pickText(feature.get("airportId"), feature.get("icao"));
    return singleLine([apt, rid].filter(Boolean).join(" "));
  }
  if (type === "D" || type === "DB") {
    const freq = formatNavaidFrequency(feature.get("frequency"), type);
    const label = pickText(feature.get("name"), feature.get("id"));
    const channel = pickText(feature.get("channel"), feature.get("tacanChannel"));
    const chText = channel ? `ch ${channel}` : "";
    const text = [label, freq, chText].filter(Boolean).join(" ");
    if (text) return singleLine(text);
    return isXmlSource ? (label || "") : (label || feature.get("id") || "");
  }
  if (type === "EP") {
    const base = pickText(feature.get("name"), feature.get("designator"));
    const name = isXmlSource ? (base || "") : (base || feature.get("id") || "");
    const td = feature.get("turnDir") || "";
    return td ? `${name} ${td}` : name;
  }
  if (type === "PD" || type === "PE" || type === "PF") {
    const sharedCount = Number(feature.get("sharedCount"));
    if (Number.isFinite(sharedCount) && sharedCount > 1) {
      const kind = type === "PD" ? "SID" : type === "PE" ? "STAR" : "APP";
      const path = pickText(feature.get("legPathTerm"), feature.get("pathTerm"));
      const turns = pickText(feature.get("turnDir"), null);
      const rwys = Array.isArray(feature.get("sharedRunways"))
        ? feature.get("sharedRunways").filter(Boolean).slice(0, 3).join("/")
        : pickText(feature.get("runwayId"), feature.get("runway"));
      const text = [kind, `x${sharedCount}`, rwys, [path, turns].filter(Boolean).join(" ")].filter(Boolean).join(" ");
      return singleLine(text);
    }
    const kind = type === "PD" ? "SID" : type === "PE" ? "STAR" : "APP";
    const proc = pickText(feature.get("procId"), feature.get("name"));
    const trn = pickText(feature.get("transitionId"), null);
    const legPath = pickText(feature.get("legPathTerm"), feature.get("pathTerm"));
    const turn = pickText(feature.get("turnDir"), null);
    const legacyLegHint = pickText(feature.get("legHint"), null);
    const legHint = [legPath, turn].filter(Boolean).join(" ") || legacyLegHint;
    const legSeq = Number(feature.get("legSeq"));
    const legTotal = Number(feature.get("legTotal"));
    const legPos = Number.isFinite(legSeq) && Number.isFinite(legTotal)
      ? `L${legSeq}/${legTotal}`
      : null;
    const text = [kind, proc, trn, legPos, legHint].filter(Boolean).join(" ");
    return singleLine(text);
  }
  if (type === "ET") {
    const rid = pickText(feature.get("routeId"), feature.get("name"));
    const lev = pickText(feature.get("level"), null);
    return singleLine([rid, lev].filter(Boolean).join(" "));
  }
  if (type === "OBST") {
    const heightTxt =
      toFeetLabel(feature.get("verticalExtent"), feature.get("verticalExtentUom")) ||
      toFeetLabel(feature.get("elevation"), feature.get("elevationUom"));
    const litRaw = String(feature.get("lighted") || "").toUpperCase();
    const lit = litRaw === "YES" || litRaw === "Y" || litRaw === "TRUE" ? "LIT" : null;
    return singleLine([heightTxt, lit].filter(Boolean).join(" "));
  }
  if (type === "OBST_AREA") {
    const n = pickText(feature.get("name"), feature.get("id"));
    const areaType = pickText(feature.get("obstacleAreaType"), feature.get("areaType")) || "OBST AREA";
    return singleLine([n, areaType].filter(Boolean).join(" "));
  }
  if (type === "UC" || type === "UR" || type === "UF") {
    const label = pickText(
      feature.get("name"),
      feature.get("designator") || feature.get("firId") || feature.get("icao")
    );
    return isXmlSource ? (label || "") : (label || feature.get("id") || "");
  }
  const base = pickText(feature.get("name"), feature.get("designator"));
  return isXmlSource ? (base || "") : (base || feature.get("id") || "");
}

/**
 * @param {string} text
 * @returns {string}
 */
function singleLine(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

/**
 * @param {unknown} raw
 * @param {unknown} uom
 * @returns {string}
 */
function formatFlightLevelText(raw, uom) {
  if (raw == null) return "";
  const s = String(raw).trim().toUpperCase();
  if (!s) return "";
  if (s === "UNLTD" || s === "UNL" || s === "U") return "UNLTD";
  if (s.startsWith("FL")) return s;

  const u = String(uom || "").trim().toUpperCase();
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    if (u === "FL") return `FL${n}`;
    if (n >= 10000 && n % 100 === 0) return `FL${Math.round(n / 100)}`;
    if (n >= 1000) return `${n}FT`;
    return String(n);
  }
  return s;
}
