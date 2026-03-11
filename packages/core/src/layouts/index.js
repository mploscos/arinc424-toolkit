
import { createArptLayout } from "./arpt.js";
import { createPaLayout } from "./pa.js";
import { createPgLayout } from "./pg.js";
import { createWaypointLayout } from "./waypoint.js";
import { createVhfLayout } from "./vhf.js";
import { createNdbLayout } from "./ndb.js";
import { createUcLayout } from "./uc.js";
import { createUrLayout } from "./ur.js";
import { createErLayout } from "./er.js";
import { createUfLayout } from "./uf.js";
import { createProcedureLayout } from "./procedure.js";
import { createHoldingLayout } from "./holding.js";
import { createPreferredRouteLayout } from "./preferred_route.js";

/**
 * Build all layout parsers from a layout config.
 * @param {object} config
 * @returns {Record<string, {parse: Function}>}
 */
export function createLayouts(config) {
  return {
    ARPT: createArptLayout(config, "ARPT"),
    PA: createPaLayout(config, "PA"),
    PG: createPgLayout(config, "PG"),
    EA: createWaypointLayout(config, "EA"),
    PC: createWaypointLayout(config, "PC"),
    D: createVhfLayout(config, "D"),
    DB: createNdbLayout(config, "DB"),
    UC: createUcLayout(config, "UC"),
    UR: createUrLayout(config, "UR"),
    UF: createUfLayout(config, "UF"),
    ER: createErLayout(config, "ER"),
    EP: createHoldingLayout(config, "EP"),
    ET: createPreferredRouteLayout(config, "ET"),
    PD: createProcedureLayout(config, "PD"),
    PE: createProcedureLayout(config, "PE"),
    PF: createProcedureLayout(config, "PF"),
    HD: createProcedureLayout(config, "HD"),
    HE: createProcedureLayout(config, "HE"),
    HF: createProcedureLayout(config, "HF")
  };
}
