
import { makeLayoutSlicer } from "./layout_slicer.js";
import { parseLat, parseLon } from "../parsing/coords.js";

/**
 * Create ARPT layout parser.
 * @param {object} config
 * @param {string} [layoutName]
 * @returns {{parse: Function}}
 */
export function createArptLayout(config, layoutName = "ARPT") {
  const s = makeLayoutSlicer(config, layoutName);
  return {
    /**
     * Parse an ARPT line into a record.
     * @param {string} line
     * @returns {object|null}
     */
    parse(line) {
      const icao = s.trim(line, "icao");
      const name = s.trim(line, "name");
      const lat = parseLat(s.trim(line, "lat"));
      const lon = parseLon(s.trim(line, "lon"));
      if (lat == null || lon == null) return null;
      return { id: icao, name, lat, lon };
    }
  };
}
