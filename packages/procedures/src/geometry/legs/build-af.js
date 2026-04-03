import { bboxFromCoords } from "../../util/geo.js";
import { buildArcFromCenter, inferArcDirection } from "../../util/arc.js";

export function buildAFLeg(decodedLeg, startCoord) {
  const endCoord = decodedLeg.fixCoord ?? null;
  const center = decodedLeg.centerCoord ?? null;
  const radiusNm = decodedLeg.radiusNm ?? null;

  if (!startCoord || !endCoord || !center || !(Number(radiusNm) > 0)) {
    return {
      geometry: null,
      bbox: null,
      metadata: {
        ...decodedLeg.metadata,
        role: "arc-to-fix",
        legType: "AF",
        centerFixId: decodedLeg.centerFixId ?? null,
        centerFixRawId: decodedLeg.centerFixRawId ?? null,
        radiusNm
      },
      endCoord,
      warning: `AF leg ${decodedLeg.index} could not be built because start, end, center, or radius is unresolved`,
      warnings: []
    };
  }

  const direction = inferArcDirection(startCoord, endCoord, center, decodedLeg.turnDir);
  const arc = buildArcFromCenter(startCoord, endCoord, center, direction, { radiusNm, maxStepDeg: 2 });
  const warnings = [];
  if (!arc.validation.startOk) warnings.push(`AF leg ${decodedLeg.index} start does not match expected radius`);
  if (!arc.validation.endOk) warnings.push(`AF leg ${decodedLeg.index} end does not match expected radius`);
  const curve = {
    type: "circular-arc",
    center,
    radiusNm,
    direction,
    startCoord,
    endCoord
  };

  return {
    geometry: { type: "LineString", coordinates: arc.points },
    bbox: bboxFromCoords(arc.points),
    curve,
    metadata: {
      ...decodedLeg.metadata,
      role: "arc-to-fix",
      geometryIntent: "arc",
      displayModel: "Sampled arc preserved as compatibility LineString",
      legType: "AF",
      centerFixId: decodedLeg.centerFixId ?? null,
      centerFixRawId: decodedLeg.centerFixRawId ?? null,
      radiusNm,
      direction,
      center
    },
    endCoord,
    warnings
  };
}
