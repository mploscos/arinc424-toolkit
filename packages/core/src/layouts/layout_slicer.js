import { sliceRaw, sliceTrim } from "../parsing/slices.js";

/**
 * Read a field range from a layout definition.
 * @param {string} layoutName
 * @param {object} layout
 * @param {string} field
 * @returns {[number, number]}
 */
function getRange(layoutName, layout, field) {
  const range = layout?.[field];
  if (!Array.isArray(range) || range.length !== 2) {
    throw new Error(`Layout "${layoutName}" missing range for "${field}".`);
  }
  const [start, end] = range;
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    throw new Error(`Layout "${layoutName}" has invalid range for "${field}".`);
  }
  return range;
}

/**
 * Create a slicer helper for a named layout.
 * @param {object} config
 * @param {string} layoutName
 * @returns {{trim: Function, raw: Function}}
 */
export function makeLayoutSlicer(config, layoutName) {
  const layouts = config?.layouts;
  if (!layouts) {
    throw new Error("Layout config missing top-level \"layouts\" object.");
  }
  const layout = layouts[layoutName];
  if (!layout) {
    throw new Error(`Layout "${layoutName}" not found in config.`);
  }

  return {
    /**
     * Slice a field and trim whitespace.
     * @param {string} line
     * @param {string} field
     * @returns {string}
     */
    trim(line, field) {
      const [start, end] = getRange(layoutName, layout, field);
      return sliceTrim(line, start, end);
    },
    /**
     * Slice a field without trimming.
     * @param {string} line
     * @param {string} field
     * @returns {string}
     */
    raw(line, field) {
      const [start, end] = getRange(layoutName, layout, field);
      return sliceRaw(line, start, end);
    }
  };
}
