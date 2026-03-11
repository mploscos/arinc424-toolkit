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
 * Create VHF navaid layout parser (D).
 * @param {object} config
 * @param {string} [layoutName]
 * @returns {{parse: Function}}
 */
export function createVhfLayout(config, layoutName = "D") {
  const s = makeLayoutSlicer(config, layoutName);
  return {
    /**
     * Parse a VHF navaid line into a record.
     * @param {string} line
     * @returns {object|null}
     */
    parse(line) {
      const id = s.trim(line, "id");
      const icao = s.trim(line, "icao");
      const lat = parseLat(s.raw(line, "lat"));
      const lon = parseLon(s.raw(line, "lon"));
      if (lat == null || lon == null) return null;
      const dmeLat = parseLat(s.raw(line, "dmeLat"));
      const dmeLon = parseLon(s.raw(line, "dmeLon"));
      const frequency = s.trim(line, "frequency");
      const klass = s.trim(line, "klass");
      const classDetail = s.trim(line, "classDetail");
      const classFullRaw = `${s.raw(line, "klass") ?? ""}${s.raw(line, "classDetail") ?? ""}`.trim();
      const { magVarRaw, magVarDeg } = parseMagVar(s.raw(line, "magVar"));
      const auxField80to85Raw = s.trim(line, "auxField80to85");
      const name = s.trim(line, "name");
      return {
        id,
        icao,
        name,
        frequency,
        class: klass,
        ...(classDetail ? { classDetail } : {}),
        ...(classFullRaw ? { classFullRaw } : {}),
        ...(magVarRaw ? { magVarRaw } : {}),
        ...(magVarDeg != null ? { magVarDeg } : {}),
        ...(auxField80to85Raw ? { auxField80to85Raw } : {}),
        lat,
        lon,
        ...(dmeLat != null ? { dmeLat } : {}),
        ...(dmeLon != null ? { dmeLon } : {})
      };
    }
  };
}
