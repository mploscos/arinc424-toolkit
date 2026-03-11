import { makeLayoutSlicer } from "./layout_slicer.js";

/**
 * Create holding layout parser (EP).
 * @param {object} config
 * @param {string} [layoutName]
 * @returns {{parse: Function}}
 */
export function createHoldingLayout(config, layoutName = "EP") {
  const s = makeLayoutSlicer(config, layoutName);
  return {
    /**
     * Parse a holding line into a record.
     * @param {string} line
     * @returns {object|null}
     */
    parse(line) {
      const cont = s.trim(line, "cont");
      const isPrimary = cont === "0" || cont === "1";
      if (!isPrimary) return null;

      const region = s.trim(line, "region");
      const icao = s.trim(line, "icao");
      const duplicate = s.trim(line, "duplicate");
      const fixId = s.trim(line, "fixId");
      const fixIcao = s.trim(line, "fixIcao");
      const fixSection = s.trim(line, "fixSection");
      const inboundRaw = s.trim(line, "inboundRaw");
      const turnDir = s.trim(line, "turnDir");
      const legLengthRaw = s.trim(line, "legLengthRaw");
      const legTimeRaw = s.trim(line, "legTimeRaw");
      const minAlt = s.trim(line, "minAlt");
      const maxAlt = s.trim(line, "maxAlt");
      const speedRaw = s.trim(line, "speedRaw");
      const arcRadiusRaw = s.trim(line, "arcRadiusRaw");
      const name = s.trim(line, "name");

      if (!fixId) return null;
      return {
        region,
        icao,
        duplicate,
        fixId,
        fixIcao,
        fixSection,
        ...(inboundRaw ? { inboundRaw } : {}),
        turnDir,
        ...(legLengthRaw ? { legLengthRaw } : {}),
        ...(legTimeRaw ? { legTimeRaw } : {}),
        minAlt,
        maxAlt,
        ...(speedRaw ? { speedRaw } : {}),
        ...(arcRadiusRaw ? { arcRadiusRaw } : {}),
        name
      };
    }
  };
}
