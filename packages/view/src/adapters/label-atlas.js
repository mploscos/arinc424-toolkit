import Feature from "https://esm.sh/ol@10.7.0/Feature.js";
import Point from "https://esm.sh/ol@10.7.0/geom/Point.js";
import VectorSource from "https://esm.sh/ol@10.7.0/source/Vector.js";
import WebGLVectorLayer from "https://esm.sh/ol@10.7.0/layer/WebGLVector.js";
import LayerGroup from "https://esm.sh/ol@10.7.0/layer/Group.js";
import { drawArincSymbol } from "./arinc-atlas-shared.js";
import { anchorsOnXYLine } from "./line-label-anchors.js";
import { ARINC_OL_THEME } from "./arinc-ol-config.js";

/**
 * Texture atlas builder for label sprites.
 * Packs text into a canvas atlas and returns texture coords per label.
 */
export class LabelAtlas {
  /**
   * @param {{font?: string, padding?: number, width?: number, maxSize?: number}} [options]
   */
  constructor({
    font = "bold 12px \"Arial Narrow\", sans-serif",
    padding = 6,
    width = 1024,
    maxSize = 2048
  } = {}) {
    this.font = font;
    this.padding = padding;
    this.width = width;
    this.maxSize = maxSize;
    this.canvas = document.createElement("canvas");
    this.canvas.width = width;
    this.canvas.height = 256;
    this.ctx = this.canvas.getContext("2d");
    this.ctx.font = this.font;
    this.ctx.textBaseline = "middle";
    this.ctx.textAlign = "left";
    this.ctx.imageSmoothingEnabled = true;
    this.x = 0;
    this.y = 0;
    this.rowH = 0;
    this.map = new Map();
  }

  /**
   * Ensure atlas height can fit the requested size.
   * @param {number} h
   * @returns {boolean}
   */
  ensureHeight(h) {
    if (this.canvas.height >= h) return true;
    if (h > this.maxSize) return false;
    const old = this.canvas;
    const next = document.createElement("canvas");
    next.width = this.canvas.width;
    next.height = Math.min(this.maxSize, Math.max(h, this.canvas.height * 2));
    const ctx = next.getContext("2d");
    // Preserve existing atlas content when growing the canvas.
    ctx.drawImage(old, 0, 0);
    ctx.font = this.font;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.imageSmoothingEnabled = true;
    this.canvas = next;
    this.ctx = ctx;
    return true;
  }

  /**
   * Add a label to the atlas (if not already present).
   * @param {string} text
   * @returns {{x:number,y:number,w:number,h:number}|null}
   */
  add(text) {
    if (!text) return null;
    text = normalizeSingleLineLabel(text);
    if (!text) return null;
    if (this.map.has(text)) return this.map.get(text);
    const metrics = this.ctx.measureText(text);
    const inset = 2;
    const w = Math.ceil(metrics.width) + this.padding * 2 + inset * 2;
    const h = 22;
    if (this.x + w > this.width) {
      this.x = 0;
      this.y += this.rowH;
      this.rowH = 0;
    }
    this.rowH = Math.max(this.rowH, h);
    const ok = this.ensureHeight(this.y + this.rowH + 1);
    if (!ok) return null;
    const x = this.x;
    const y = this.y;
    const dx = x + this.padding + inset + 0.5;
    const dy = y + h / 2 + 0.5;
    this.ctx.strokeStyle = "rgba(0,0,0,0.95)";
    this.ctx.lineWidth = 4;
    this.ctx.lineJoin = "round";
    this.ctx.lineCap = "round";
    this.ctx.strokeText(text, dx, dy);
    this.ctx.fillStyle = "#ffffff";
    this.ctx.fillText(text, dx, dy);
    const rect = { x, y, w, h };
    this.map.set(text, rect);
    this.x += w;
    return rect;
  }

  /**
   * @returns {string} data URL for the atlas texture.
   */
  toDataURL() {
    return this.canvas.toDataURL("image/png");
  }
}

/**
 * @param {string} text
 * @returns {string}
 */
