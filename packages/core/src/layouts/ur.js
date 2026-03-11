import { makeLayoutSlicer } from "./layout_slicer.js";
import { parseLat, parseLon } from "../parsing/coords.js";

/**
 * Create UR (restricted airspace) layout parser.
 * @param {object} config
 * @param {string} [layoutName]
 * @returns {{parse: Function}}
 */
export function createUrLayout(config, layoutName = "UR") {
  const s = makeLayoutSlicer(config, layoutName);
  return {
    /**
     * Parse a UR line into a record.
     * @param {string} line
     * @returns {object|null}
     */
    parse(line) {
      const cont = s.trim(line, "cont");
      const isPrimary = cont === "0" || cont === "1";
      if (!isPrimary) return null;

      const icao = s.trim(line, "icao");
      const restrictiveType = s.trim(line, "restrictiveType");
      const designation = s.trim(line, "designation");
      const multipleCode = s.trim(line, "multipleCode");
      const seq = Number(s.trim(line, "seq")) || 0;
      const boundaryVia = s.trim(line, "boundaryVia");
      const arcLat = parseLat(s.raw(line, "arcLat"));
      const arcLon = parseLon(s.raw(line, "arcLon"));
      const arcDistanceRaw = s.trim(line, "arcDistance");
      const arcDistance = arcDistanceRaw ? Number(arcDistanceRaw) / 10 : null;
      const arcBearingRaw = s.trim(line, "arcBearingRaw");
      const arcBearing = arcBearingRaw ? Number(arcBearingRaw) / 10 : null;
      const lat = parseLat(s.raw(line, "lat"));
      const lon = parseLon(s.raw(line, "lon"));
      if (lat == null || lon == null) return null;
      const lowerLimit = s.trim(line, "lowerLimit");
      const lowerUnit = s.trim(line, "lowerUnit");
      const upperLimit = s.trim(line, "upperLimit");
      const upperUnit = s.trim(line, "upperUnit");
      const name = s.trim(line, "name");

      const key = `${icao}|${restrictiveType}|${designation}|${multipleCode}`;
      return {
        key,
        seq,
        lat,
        lon,
        name,
        icao,
        restrictiveType,
        designation,
        multipleCode,
        boundaryVia,
        arcLat,
        arcLon,
        arcDistance,
        arcBearing,
        lowerLimit,
        lowerUnit,
        upperLimit,
        upperUnit
      };
    }
  };
}
