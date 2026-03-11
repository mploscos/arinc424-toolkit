import { makeLayoutSlicer } from "./layout_slicer.js";

/**
 * Create procedure layout parser (PD/PE/PF/HD/HE/HF).
 * @param {object} config
 * @param {string} [layoutName]
 * @returns {{parse: Function}}
 */
export function createProcedureLayout(config, layoutName = "PD") {
  const s = makeLayoutSlicer(config, layoutName);
  return {
    /**
     * Parse a procedure line into a record.
     * @param {string} line
     * @returns {object|null}
     */
    parse(line) {
      const cont = s.trim(line, "cont");
      const isPrimary = cont === "0" || cont === "1";
      if (!isPrimary) return null;

      const airportId = s.trim(line, "airportId");
      const icao = s.trim(line, "icao");
      const procId = s.trim(line, "procId");
      const routeType = s.trim(line, "routeType");
      const transitionId = s.trim(line, "transitionId");
      const seq = Number(s.trim(line, "seq")) || 0;
      const fixId = s.trim(line, "fixId");
      const fixIcao = s.trim(line, "fixIcao");
      const fixSection = s.trim(line, "fixSection");
      const pathTerm = s.trim(line, "pathTerm");
      const turnDir = s.trim(line, "turnDir");
      const legCodeRaw = s.trim(line, "legCodeRaw");
      const auxRefBlockRaw = s.trim(line, "auxRefBlockRaw");
      const arcRadiusRaw = s.trim(line, "arcRadiusRaw");
      const navBlockRaw = s.trim(line, "navBlockRaw");
      const centerFix = s.trim(line, "centerFix");
      const centerIcao = s.trim(line, "centerIcao");
      const centerSection = s.trim(line, "centerSection");
      const altDesc = s.trim(line, "altDesc");
      const alt1 = s.trim(line, "alt1");
      const alt2 = s.trim(line, "alt2");
      const altBlock95to99Raw = s.trim(line, "altBlock95to99Raw");
      const speed = s.trim(line, "speed");
      const vertBlock103to106Raw = s.trim(line, "vertBlock103to106Raw");
      const procFlagsRaw = s.trim(line, "procFlagsRaw");

      if (!airportId || !procId || (!fixId && !pathTerm)) return null;
      return {
        airportId,
        icao,
        procId,
        routeType,
        transitionId,
        seq,
        fixId,
        fixIcao,
        fixSection,
        pathTerm,
        turnDir,
        ...(legCodeRaw ? { legCodeRaw } : {}),
        ...(auxRefBlockRaw ? { auxRefBlockRaw } : {}),
        ...(arcRadiusRaw ? { arcRadiusRaw } : {}),
        ...(navBlockRaw ? { navBlockRaw } : {}),
        centerFix,
        centerIcao,
        centerSection,
        altDesc,
        alt1,
        alt2,
        ...(altBlock95to99Raw ? { altBlock95to99Raw } : {}),
        speed,
        ...(vertBlock103to106Raw ? { vertBlock103to106Raw } : {}),
        ...(procFlagsRaw ? { procFlagsRaw } : {})
      };
    }
  };
}