function normalizeSingleLineLabel(text) {
  return String(text).replace(/\s+/g, " ").trim();
}

/**
 * Build a WebGLVectorLayer that renders bitmap labels from a feature list.
 * Labels are placed at feature points, line midpoints, or polygon interior points.
 * @param {Array<import("ol/Feature").default>} features
 * @param {(feature: import("ol/Feature").default) => string} labelForFeature
 * @param {{
 *   dedupeRoutes?: boolean,
 *   font?: string,
 *   padding?: number,
 *   width?: number,
 *   maxSize?: number,
 *   lineRepeatDistance?: number,
 *   maxLineRepeatLabels?: number,
 *   repeatLineLabelForFeature?: (feature: import("ol/Feature").default) => boolean
 * }} [options]
 * @returns {{layer: import("ol/layer/Base").default, source: VectorSource, atlas: LabelAtlas, atlases: LabelAtlas[]}}
 */
export function buildLabelLayerFromFeatures(features, labelForFeature, options = {}) {
  const {
    dedupeRoutes = true,
    font,
    padding,
    width,
    maxSize,
    pointOffsetForFeature = defaultLabelOffsetForFeature,
    lineRepeatDistance = ARINC_OL_THEME.repeatedLineLabels.spacing,
    maxLineRepeatLabels = ARINC_OL_THEME.repeatedLineLabels.maxPerFeature,
    repeatLineLabelForFeature = defaultRepeatLineLabelForFeature
  } = options;

  const labelSource = new VectorSource();
  const atlasOptions = { font, padding, width, maxSize };
  /** @type {Array<{atlas: LabelAtlas, source: VectorSource}>} */
  const pages = [{ atlas: new LabelAtlas(atlasOptions), source: new VectorSource() }];
  const seenRoutes = new Set();

  /**
   * Add a label feature at a coordinate with atlas glyph info.
   * @param {number[]} coord
   * @param {string} text
   * @param {number} [dispX]
   * @param {number} [dispY]
   */
  const addLabelPoint = (coord, text, dispX = 0, dispY = 0) => {
    let page = pages[pages.length - 1];
    let rect = page.atlas.add(text);
    if (!rect) {
      page = { atlas: new LabelAtlas(atlasOptions), source: new VectorSource() };
      pages.push(page);
      rect = page.atlas.add(text);
      if (!rect) return;
    }
    const extentFeature = new Feature(new Point(coord));
    labelSource.addFeature(extentFeature);
    const f = new Feature(new Point(coord));
    f.set("symbolX", rect.x);
    f.set("symbolY", rect.y);
    f.set("symbolW", rect.w);
    f.set("symbolH", rect.h);
    f.set("dispX", dispX);
    f.set("dispY", dispY);
    page.source.addFeature(f);
  };

  for (const f of features) {
    const geom = f.getGeometry?.();
    const gt = geom?.getType?.();
    const label = labelForFeature(f);
    if (!label) continue;
    if (dedupeRoutes && f.get("type") === "ER") {
      if (seenRoutes.has(label)) continue;
      seenRoutes.add(label);
    }
    if (gt === "Point") {
      const c = geom.getCoordinates?.();
      if (c) {
        const off = pointOffsetForFeature(f) || [0, 0];
        addLabelPoint(c, label, off[0], off[1]);
      }
    } else if (gt === "MultiPoint") {
      const cs = geom.getCoordinates?.();
      if (cs?.length) {
        const off = pointOffsetForFeature(f) || [0, 0];
        addLabelPoint(cs[0], label, off[0], off[1]);
      }
    } else if (gt === "LineString") {
      const coords = geom.getCoordinates();
      if (!coords?.length) continue;
      if (repeatLineLabelForFeature(f)) {
        const anchors = anchorsOnXYLine(coords, {
          spacing: lineRepeatDistance,
          maxAnchors: maxLineRepeatLabels
        });
        for (const anchor of anchors) addLabelPoint(anchor, label);
      } else {
        const mid = coords[Math.floor(coords.length / 2)];
        addLabelPoint(mid, label);
      }
    } else if (gt === "Polygon") {
      const p = geom.getInteriorPoint?.();
      const c = p?.getCoordinates?.();
      if (c) addLabelPoint(c, label);
    } else if (gt === "MultiPolygon") {
      const mp = geom.getInteriorPoints?.();
      const cs = mp?.getCoordinates?.();
      if (cs?.length) addLabelPoint(cs[0], label);
    }
  }

  const labelLayers = [];
  for (const page of pages) {
    if (!page.source.getFeatures().length) continue;
    labelLayers.push(new WebGLVectorLayer({
      source: page.source,
      style: {
        "icon-src": page.atlas.toDataURL(),
        "icon-rotate-with-view": false,
        "icon-offset": ["array", ["get", "symbolX"], ["get", "symbolY"]],
        "icon-size": ["array", ["get", "symbolW"], ["get", "symbolH"]],
        "icon-displacement": ["array", ["get", "dispX"], ["get", "dispY"]],
        "icon-scale": 1
      }
    }));
  }

  const layer = labelLayers.length > 1
    ? new LayerGroup({ layers: labelLayers })
    : (labelLayers[0] || new LayerGroup({ layers: [] }));

  return {
    layer,
    source: labelSource,
    atlas: pages[0].atlas,
    atlases: pages.map((p) => p.atlas)
  };
}

