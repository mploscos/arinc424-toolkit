import { makeLayoutSlicer } from "./layout_slicer.js";

/**
 * Create ER (airway leg) layout parser.
 * @param {object} config
 * @param {string} [layoutName]
 * @returns {{parse: Function}}
 */
export function createErLayout(config, layoutName = "ER") {
  const s = makeLayoutSlicer(config, layoutName);
  return {
    /**
     * Parse an ER line into a record.
     * @param {string} line
     * @returns {object|null}
     */
    parse(line) {
      const cont = s.trim(line, "cont");
      const isPrimary = cont === "0" || cont === "1";
      if (!isPrimary) return null;

      const route = s.trim(line, "route");
      const seq = Number(s.trim(line, "seq")) || 0;
      const fixId = s.trim(line, "fixId");
      const icao = s.trim(line, "icao");
      const fixSection = s.trim(line, "fixSection");
      const waypointDescCodeRaw = s.trim(line, "waypointDescCodeRaw");
      const boundaryCodeRaw = s.trim(line, "boundaryCodeRaw");
      const segmentCodeRaw = s.trim(line, "segmentCodeRaw");
      const segmentQualifierRaw = s.trim(line, "segmentQualifierRaw");
      const routeType = s.trim(line, "routeType");
      const level = s.trim(line, "level");
      const directionRestrictionRaw = s.trim(line, "directionRestrictionRaw");
      const cruiseTableIndicatorRaw = s.trim(line, "cruiseTableIndicatorRaw");
      const euIndicatorRaw = s.trim(line, "euIndicatorRaw");
      const recommendedNavaidRaw = s.trim(line, "recommendedNavaidRaw");
      const recommendedNavaidIcao = s.trim(line, "recommendedNavaidIcao");
      const rnpRaw = s.trim(line, "rnpRaw");
      const thetaRaw = s.trim(line, "thetaRaw");
      const rhoRaw = s.trim(line, "rhoRaw");
      const outboundMagCourseRaw = s.trim(line, "outboundMagCourseRaw");
      const routeDistanceFromRaw = s.trim(line, "routeDistanceFromRaw");
      const inboundMagCourseRaw = s.trim(line, "inboundMagCourseRaw");
      const courseDistanceBlockRaw = s.trim(line, "courseDistanceBlockRaw");
      const minAlt = s.trim(line, "minAlt");
      const minAlt2 = s.trim(line, "minAlt2");
      const altQualifierBlockRaw = s.trim(line, "altQualifierBlockRaw");
      const maxAlt = s.trim(line, "maxAlt");

      if (!route || !fixId) return null;
      return {
        route,
        seq,
        fixId,
        icao,
        fixSection,
        ...(waypointDescCodeRaw ? { waypointDescCodeRaw } : {}),
        ...(boundaryCodeRaw ? { boundaryCodeRaw } : {}),
        ...(segmentCodeRaw ? { segmentCodeRaw } : {}),
        ...(segmentQualifierRaw ? { segmentQualifierRaw } : {}),
        routeType,
        level,
        ...(directionRestrictionRaw ? { directionRestrictionRaw } : {}),
        ...(cruiseTableIndicatorRaw ? { cruiseTableIndicatorRaw } : {}),
        ...(euIndicatorRaw ? { euIndicatorRaw } : {}),
        ...(recommendedNavaidRaw ? { recommendedNavaidRaw } : {}),
        ...(recommendedNavaidIcao ? { recommendedNavaidIcao } : {}),
        ...(rnpRaw ? { rnpRaw } : {}),
        ...(thetaRaw ? { thetaRaw } : {}),
        ...(rhoRaw ? { rhoRaw } : {}),
        ...(outboundMagCourseRaw ? { outboundMagCourseRaw } : {}),
        ...(routeDistanceFromRaw ? { routeDistanceFromRaw } : {}),
        ...(inboundMagCourseRaw ? { inboundMagCourseRaw } : {}),
        ...(courseDistanceBlockRaw ? { courseDistanceBlockRaw } : {}),
        minAlt,
        ...(minAlt2 ? { minAlt2 } : {}),
        ...(altQualifierBlockRaw ? { altQualifierBlockRaw } : {}),
        maxAlt
      };
    }
  };
}
