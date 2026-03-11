import { makeLayoutSlicer } from "./layout_slicer.js";
import { parseLat, parseLon } from "../parsing/coords.js";

/**
 * Create UF (FIR/UIR) layout parser.
 * @param {object} config
 * @param {string} [layoutName]
 * @returns {{parse: Function}}
 */
export function createUfLayout(config, layoutName = "UF") {
  const s = makeLayoutSlicer(config, layoutName);
  return {
    /**
     * Parse a UF line into a record.
     * @param {string} line
     * @returns {object|null}
     */
    parse(line) {
      const cont = s.trim(line, "cont");
      const isPrimary = cont === "0" || cont === "1";
      if (!isPrimary) return null;

      const firId = s.trim(line, "firId");
      const firAddress = s.trim(line, "firAddress");
      const firIndicator = s.trim(line, "firIndicator");
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
      const firUpper = s.trim(line, "firUpper");
      const uirLower = s.trim(line, "uirLower");
      const uirUpper = s.trim(line, "uirUpper");
      const name = s.trim(line, "name");

      const key = `${firId}|${firAddress}|${firIndicator}`;
      return {
        key,
        seq,
        lat,
        lon,
        name,
        firId,
        firAddress,
        firIndicator,
        boundaryVia,
        arcLat,
        arcLon,
        arcDistance,
        arcBearing,
        firUpper,
        uirLower,
        uirUpper
      };
    }
  };
}