/**
 * Texture atlas for point symbols (navaids, fixes, airports, etc.).
 * Symbols are drawn as vector glyphs into a sprite sheet.
 */
export class SymbolAtlas {
  /**
   * @param {{size?: number, width?: number, maxSize?: number, padding?: number}} [options]
   */
  constructor({
    size = 28,
    width = 1024,
    maxSize = 2048,
    padding = 4
  } = {}) {
    this.size = size;
    this.width = width;
    this.maxSize = maxSize;
    this.padding = padding;
    this.cellW = size + padding * 2;
    this.cellH = size + padding * 2;
    this.canvas = document.createElement("canvas");
    this.canvas.width = width;
    this.canvas.height = 256;
    this.ctx = this.canvas.getContext("2d");
    this.x = 0;
    this.y = 0;
    this.rowH = 0;
    this.map = new Map();
  }

  /**
   * @param {number} h
   * @returns {boolean}
   */
  ensureHeight(h) {
    if (this.canvas.height >= h) return true;
    if (h > this.maxSize) return false;
    const old = this.canvas;
    const next = document.createElement("canvas");
    next.width = this.canvas.width;
    next.height = Math.min(this.maxSize, Math.max(h, this.canvas.height * 2));
    const ctx = next.getContext("2d");
    ctx.drawImage(old, 0, 0);
    this.canvas = next;
    this.ctx = ctx;
    return true;
  }

