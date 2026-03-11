import { makeLayoutSlicer } from "./layout_slicer.js";

/**
 * Create preferred route layout parser (ET).
 * @param {object} config
 * @param {string} [layoutName]
 * @returns {{parse: Function}}
 */
export function createPreferredRouteLayout(config, layoutName = "ET") {
  const s = makeLayoutSlicer(config, layoutName);
  return {
    /**
     * Parse a preferred route line into a record.
     * @param {string} line
     * @returns {object|null}
     */
    parse(line) {
      const cont = s.trim(line, "cont");
      const isPrimary = cont === "0" || cont === "1";
      if (!isPrimary) return null;

      const routeId = s.trim(line, "routeId");
      const useInd = s.trim(line, "useInd");
      const seq = Number(s.trim(line, "seq")) || 0;
      const toFix = s.trim(line, "toFix");
      const toIcao = s.trim(line, "toIcao");
      const toSection = s.trim(line, "toSection");
      const viaCode = s.trim(line, "viaCode");
      const viaIdent = s.trim(line, "viaIdent");
      const areaCode = s.trim(line, "areaCode");
      const level = s.trim(line, "level");
      const routeType = s.trim(line, "routeType");
      const initialFix = s.trim(line, "initialFix");
      const initialIcao = s.trim(line, "initialIcao");
      const initialSection = s.trim(line, "initialSection");
      const terminusFix = s.trim(line, "terminusFix");
      const terminusIcao = s.trim(line, "terminusIcao");
      const terminusSection = s.trim(line, "terminusSection");
      const minAlt = s.trim(line, "minAlt");
      const maxAlt = s.trim(line, "maxAlt");

      if (!routeId) return null;
      return {
        routeId,
        useInd,
        seq,
        toFix,
        toIcao,
        toSection,
        viaCode,
        viaIdent,
        areaCode,
        level,
        routeType,
        initialFix,
        initialIcao,
        initialSection,
        terminusFix,
        terminusIcao,
        terminusSection,
        minAlt,
        maxAlt
      };
    }
  };
}
