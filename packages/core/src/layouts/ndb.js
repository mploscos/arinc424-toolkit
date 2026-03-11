import { makeLayoutSlicer } from "./layout_slicer.js";
import { parseLat, parseLon } from "../parsing/coords.js";

function parseMagVar(raw) {
  const value = String(raw ?? "").trim();
  if (!value) return { magVarRaw: null, magVarDeg: null };
  const m = /^([EW])(\d{4})$/.exec(value);
  if (!m) return { magVarRaw: value, magVarDeg: null };
  const sign = m[1] === "E" ? 1 : -1;
  return { magVarRaw: value, magVarDeg: sign * (Number(m[2]) / 10) };
}

/**
 * Create NDB layout parser (DB).
 * @param {object} config
 * @param {string} [layoutName]
 * @returns {{parse: Function}}
 */
export function createNdbLayout(config, layoutName = "DB") {
  const s = makeLayoutSlicer(config, layoutName);
  return {
    /**
     * Parse an NDB line into a record.
     * @param {string} line
     * @returns {object|null}
     */
    parse(line) {
      const id = s.trim(line, "id");
      const icao = s.trim(line, "icao");
      const lat = parseLat(s.raw(line, "lat"));
      const lon = parseLon(s.raw(line, "lon"));
      if (lat == null || lon == null) return null;
      const frequency = s.trim(line, "frequency");
      const klass = s.trim(line, "klass");
      const { magVarRaw, magVarDeg } = parseMagVar(s.raw(line, "magVar"));
      const name = s.trim(line, "name");
      return {
        id,
        icao,
        name,
        frequency,
        class: klass,
        ...(magVarRaw ? { magVarRaw } : {}),
        ...(magVarDeg != null ? { magVarDeg } : {}),
        lat,
        lon
      };
    }
  };
}