  /**
   * @param {string} key
   * @returns {{x:number,y:number,w:number,h:number}|null}
   */
  add(key) {
    if (!key) return null;
    if (this.map.has(key)) return this.map.get(key);
    if (this.x + this.cellW > this.width) {
      this.x = 0;
      this.y += this.rowH;
      this.rowH = 0;
    }
    this.rowH = Math.max(this.rowH, this.cellH);
    if (!this.ensureHeight(this.y + this.rowH + 1)) return null;
    const x = this.x;
    const y = this.y;
    this.drawSymbol(x + this.padding, y + this.padding, key);
    const rect = { x, y, w: this.cellW, h: this.cellH };
    this.map.set(key, rect);
    this.x += this.cellW;
    return rect;
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {string} key
   */
  drawSymbol(x, y, key) {
    const ctx = this.ctx;
    const s = this.size;
    const cx = x + s / 2;
    const cy = y + s / 2;
    const r = s * 0.34;
    ctx.save();
    ctx.translate(0.5, 0.5);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Base icon styles aligned with CUG intent:
    // VHF/UHF navaid = black, LF/MF navaid = brown, RNAV = blue.
    drawArincSymbol(ctx, key, cx, cy, r);
    ctx.restore();
  }

  /**
   * @returns {string}
   */
  toDataURL() {
    return this.canvas.toDataURL("image/png");
  }
}

/**
 * @param {import("ol/Feature").default} feature
 * @returns {string}
 */
export function defaultSymbolKeyForFeature(feature) {
  const t = String(feature.get("type") || feature.get("layer") || "").toUpperCase();
  if (t === "D") {
    const cls = String(feature.get("class") || "").toUpperCase();
    if (cls === "VD") return "vor_dme";
    if (cls === "VT") return "vortac";
    return "vor";
  }
  if (t === "DB") return "ndb";
  if (t === "EA" || t === "PC") {
    const usage = String(feature.get("usage") || "").toUpperCase();
    const pointType = String(feature.get("pointType") || "").toUpperCase();
    if (pointType.includes("VFR") || pointType.includes("REPORT")) {
      const compulsoryByType =
        pointType.includes("COMPULSORY") ||
        pointType.includes("MANDATORY") ||
        pointType.includes("OBLIG");
      const requestByType =
        pointType.includes("REQUEST") ||
        pointType.includes("ON_REQUEST") ||
        pointType.includes("PETIC");
      if (usage === "B" || compulsoryByType) return "vfr_report_comp";
      if (requestByType) return "vfr_report";
      return "vfr_report";
    }
    if (usage === "B") return "fix_comp";
    return "fix";
  }
  if (t === "PA") {
    const facilityType = String(feature.get("facilityType") || "").toUpperCase();
    const controlType = String(feature.get("controlType") || "").toUpperCase();
    const privateUse = String(feature.get("privateUse") || "").toUpperCase();
    const isHeli = facilityType.includes("HEL") || facilityType === "HP";
    const isWater = facilityType === "AH" || facilityType.includes("SEAPORT") || facilityType.includes("WATER") || facilityType.includes("HYDRO");
    const isMilitary = controlType.includes("MIL");
    const isJoint = controlType.includes("JOINT") || controlType.includes("MIX") || (controlType.includes("CIVIL") && controlType.includes("MIL"));
    const isPrivate = ["YES", "Y", "TRUE", "1"].includes(privateUse);
    if (isHeli) {
      if (isJoint) return "heliport_joint";
      if (isMilitary) return "heliport_mil";
      if (isPrivate) return "heliport_private";
      if (isWater) return "heliport_water";
      return "heliport";
    }
    if (isJoint) return "airport_joint";
    if (isMilitary) return "airport_mil";
    if (isWater) return "airport_water";
    if (isPrivate) return "airport_private";
    return "airport";
  }
  if (t === "PG") return "runway";
  if (t === "OBST") {
    const group = String(feature.get("group") || "").toUpperCase();
    const typ = String(feature.get("obstType") || feature.get("type") || "").toUpperCase();
    const lighted = String(feature.get("lighted") || "").toUpperCase();
    const isLighted = lighted === "YES" || lighted === "Y" || lighted === "TRUE" || lighted === "1";
    const isGroup = !!group && !["NO", "N", "FALSE", "0"].includes(group);
    if (group.includes("EOL") || group.includes("WIND") || typ.includes("WIND")) return "wind_farm";
    if (isGroup && isLighted) return "obst_group_lit";
    if (isGroup) return "obst_group";
    if (isLighted) return "obst_lit";
    return "obst";
  }
  return "";
}

/**
 * @param {import("ol/Feature").default} feature
 * @returns {[number, number]}
 */
export function defaultLabelOffsetForFeature(feature) {
  const t = feature.get("type");
  const point = ARINC_OL_THEME.labelOffsets.point;
  if (t === "PA") return point.pa;
  if (t === "PG") return point.pg;
  // Navaid labels are pushed further right so text never obscures the symbol.
  if (t === "D") return point.d;
  if (t === "DB") return point.db;
  if (t === "EA" || t === "PC") return point.eaPc;
  if (t === "OBST") return [14, -9];
  return point.default;
}

/**
 * Repeat labels only for long airway-like lines by default.
 * @param {import("ol/Feature").default} feature
 * @returns {boolean}
 */
export function defaultRepeatLineLabelForFeature(feature) {
  return feature.get("type") === "ER";
}

/**
 * Build point symbol layer from features using an icon atlas.
 * @param {Array<import("ol/Feature").default>} features
 * @param {(feature: import("ol/Feature").default) => string} [symbolKeyForFeature]
 * @returns {{layer: import("ol/layer/WebGLVector").default, source: VectorSource, atlas: SymbolAtlas}}
 */
export function buildPointSymbolLayerFromFeatures(features, symbolKeyForFeature = defaultSymbolKeyForFeature) {
  const source = new VectorSource();
  const atlas = null;
  const featuresByKey = new Map();

  for (const f of features) {
    const geom = f.getGeometry?.();
    const gt = geom?.getType?.();
    if (!(gt === "Point" || gt === "MultiPoint")) continue;
    const key = symbolKeyForFeature(f);
    if (!featuresByKey.has(key)) featuresByKey.set(key, []);
    if (gt === "Point") {
      const coords = geom.getCoordinates?.();
      if (!coords) continue;
      const sf = new Feature(new Point(coords));
      sf.set("symbolKey", key);
      source.addFeature(sf);
      featuresByKey.get(key).push(sf);
    } else {
      const coordsList = geom.getCoordinates?.() || [];
      for (const coords of coordsList) {
        const sf = new Feature(new Point(coords));
        sf.set("symbolKey", key);
        source.addFeature(sf);
        featuresByKey.get(key).push(sf);
      }
    }
  }

  const keyLayers = [];
  for (const [key, keyFeatures] of featuresByKey.entries()) {
    if (!keyFeatures.length) continue;
    const baseScale = symbolScaleForKey(key);
    keyLayers.push(new WebGLVectorLayer({
      source: new VectorSource({ features: keyFeatures }),
      style: {
        // WebGL in OL requires literal icon-src (no expressions).
        "icon-src": symbolDataUrlForKey(key),
        "icon-rotate-with-view": false,
        "icon-scale": ["interpolate", ["linear"], ["zoom"], 5, baseScale * 0.8, 8, baseScale, 11, baseScale * 1.15]
      }
    }));
  }
  const layer = new LayerGroup({ layers: keyLayers });

  return { layer, source, atlas };
}

/**
 * @param {string} key
 * @returns {number}
 */
export function symbolScaleForKey(key) {
  if (!key) return 0;
  if (key === "vor" || key === "vor_dme" || key === "vortac") return 0.96;
  if (key === "ndb") return 0.92;
  if (key === "airport") return 0.98;
  if (key === "airport_mil" || key === "airport_private" || key === "airport_joint" || key === "airport_water") return 0.98;
  if (key === "heliport") return 0.95;
  if (key === "heliport_mil" || key === "heliport_private" || key === "heliport_joint" || key === "heliport_water") return 0.95;
  if (key === "runway") return 0.9;
  if (key === "fix_comp") return 0.84;
  if (key === "fix") return 0.84;
  if (key === "obst_lit") return 0.86;
  if (key === "obst_group_lit") return 0.9;
  if (key === "obst_group") return 0.88;
  if (key === "obst") return 0.84;
  if (key === "wind_farm") return 0.9;
  if (key === "vfr_report") return 0.85;
  if (key === "vfr_report_comp") return 0.85;
  return 0.82;
}

const symbolUrlCache = new Map();

export function symbolDataUrlForKey(key) {
  if (!key) return "";
  if (symbolUrlCache.has(key)) return symbolUrlCache.get(key);
  const coreSize = 24;
  const padding = 5;
  const size = coreSize + padding * 2;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  const cx = size / 2;
  const cy = size / 2;
  const r = coreSize * 0.34;
  ctx.imageSmoothingEnabled = true;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  drawArincSymbol(ctx, key, cx, cy, r);
  const url = c.toDataURL("image/png");
  symbolUrlCache.set(key, url);
  return url;
}
