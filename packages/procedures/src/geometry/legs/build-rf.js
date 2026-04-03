import { bboxFromCoords } from "../../util/geo.js";
import { buildArcFromCenter, haversineMeters, inferArcDirection } from "../../util/arc.js";

const NM_TO_M = 1852;

export function buildRFLeg(decodedLeg, startCoord) {
  const endCoord = decodedLeg.fixCoord ?? null;
  const center = decodedLeg.centerCoord ?? null;
  const radiusNm = decodedLeg.radiusNm ?? null;

  if (!startCoord || !endCoord || !center || !(Number(radiusNm) > 0)) {
    return {
      geometry: null,
      bbox: null,
      metadata: {
        ...decodedLeg.metadata,
        role: "radius-to-fix",
        legType: "RF",
        centerFixId: decodedLeg.centerFixId ?? null,
        centerFixRawId: decodedLeg.centerFixRawId ?? null,
        radiusNm
      },
      endCoord,
      warning: `RF leg ${decodedLeg.index} could not be built because start, end, center, or radius is unresolved`,
      warnings: []
    };
  }

  const direction = inferArcDirection(startCoord, endCoord, center, decodedLeg.turnDir);
  const arc = buildArcFromCenter(startCoord, endCoord, center, direction, { radiusNm, maxStepDeg: 2 });
  const warnings = [];
  if (!arc.validation.startOk) warnings.push(`RF leg ${decodedLeg.index} start does not match expected radius`);
  if (!arc.validation.endOk) warnings.push(`RF leg ${decodedLeg.index} end does not match expected radius`);
  const curve = {
    type: "circular-arc",
    center,
    radiusNm,
    direction,
    startCoord,
    endCoord
  };
  const radiusDebug = {
    rawRadiusField: decodedLeg.arcRadiusRaw ?? null,
    parsedRadiusNm: radiusNm,
    center,
    startCoord,
    endCoord,
    distanceCenterStartNm: haversineMeters(center, startCoord) / NM_TO_M,
    distanceCenterEndNm: haversineMeters(center, endCoord) / NM_TO_M
  };

  return {
    geometry: { type: "LineString", coordinates: arc.points },
    bbox: bboxFromCoords(arc.points),
    curve,
    metadata: {
      ...decodedLeg.metadata,
      role: "radius-to-fix",
      geometryIntent: "arc",
      displayModel: "Sampled arc preserved as compatibility LineString",
      legType: "RF",
      centerFixId: decodedLeg.centerFixId ?? null,
      centerFixRawId: decodedLeg.centerFixRawId ?? null,
      radiusNm,
      direction,
      center,
      radiusDebug
    },
    endCoord,
    warnings
  };
}
