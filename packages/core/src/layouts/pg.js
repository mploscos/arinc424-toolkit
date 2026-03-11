import { makeLayoutSlicer } from "./layout_slicer.js";
import { parseLat, parseLon } from "../parsing/coords.js";

/**
 * Create PG (runway) layout parser.
 * @param {object} config
 * @param {string} [layoutName]
 * @returns {{parse: Function}}
 */
export function createPgLayout(config, layoutName = "PG") {
  const s = makeLayoutSlicer(config, layoutName);
  return {
    /**
     * Parse a PG line into a record.
     * @param {string} line
     * @returns {object|null}
     */
    parse(line) {
      const airportId = s.trim(line, "airportId");
      const icao = s.trim(line, "icao");
      const runwayId = s.trim(line, "runwayId");
      const lat = parseLat(s.raw(line, "lat"));
      const lon = parseLon(s.raw(line, "lon"));
      if (lat == null || lon == null) return null;
      const lengthFt = Number(s.trim(line, "lengthFt")) || null;
      const bearing = Number(s.trim(line, "bearing")) || null;
      const elevationFt = Number(s.trim(line, "elevationFt")) || null;
      const widthFt = Number(s.trim(line, "widthFt")) || null;
      const name = s.trim(line, "name");
      return {
        airportId,
        icao,
        runwayId,
        lat,
        lon,
        lengthFt,
        bearing,
        elevationFt,
        widthFt,
        name
      };
    }
  };
}
