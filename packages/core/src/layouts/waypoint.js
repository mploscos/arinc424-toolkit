import { makeLayoutSlicer } from "./layout_slicer.js";
import { parseLat, parseLon } from "../parsing/coords.js";

/**
 * Create waypoint layout parser (EA/PC).
 * @param {object} config
 * @param {string} [layoutName]
 * @returns {{parse: Function}}
 */
export function createWaypointLayout(config, layoutName = "EA") {
  const s = makeLayoutSlicer(config, layoutName);
  return {
    /**
     * Parse a waypoint line into a record.
     * @param {string} line
     * @returns {object|null}
     */
    parse(line) {
      const id = s.trim(line, "id");
      const region = s.trim(line, "region");
      const icao = s.trim(line, "icao");
      const type = s.trim(line, "type");
      const usage = s.trim(line, "usage");
      const lat = parseLat(s.raw(line, "lat"));
      const lon = parseLon(s.raw(line, "lon"));
      if (lat == null || lon == null) return null;
      const name = s.trim(line, "name");
      return { id, name, region, icao, type, usage, lat, lon };
    }
  };
}
