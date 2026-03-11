import { makeLayoutSlicer } from "./layout_slicer.js";
import { parseLat, parseLon } from "../parsing/coords.js";

/**
 * Create PA (airport/heliport) layout parser.
 * @param {object} config
 * @param {string} [layoutName]
 * @returns {{parse: Function}}
 */
export function createPaLayout(config, layoutName = "PA") {
  const s = makeLayoutSlicer(config, layoutName);
  return {
    /**
     * Parse a PA line into a record.
     * @param {string} line
     * @returns {object|null}
     */
    parse(line) {
      const id = s.trim(line, "id");
      const icao = s.trim(line, "icao");
      const name = s.trim(line, "name");
      const iata = s.trim(line, "iata");
      const lat = parseLat(s.raw(line, "lat"));
      const lon = parseLon(s.raw(line, "lon"));
      if (lat == null || lon == null) return null;
      const elevationFt = Number(s.trim(line, "elevationFt")) || null;
      return { id, icao, name, iata, lat, lon, elevationFt };
    }
  };
}
