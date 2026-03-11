import Stroke from "https://esm.sh/ol@10.7.0/style/Stroke.js";
import Fill from "https://esm.sh/ol@10.7.0/style/Fill.js";
import Icon from "https://esm.sh/ol@10.7.0/style/Icon.js";
import CircleStyle from "https://esm.sh/ol@10.7.0/style/Circle.js";
import Text from "https://esm.sh/ol@10.7.0/style/Text.js";
import Style from "https://esm.sh/ol@10.7.0/style/Style.js";
import { ARINC_OL_THEME } from "./arinc-ol-config.js";
import { defaultLabelForFeature } from "./arinc-webgl-style.js";
import {
  defaultSymbolKeyForFeature,
  symbolDataUrlForKey,
  symbolScaleForKey
} from "./label-atlas.js";

export function createArincOlStyleController() {
  let currentZoom = 6;
  const zoomRules = ARINC_OL_THEME.tileZoomByType || {};
  const phaseRules = ARINC_OL_THEME.chartPhases || {};
  const fixUsageMinZoomRules = ARINC_OL_THEME.fixUsageMinZoom || {};
  const styleCache = new Map();
  const pointStyleCache = new Map();
  const labelStyleCache = new Map();
  const erLabelStyleCache = new Map();
  const erArrowStyleCache = new Map();
  const vorRoseStyleCache = new Map();

  function getStyle(key, def) {
    if (!styleCache.has(key)) styleCache.set(key, def());
    return styleCache.get(key);
  }

  function symbolScaleAtZoom(baseScale, zoom) {
    return zoom <= 6 ? baseScale * 0.8 :
      zoom <= 8 ? baseScale :
      zoom <= 10 ? baseScale * 1.06 :
      baseScale * 1.12;
  }

  function pointStyleForFeature(feature) {
    const symbolKey = defaultSymbolKeyForFeature(feature);
    if (!symbolKey) return null;
    const zoomBucket = Math.floor(currentZoom);
    const type = String(feature.get("type") || feature.get("layer") || "").toUpperCase();

    const cacheKey = `${symbolKey}:${zoomBucket}`;
    if (pointStyleCache.has(cacheKey)) return pointStyleCache.get(cacheKey);

    const base = symbolScaleForKey(symbolKey);
    const scale = symbolScaleAtZoom(base, currentZoom);

    const style = new Style({
      image: new Icon({
        src: symbolDataUrlForKey(symbolKey),
        scale,
        declutterMode: "none"
      }),
      zIndex: type === "PG" ? 44 : 40
    });
    pointStyleCache.set(cacheKey, style);
    return style;
  }

  function pointLabelOffsetY(feature) {
    const symbolKey = defaultSymbolKeyForFeature(feature);
    if (!symbolKey) return 0;
    const base = symbolScaleForKey(symbolKey);
    const scale = symbolScaleAtZoom(base, currentZoom);
    const symbolPx = 24 * scale;
    return Math.round(symbolPx * 0.5 + 1);
  }

  function fixUsageClass(feature) {
    return String(feature?.get?.("fixUsageClass") || "").trim().toLowerCase();
  }

  function waypointPriorityBand(feature) {
    const usage = fixUsageClass(feature);
    if (usage === "airway_and_procedure" || usage === "airway_only") return "primary";
    if (usage === "procedure_only") return "secondary";
    if (usage === "none") return "local";
    return "primary";
  }

  function pointMinZoomByPriority(type, feature, base) {
    if (!(type === "EA" || type === "PC")) return base;
    const usage = fixUsageClass(feature);
    const usageMin = fixUsageMinZoomRules[usage];
    if (Number.isFinite(usageMin)) return Math.max(base, usageMin);
    const band = waypointPriorityBand(feature);
    if (band === "primary") return Math.max(9, base - 1);
    if (band === "secondary") return Math.max(11, base + 1);
    return Math.max(13, base + 3);
  }

  function chartPhase(zoom) {
    const airways = phaseRules.airways || {};
    const arrival = phaseRules.arrival || {};
    const approach = phaseRules.approach || {};
    const arrivalMin = Number.isFinite(arrival.min) ? arrival.min : 11;
    const approachMin = Number.isFinite(approach.min) ? approach.min : 13;
    const airwaysMax = Number.isFinite(airways.max) ? airways.max : (arrivalMin - 0.001);
    if (zoom >= approachMin) return "approach";
    if (zoom >= arrivalMin && zoom <= (Number.isFinite(arrival.max) ? arrival.max : (approachMin - 0.001))) return "arrival";
    if (zoom <= airwaysMax) return "airways";
    // Fallback for any small gaps in phase ranges: keep progression monotonic.
    if (zoom < approachMin) return "arrival";
    return "airways";
  }

  function labelAllowed(type, zoom, geomType, feature) {
    if (!type) return false;
    const phase = chartPhase(zoom);
    const labelRules = ARINC_OL_THEME.aipProfile?.labels || {};
    if (geomType === "Point" || geomType === "MultiPoint") {
      if (type === "PA") return zoom >= (labelRules.PA?.minZoom ?? 6);
      if (type === "D") return zoom >= (labelRules.D?.minZoom ?? 8);
      if (type === "DB") return zoom >= (labelRules.DB?.minZoom ?? 8);
      if (type === "EA" || type === "PC") {
        const band = waypointPriorityBand(feature);
        if (phase === "airways" && band !== "primary") return false;
        if (phase === "arrival" && band === "local") return false;
        const base = type === "EA" ? (labelRules.EA?.minZoom ?? 10) : (labelRules.PC?.minZoom ?? 10);
        const min = pointMinZoomByPriority(type, feature, base);
        // In enroute phase, keep fix labels sparse even for primary refs.
        const phaseBoost = phase === "airways" ? 1 : 0;
        return zoom >= (min + phaseBoost);
      }
      if (type === "PG") return zoom >= (labelRules.PG?.minZoom ?? 11);
      if (type === "OBST") return zoom >= (labelRules.OBST?.minZoom ?? 12);
      return false;
    }
    if (geomType === "LineString" || geomType === "MultiLineString") {
      if (type === "ER") {
        // In approach phase, suppress most enroute labels to reduce terminal clutter.
        if (phase === "approach") return zoom >= 15;
        return zoom >= (labelRules.ER?.minZoom ?? 10);
      }
      if (type === "PD") return zoom >= (labelRules.PD?.minZoom ?? 12);
      if (type === "PE") return zoom >= (labelRules.PE?.minZoom ?? 12);
      if (type === "PF") return zoom >= (labelRules.PF?.minZoom ?? 12);
      if (type === "EP") return zoom >= (labelRules.EP?.minZoom ?? 11);
      if (type === "ET") return zoom >= (labelRules.ET?.minZoom ?? 11);
      return false;
    }
    if (geomType === "Polygon" || geomType === "MultiPolygon") {
      if (type === "UC") return zoom >= (labelRules.UC?.minZoom ?? 8);
      if (type === "UR") return zoom >= (labelRules.UR?.minZoom ?? 8);
      if (type === "UF") return zoom >= (labelRules.UF?.minZoom ?? 8);
      if (type === "OBST_AREA") return zoom >= (labelRules.OBST_AREA?.minZoom ?? 11);
      return false;
    }
    return false;
  }

  function explicitDirectionGlyph(feature) {
    const v = String(
      feature.get("turnDir") ??
      feature.get("direction") ??
      feature.get("dir") ??
      feature.get("flowDir") ??
      ""
    ).trim().toUpperCase();
    if (!v) return "";
    if (v === "L" || v === "LEFT" || v === "CCW" || v === "COUNTERCLOCKWISE") return "◀";
    if (v === "R" || v === "RIGHT" || v === "CW" || v === "CLOCKWISE") return "▶";
    if (v === "F" || v === "FORWARD" || v === "AHEAD") return "▶";
    if (v === "B" || v === "BACKWARD" || v === "REVERSE") return "◀";
    if (v === "BOTH" || v === "BI" || v === "BIDIR" || v === "BIDIRECTIONAL") return "◀▶";
    return "";
  }

  function procedureSemanticGlyphs(feature, type) {
    const t = String(type || feature.get("type") || "").toUpperCase();
    if (!(t === "PD" || t === "PE" || t === "PF")) return "";
    const out = [];
    if (feature.get("procHasNonGeomLegs")) out.push("◇");
    if (feature.get("procHasNavSemantics")) out.push("◉");
    return out.join("");
  }

  function formatMagVarShort(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n === 0) return "";
    const abs = Math.abs(n);
    const rounded = Math.round(abs);
    const hemi = n > 0 ? "E" : "W";
    return `${hemi}${rounded}°`;
  }

  function vorRoseStylesForFeature(feature) {
    const roseMinZoom = Number.isFinite(ARINC_OL_THEME?.navaid?.vorRoseMinZoom)
      ? ARINC_OL_THEME.navaid.vorRoseMinZoom
      : 12;
    if (currentZoom < roseMinZoom) return null;
    const type = String(feature.get("type") || feature.get("layer") || "").toUpperCase();
    if (type !== "D") return null;
    const kind = String(feature.get("navaidKind") || "").toUpperCase();
    const cls = String(feature.get("class") || "").toUpperCase();
    const isVorFamily =
      kind.includes("VOR") ||
      kind.includes("TACAN") ||
      cls === "V" || cls === "VD" || cls === "VT";
    if (!isVorFamily) return null;

    const zoomBucket = Math.floor(currentZoom);
    const magVarText = formatMagVarShort(feature.get("magVarDeg"));
    const radius = currentZoom >= 14 ? 20 : currentZoom >= 13 ? 17 : 14;
    const strokeWidth = currentZoom >= 14 ? 1.8 : 1.4;
    const key = `${zoomBucket}|${kind || cls}|${magVarText}|${radius}`;
    if (vorRoseStyleCache.has(key)) return vorRoseStyleCache.get(key);

    const ring = new Style({
      image: new CircleStyle({
        radius,
        fill: new Fill({ color: "rgba(0,0,0,0)" }),
        stroke: new Stroke({ color: "rgba(0,164,194,0.88)", width: strokeWidth })
      }),
      zIndex: 39
    });
    const northTick = new Style({
      text: new Text({
        text: "▲",
        font: `700 ${currentZoom >= 14 ? 9 : 8}px "Consolas", "Menlo", monospace`,
        fill: new Fill({ color: "rgba(0,164,194,0.95)" }),
        stroke: new Stroke({ color: "rgba(0,0,0,0.85)", width: 2 }),
        offsetY: -(radius + 6)
      }),
      zIndex: 39
    });
    const styles = magVarText
      ? [
          ring,
          northTick,
          new Style({
            text: new Text({
              text: magVarText,
              font: `700 ${currentZoom >= 14 ? 10 : 9}px "Consolas", "Menlo", monospace`,
              fill: new Fill({ color: "rgba(0,164,194,0.95)" }),
              stroke: new Stroke({ color: "rgba(0,0,0,0.9)", width: 2.4 }),
              offsetX: radius + 12,
              offsetY: radius - 2
            }),
            zIndex: 39
          })
        ]
      : [ring, northTick];
    vorRoseStyleCache.set(key, styles);
    return styles;
  }

  function hashString(parts) {
    const s = Array.isArray(parts) ? parts.join("|") : String(parts || "");
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  function lineOverlapKey(feature, type) {
    try {
      const g = feature.getGeometry?.();
      const ex = g?.getExtent?.();
      const parts = [String(type || feature.get("type") || feature.get("layer") || "")];
      if (Array.isArray(ex) && ex.length === 4) {
        parts.push(
          String(Math.round(ex[0] / 4) * 4),
          String(Math.round(ex[1] / 4) * 4),
          String(Math.round(ex[2] / 4) * 4),
          String(Math.round(ex[3] / 4) * 4)
        );
      }
      return parts.join("|");
    } catch {
      return String(type || "");
    }
  }

  function lineLaneOffsetY(feature, type) {
    // 3 display lanes for overlapping labels on the same segment.
    const overlap = lineOverlapKey(feature, type);
    const ident =
      String(
        feature.get("route") ??
        feature.get("routeId") ??
        feature.get("procId") ??
        feature.get("transitionId") ??
        feature.get("name") ??
        feature.get("id") ??
        ""
      ) +
      "|" +
      String(feature.get("legSeq") ?? "");
    const lane = hashString([overlap, ident]) % 3;
    return lane === 0 ? -10 : lane === 1 ? 0 : 10;
  }

  function erRouteTier(feature) {
    const explicit = String(feature.get("routeTier") || "").trim().toLowerCase();
    if (explicit === "upper" || explicit === "lower") return explicit;
    const route = String(feature.get("route") || feature.get("routeId") || "").trim().toUpperCase();
    if (!route) return "";
    return route.startsWith("U") ? "upper" : "lower";
  }

  function labelStyleForFeature(feature, type, geomType) {
    if (type === "ER") return null;
    if (!labelAllowed(type, currentZoom, geomType, feature)) return null;
    const textValue = defaultLabelForFeature(feature);
    if (!textValue) return null;
    let text = String(textValue).trim();
    if (!text) return null;
    const isLine = geomType === "LineString" || geomType === "MultiLineString";
    const dirGlyph = explicitDirectionGlyph(feature);
    const procGlyphs = procedureSemanticGlyphs(feature, type);
    if (type === "EP") {
      const turn = String(feature.get("turnDir") || "").trim().toUpperCase();
      if (turn.startsWith("L")) text = `${text}  ◀`;
      else if (turn.startsWith("R")) text = `${text}  ▶`;
      else if (dirGlyph) text = `${text}  ${dirGlyph}`;
    } else if (isLine && (type === "ER" || type === "PD" || type === "PE" || type === "PF" || type === "ET")) {
      if (dirGlyph) text = `${text}  ${dirGlyph}`;
    }
    if (procGlyphs) text = `${text}  ${procGlyphs}`;

    const zoomBucket = Math.floor(currentZoom);
    const pointOffsetY = isLine ? 0 : pointLabelOffsetY(feature);
    const repeatLine = isLine && (type === "EP" || type === "ET");
    const lineRepeat = type === "ET" ? 300 : 360;
    let lineOffsetY = 0;
    if (isLine) {
      const sharedCount = Number(feature.get("sharedCount"));
      const isShared = feature.get("shared") === true || (Number.isFinite(sharedCount) && sharedCount > 1);
      // Only spread labels into lanes when the line is an aggregated shared segment.
      if (isShared && (type === "PD" || type === "PE" || type === "PF")) {
        lineOffsetY = lineLaneOffsetY(feature, type);
      }
    }
    const cacheKey = `${type}:${isLine ? "line" : "point"}:${text}:${zoomBucket}:${pointOffsetY}:${lineOffsetY}`;
    if (labelStyleCache.has(cacheKey)) return labelStyleCache.get(cacheKey);

    const isAirportPoint = type === "PA";
    const isWaypointPoint = type === "EA" || type === "PC";
    const pointLabelZ = isAirportPoint ? 52 : isWaypointPoint ? 48 : type === "PG" ? 47 : 46;
    const style = new Style({
      text: new Text({
        text,
        declutterMode: isLine ? "none" : (isAirportPoint || isWaypointPoint ? "none" : "declutter"),
        font: '700 12px "Consolas", "Menlo", "Liberation Mono", "DejaVu Sans Mono", monospace',
        fill: new Fill({ color: "#ffffff" }),
        stroke: new Stroke({ color: "rgba(0,0,0,0.92)", width: 3 }),
        overflow: isLine,
        placement: isLine ? "line" : "point",
        maxAngle: Math.PI / 8,
        repeat: repeatLine ? lineRepeat : undefined,
        textAlign: isLine ? undefined : "center",
        textBaseline: isLine ? undefined : "top",
        offsetX: isLine ? 0 : 0,
        offsetY: isLine ? lineOffsetY : pointOffsetY
      }),
      zIndex: isLine ? 22 : pointLabelZ
    });
    labelStyleCache.set(cacheKey, style);
    return style;
  }

  function formatFlightLevel(raw, uom) {
    if (raw == null) return "";
    const s = String(raw).trim().toUpperCase();
    if (!s) return "";
    if (s === "UNLTD" || s === "UNL" || s === "U") return "UNLTD";
    if (s.startsWith("FL")) return s;
    const uu = String(uom || "").trim().toUpperCase();
    if (/^\d+$/.test(s)) {
      const n = Number(s);
      if (uu === "FL") return `FL${n}`;
      if (n >= 10000 && n % 100 === 0) return `FL${Math.round(n / 100)}`;
      if (n >= 1000) return `${n}FT`;
      return String(n);
    }
    return s;
  }

  function formatAltitudeForRouteLabel(raw, uom) {
    const t = formatFlightLevel(raw, uom);
    if (!t) return "";
    if (/^FL/i.test(t) || /^UNL/i.test(t)) return t;
    if (/FT$/i.test(t)) return `${t} AMSL`;
    return t;
  }

  function erLabelTexts(feature) {
    function compactSharedRoutes(routes) {
      const clean = routes.map((r) => String(r || "").trim().toUpperCase()).filter(Boolean);
      if (!clean.length) return "";
      if (clean.length === 1) return clean[0];
      const parsed = clean.map((r) => {
        const m = /^([A-Z]+)(\d+)$/.exec(r);
        return m ? { raw: r, prefix: m[1], num: m[2] } : { raw: r, prefix: null, num: null };
      });
      const samePrefix = parsed.every((p) => p.prefix && p.prefix === parsed[0].prefix);
      if (samePrefix) {
        const prefix = parsed[0].prefix;
        const nums = parsed.map((p) => p.num);
        return `${prefix}${nums.join("-")}`;
      }
      return clean.join("-");
    }

    const sharedCount = Number(feature.get("sharedCount"));
    const sharedRoutesRaw = feature.get("sharedRoutes");
    const sharedRoutes = Array.isArray(sharedRoutesRaw)
      ? sharedRoutesRaw.map((v) => String(v || "").trim()).filter(Boolean)
      : [];
    const route = String(feature.get("route") || feature.get("routeId") || "").trim();
    const lo = feature.get("minAlt") ?? feature.get("lowerLimit");
    const hi = feature.get("maxAlt") ?? feature.get("upperLimit");
    const loUom = feature.get("lowerLimitUom");
    const hiUom = feature.get("upperLimitUom");
    const loText = formatAltitudeForRouteLabel(lo, loUom);
    const hiText = formatAltitudeForRouteLabel(hi, hiUom);
    const routeLabel = Number.isFinite(sharedCount) && sharedCount > 1 && sharedRoutes.length
      ? `${compactSharedRoutes(sharedRoutes.slice(0, 4))}${sharedRoutes.length > 4 ? `+${sharedRoutes.length - 4}` : ""}`
      : route;
    return { route: routeLabel, loText, hiText, sharedCount };
  }

  function obstacleAreaStyleKey(feature) {
    const raw = String(feature.get("obstacleAreaType") || feature.get("areaType") || "").toUpperCase();
    if (!raw) return "obst-area-default";
    const compact = raw.replace(/[\s_-]+/g, "");
    if (compact.includes("AREA1") || compact === "1") return "obst-area-1";
    if (compact.includes("AREA2") || compact === "2" || compact.includes("AREA2A") || compact.includes("AREA2B")) return "obst-area-2";
    if (compact.includes("AREA3") || compact === "3") return "obst-area-3";
    return "obst-area-default";
  }

  function ucAirspaceStyles(clsCode) {
    const clsNorm = String(clsCode || "").toUpperCase();
    const color =
      clsNorm === "A" ? "#003d73" :
      clsNorm === "B" ? "#005da8" :
      clsNorm === "C" ? "#1d78b5" :
      clsNorm === "D" ? "#2d8fc3" :
      "#4aa3cf";
    const key = `uc-airspace:${clsNorm || "def"}`;
    return getStyle(key, () => ([
      new Style({
        stroke: new Stroke({ color: "rgba(255,255,255,0.75)", width: 3.4 }),
        fill: new Fill({ color: "rgba(0,93,168,0.05)" }),
        zIndex: 25
      }),
      new Style({
        stroke: new Stroke({
          color,
          width: 1.9,
          lineDash: clsNorm === "A" || clsNorm === "B" ? [] : [7, 4]
        }),
        zIndex: 26
      })
    ]));
  }

  function urAirspaceStyles(rtCode) {
    const rtNorm = String(rtCode || "").toUpperCase();
    const isCritical = rtNorm === "P" || rtNorm === "R";
    const color =
      rtNorm === "P" ? "rgba(183,28,28,0.98)" :
      rtNorm === "R" ? "rgba(164,54,134,0.98)" :
      rtNorm === "D" ? "rgba(161,79,135,0.95)" :
      rtNorm === "W" ? "rgba(191,122,0,0.95)" :
      rtNorm === "M" ? "rgba(138,93,47,0.95)" :
      "rgba(165,111,44,0.95)";
    const fill =
      rtNorm === "P" ? "rgba(183,28,28,0.18)" :
      rtNorm === "R" ? "rgba(164,54,134,0.16)" :
      rtNorm === "D" ? "rgba(161,79,135,0.10)" :
      rtNorm === "W" ? "rgba(191,122,0,0.09)" :
      rtNorm === "M" ? "rgba(138,93,47,0.08)" :
      "rgba(165,111,44,0.08)";
    const dash =
      rtNorm === "P" ? [] :
      rtNorm === "R" ? [10, 5] :
      rtNorm === "D" ? [8, 4, 2, 4] :
      rtNorm === "W" ? [2, 4] :
      rtNorm === "M" ? [12, 5] :
      [6, 4];
    const key = `ur-airspace:${rtNorm || "def"}`;
    return getStyle(key, () => ([
      new Style({
        stroke: new Stroke({ color: "rgba(255,255,255,0.65)", width: isCritical ? 3.6 : 2.8 }),
        fill: new Fill({ color: fill }),
        zIndex: isCritical ? 29 : 23
      }),
      new Style({
        stroke: new Stroke({ color, width: isCritical ? 2.1 : 1.6, lineDash: dash }),
        zIndex: isCritical ? 30 : 24
      })
    ]));
  }

  function ufAirspaceStyles() {
    return getStyle("uf-airspace", () => ([
      new Style({
        stroke: new Stroke({ color: "rgba(255,255,255,0.62)", width: 2.8 }),
        fill: new Fill({ color: "rgba(107,79,179,0.05)" }),
        zIndex: 19
      }),
      new Style({
        stroke: new Stroke({ color: "rgba(107,79,179,0.95)", width: 1.3, lineDash: [10, 6] }),
        zIndex: 20
      })
    ]));
  }

  function erLabelStylesForFeature(feature) {
    const erMinLabelZoom = ARINC_OL_THEME.aipProfile?.labels?.ER?.minZoom ?? 10;
    if (chartPhase(currentZoom) === "approach" && currentZoom < 15) return null;
    if (currentZoom < erMinLabelZoom) return null;
    const { route, loText, hiText } = erLabelTexts(feature);
    if (!route) return null;
    const zoomBucket = Math.floor(currentZoom);
    const showFullErLabel = currentZoom >= 14;
    const routeFamily = String(feature.get("routeFamily") || "").toUpperCase();
    const levelText = loText || hiText ? `${loText || "?"}-${hiText || "?"}` : "";
    const text = showFullErLabel ? [route, levelText].filter(Boolean).join(" ") : route;
    // High zoom: avoid repeating the same airway label many times on long segments.
    // Mid zoom: keep repetition, but much more spaced out.
    const repeat = currentZoom >= 14 ? undefined : currentZoom >= 12 ? 700 : 520;
    const tier = erRouteTier(feature);
    const familyBase =
      routeFamily === "RNAV" ? 0 :
      routeFamily === "CONVENTIONAL" ? 14 :
      routeFamily === "OTC" ? -14 :
      12;
    // Keep lane assignment stable across repeated labels for the same route.
    // Using overlap extent here made offsets vary between tile/fragments.
    const lane = hashString([
      "ER",
      routeFamily,
      String(feature.get("route") || feature.get("routeId") || ""),
      String(feature.get("sharedCount") || "")
    ]) % 3;
    // Keep the highest-priority family (RNAV) centered. Secondary families get offsets.
    // Add a small lane adjustment only when needed to separate same-family overlaps.
    const laneAdj =
      routeFamily === "RNAV"
        ? (lane === 1 ? 0 : lane === 0 ? -2 : 2)
        : (lane === 1 ? 0 : lane === 0 ? -5 : 5);
    // Preserve a subtle upper/lower cue only for non-centered labels.
    const tierAdj = familyBase === 0 ? 0 : (tier === "upper" ? -2 : tier === "lower" ? 2 : 0);
    const lineOffsetY = familyBase + tierAdj + laneAdj;
    const fontSize =
      routeFamily === "RNAV" ? (showFullErLabel ? 11 : 12) :
      routeFamily === "CONVENTIONAL" ? (showFullErLabel ? 10 : 11) :
      (showFullErLabel ? 10 : 11);
    const fontWeight = routeFamily === "RNAV" ? 700 : 600;
    const font = `${fontWeight} ${fontSize}px "Roboto Condensed", "Noto Sans", "Arial Narrow", "Liberation Sans Narrow", sans-serif`;
    const strokeWidth = showFullErLabel ? 2.6 : 3;
    const fillColor =
      routeFamily === "RNAV" ? "#ffffff" :
      routeFamily === "CONVENTIONAL" ? "rgba(235,242,248,0.95)" :
      "rgba(228,235,242,0.92)";
    const repeatKey = repeat == null ? "norepeat" : String(repeat);
    const key = `${text}|${zoomBucket}|${repeatKey}|${lineOffsetY}|${font}|${strokeWidth}|${fillColor}`;
    if (erLabelStyleCache.has(key)) return erLabelStyleCache.get(key);

    const style = new Style({
      text: new Text({
        text,
        declutterMode: "none",
        font,
        fill: new Fill({ color: fillColor }),
        stroke: new Stroke({ color: "rgba(0,0,0,0.92)", width: strokeWidth }),
        overflow: true,
        placement: "line",
        repeat,
        maxAngle: Math.PI / 8,
        offsetY: lineOffsetY
      }),
      zIndex: 23
    });
    erLabelStyleCache.set(key, [style]);
    return [style];
  }

  function erDirectionArrowStylesForFeature(feature) {
    if (currentZoom < 12) return null;
    const topGlyph = String(feature.get("dirGlyph") || "").trim();
    const legs = feature.get("legs");
    const hasSemanticFromLegs = Array.isArray(legs) && legs.some((leg) => leg && leg.erDeterministic);
    const glyph = topGlyph || (hasSemanticFromLegs ? "<>" : "");
    if (!glyph) return null;
    if (glyph === "<>") return null;

    const routeFamily = String(feature.get("routeFamily") || "").toUpperCase();
    const erTier = erRouteTier(feature);
    const isUpper = erTier === "upper";
    const zoomBucket = Math.floor(currentZoom);
    const repeat = currentZoom >= 14 ? 220 : 320;
    const color =
      routeFamily === "RNAV" ? "rgba(255,255,255,0.95)" :
      routeFamily === "OTC" ? "rgba(230,236,242,0.9)" :
      "rgba(240,244,248,0.92)";
    const strokeColor = "rgba(0,0,0,0.85)";
    const fontSize = currentZoom >= 14 ? 13 : 11;
    const displayGlyph =
      glyph === "<>" ? "◀▶" :
      glyph === ">" ? (routeFamily === "OTC" ? "›" : "▶") :
      glyph === "<" ? "◀" :
      (routeFamily === "OTC" ? "›" : glyph);
    const lineOffsetY =
      routeFamily === "RNAV" ? 0 :
      routeFamily === "CONVENTIONAL" ? (isUpper ? -10 : 10) :
      (isUpper ? -12 : 12);

    const key = `${routeFamily}|${erTier}|${zoomBucket}|${repeat}|${displayGlyph}|${fontSize}|${lineOffsetY}`;
    if (erArrowStyleCache.has(key)) return erArrowStyleCache.get(key);

    const styles = [
      new Style({
          text: new Text({
          text: displayGlyph,
          placement: "line",
          repeat,
          maxAngle: Math.PI / 8,
          overflow: true,
          declutterMode: "none",
          font: `700 ${fontSize}px "Consolas", "Menlo", "Liberation Mono", "DejaVu Sans Mono", monospace`,
          fill: new Fill({ color }),
          stroke: new Stroke({ color: strokeColor, width: 2.5 }),
          offsetY: lineOffsetY
        }),
        zIndex: 22
      })
    ];
    erArrowStyleCache.set(key, styles);
    return styles;
  }

  function featureType(feature) {
    const raw = feature.get("type") || feature.get("layer") || "";
    return String(raw).toUpperCase();
  }

  function isVisibleAtZoom(feature, zoom) {
    const type = featureType(feature);
    const phase = chartPhase(zoom);
    // High-level chart phase gating:
    // - Airways chart: enroute structure only.
    // - Arrival chart: SID/STAR context.
    // - Approach chart: full terminal detail.
    if (phase === "airways") {
      if (type === "PD" || type === "PE" || type === "PF" || type === "PG") return false;
    } else if (phase === "arrival") {
      if (type === "PF") return false;
    }

    if (type === "EA" || type === "PC") {
      const band = waypointPriorityBand(feature);
      if (phase === "airways" && band !== "primary") return false;
      if (phase === "arrival" && band === "local") return false;
      const rule = zoomRules[type] || {};
      const baseMin = Number.isFinite(rule.min) ? rule.min : 10;
      const min = pointMinZoomByPriority(type, feature, baseMin);
      const max = Number.isFinite(rule.max) ? rule.max : Infinity;
      return zoom >= min && zoom <= max;
    }
    const rule = zoomRules[type];
    if (!rule) return true;
    const min = Number.isFinite(rule.min) ? rule.min : -Infinity;
    const max = Number.isFinite(rule.max) ? rule.max : Infinity;
    return zoom >= min && zoom <= max;
  }

  function styleFn(feature) {
    if (!isVisibleAtZoom(feature, currentZoom)) return null;
    const layer = feature.get("layer");
    const type = String(feature.get("type") || "").toUpperCase();
    const routeFamily = String(feature.get("routeFamily") || "").toUpperCase();
    const cls = String(feature.get("classification") || "").toUpperCase();
    const rt = String(feature.get("restrictiveType") || "").toUpperCase();
    const geomType = feature.getGeometry?.()?.getType?.();
    const label = labelStyleForFeature(feature, type || String(layer || "").toUpperCase(), geomType);

    const lineRules = ARINC_OL_THEME.aipProfile?.lines || {};
    const lineTheme = ARINC_OL_THEME.webgl?.line || {};

    if (
      (geomType === "Point" || geomType === "MultiPoint") &&
      (layer === "PA" || layer === "PG" || layer === "D" || layer === "DB" || layer === "EA" || layer === "PC" || layer === "OBST" ||
        type === "PA" || type === "PG" || type === "D" || type === "DB" || type === "EA" || type === "PC" || type === "OBST")
    ) {
      const symbol = pointStyleForFeature(feature);
      const rose = vorRoseStylesForFeature(feature);
      if (!symbol) {
        if (rose && label) return [...rose, label];
        if (rose) return rose;
        return label || null;
      }
      if (rose && label) return [symbol, ...rose, label];
      if (rose) return [symbol, ...rose];
      return label ? [symbol, label] : symbol;
    }

    if (layer === "ER" || type === "ER") {
      const erLabels = erLabelStylesForFeature(feature);
      const erArrows = erDirectionArrowStylesForFeature(feature);
      const erTier = erRouteTier(feature);
      const tierZBoost = erTier === "upper" ? 2 : erTier === "lower" ? -1 : 0;
      if (routeFamily === "RNAV") {
        const key = `er-rnav-${erTier || "base"}`;
        const styles = getStyle(key, () => {
          const baseColor = lineTheme.stroke?.erFamily?.RNAV || "#00a7c7";
          const isUpper = erTier === "upper";
          const isLower = erTier === "lower";
          const corridor = new Style({
            stroke: new Stroke({
              color: "rgba(0,167,199,0.18)",
              width: isLower ? 8.2 : isUpper ? 6.6 : 7.4
            }),
            zIndex: (lineRules.ER?.RNAV?.z ?? 18) - 2 + tierZBoost
          });
          const under = new Style({
            stroke: new Stroke({
              color: "rgba(255,255,255,0.58)",
              width: isLower ? 3.4 : isUpper ? 2.8 : 3.1
            }),
            zIndex: (lineRules.ER?.RNAV?.z ?? 18) - 1 + tierZBoost
          });
          const over = new Style({
            stroke: new Stroke({
              color: baseColor,
              width: isLower ? 2.2 : isUpper ? 1.7 : (lineTheme.width?.erFamily?.RNAV ?? 2),
              lineDash: isUpper ? [10, 4] : (lineRules.ER?.RNAV?.dash || [])
            }),
            zIndex: (lineRules.ER?.RNAV?.z ?? 18) + tierZBoost
          });
          return [corridor, under, over];
        });
        const out = erArrows ? [...styles, ...erArrows] : styles;
        return erLabels ? [...out, ...erLabels] : out;
      }
      if (routeFamily === "OTC") {
        const key = `er-otc-${erTier || "base"}`;
        const styles = getStyle(key, () => {
          const isUpper = erTier === "upper";
          const isLower = erTier === "lower";
          return [
            new Style({
              stroke: new Stroke({
                color: "rgba(76,90,102,0.15)",
                width: isLower ? 7.0 : isUpper ? 5.6 : 6.3
              }),
              zIndex: (lineRules.ER?.OTC?.z ?? 12) - 2 + tierZBoost
            }),
            new Style({
              stroke: new Stroke({
                color: "rgba(255,255,255,0.52)",
                width: isLower ? 2.8 : 2.2
              }),
              zIndex: (lineRules.ER?.OTC?.z ?? 12) - 1 + tierZBoost
            }),
            new Style({
              stroke: new Stroke({
                color: lineTheme.stroke?.erFamily?.OTC || "#4c5a66",
                width: isLower ? 1.45 : isUpper ? 1.15 : (lineTheme.width?.erFamily?.OTC ?? 1.4),
                lineDash: isUpper ? [10, 6] : (lineRules.ER?.OTC?.dash || [8, 7])
              }),
              zIndex: (lineRules.ER?.OTC?.z ?? 12) + tierZBoost
            })
          ];
        });
        const out = erArrows ? [...styles, ...erArrows] : styles;
        return erLabels ? [...out, ...erLabels] : out;
      }
      const key = `er-bg-${erTier || "base"}`;
      const styles = getStyle(key, () => {
        const isUpper = erTier === "upper";
        const isLower = erTier === "lower";
        return [
          new Style({
            stroke: new Stroke({ color: "rgba(93,103,112,0.14)", width: isLower ? 6.6 : isUpper ? 5.2 : 5.8 }),
            zIndex: (lineRules.ER?.CONVENTIONAL?.z ?? 13) - 2 + tierZBoost
          }),
          new Style({
            stroke: new Stroke({ color: "rgba(255,255,255,0.50)", width: isLower ? 2.6 : 2.1 }),
            zIndex: (lineRules.ER?.CONVENTIONAL?.z ?? 13) - 1 + tierZBoost
          }),
          new Style({
            stroke: new Stroke({
              color: lineTheme.stroke?.erFamily?.default || "#5d6770",
              width: isLower ? 1.45 : isUpper ? 1.1 : (lineTheme.width?.erFamily?.default ?? 1.3),
              lineDash: isUpper ? [8, 5] : (lineRules.ER?.CONVENTIONAL?.dash || [5, 6])
            }),
            zIndex: (lineRules.ER?.CONVENTIONAL?.z ?? 13) + tierZBoost
          })
        ];
      });
      const out = erArrows ? [...styles, ...erArrows] : styles;
      return erLabels ? [...out, ...erLabels] : out;
    }

    if (layer === "PD" || type === "PD") {
      const style = getStyle("pd", () => new Style({
        stroke: new Stroke({
          color: lineTheme.stroke?.byType?.PD || "#8a4f00",
          width: lineTheme.width?.byType?.PD ?? 1.6,
          lineDash: lineRules.PD?.dash || []
        }),
        zIndex: lineRules.PD?.z ?? 17
      }));
      return label ? [style, label] : style;
    }
    if (layer === "PE" || type === "PE") {
      const style = getStyle("pe", () => new Style({
        stroke: new Stroke({
          color: lineTheme.stroke?.byType?.PE || "#7d145b",
          width: lineTheme.width?.byType?.PE ?? 1.6,
          lineDash: lineRules.PE?.dash || [10, 5]
        }),
        zIndex: lineRules.PE?.z ?? 17
      }));
      return label ? [style, label] : style;
    }
    if (layer === "PF" || type === "PF") {
      const style = getStyle("pf", () => new Style({
        stroke: new Stroke({
          color: lineTheme.stroke?.byType?.PF || "#9b1c1c",
          width: lineTheme.width?.byType?.PF ?? 1.8,
          lineDash: lineRules.PF?.dash || [10, 4, 2, 4]
        }),
        zIndex: lineRules.PF?.z ?? 17
      }));
      return label ? [style, label] : style;
    }
    if (layer === "EP" || type === "EP") {
      const style = getStyle("ep", () => new Style({
        stroke: new Stroke({
          color: lineTheme.stroke?.byType?.EP || "#2f7d58",
          width: lineTheme.width?.byType?.EP ?? 1.55,
          lineDash: lineRules.EP?.dash || [10, 6]
        }),
        zIndex: lineRules.EP?.z ?? 16
      }));
      return label ? [style, label] : style;
    }
    if (layer === "ET" || type === "ET") {
      const style = getStyle("et", () => new Style({
        stroke: new Stroke({
          color: lineTheme.stroke?.byType?.ET || "#365f10",
          width: lineTheme.width?.byType?.ET ?? 1.5,
          lineDash: lineRules.ET?.dash || [14, 6]
        }),
        zIndex: lineRules.ET?.z ?? 16
      }));
      return label ? [style, label] : style;
    }

    if (layer === "UC" || type === "UC") {
      const styles = ucAirspaceStyles(cls);
      return label ? [...styles, label] : styles;
    }

    if (layer === "UR" || type === "UR") {
      const styles = urAirspaceStyles(rt);
      return label ? [...styles, label] : styles;
    }

    if (layer === "UF" || type === "UF") {
      const styles = ufAirspaceStyles();
      return label ? [...styles, label] : styles;
    }

    if (layer === "OBST_AREA" || type === "OBST_AREA") {
      const areaStyleKey = obstacleAreaStyleKey(feature);
      const style = getStyle(areaStyleKey, () => {
        if (areaStyleKey === "obst-area-1") {
          return new Style({
            stroke: new Stroke({ color: "rgba(183,28,28,0.98)", width: 1.7, lineDash: [8, 4] }),
            fill: new Fill({ color: "rgba(183,28,28,0.08)" }),
            zIndex: 26
          });
        }
        if (areaStyleKey === "obst-area-2") {
          return new Style({
            stroke: new Stroke({ color: "rgba(224,130,0,0.98)", width: 1.5, lineDash: [6, 4] }),
            fill: new Fill({ color: "rgba(224,130,0,0.08)" }),
            zIndex: 25
          });
        }
        if (areaStyleKey === "obst-area-3") {
          return new Style({
            stroke: new Stroke({ color: "rgba(212,175,55,0.95)", width: 1.4, lineDash: [3, 5] }),
            fill: new Fill({ color: "rgba(212,175,55,0.07)" }),
            zIndex: 24
          });
        }
        return new Style({
          stroke: new Stroke({ color: "rgba(224,164,0,0.95)", width: 1.4, lineDash: [4, 4] }),
          fill: new Fill({ color: "rgba(224,164,0,0.10)" }),
          zIndex: 25
        });
      });
      return label ? [style, label] : style;
    }

    const style = getStyle("default", () => new Style({ zIndex: 10 }));
    return label ? [style, label] : style;
  }

  return {
    styleFn,
    setZoom(zoom) {
      if (Number.isFinite(zoom)) currentZoom = zoom;
    }
  };
}
