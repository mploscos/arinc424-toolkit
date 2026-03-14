import { bboxFromCoords, lineString } from "../../util/geo.js";

export function buildTFLeg(decodedLeg, startCoord) {
  const endCoord = decodedLeg.fixCoord ?? null;
  const geometry = startCoord && endCoord ? lineString(startCoord, endCoord) : null;
  return {
    geometry,
    bbox: geometry ? bboxFromCoords(geometry.coordinates) : null,
    metadata: {
      ...decodedLeg.metadata,
      role: "track-to-fix"
    },
    endCoord,
    warning: geometry ? null : `TF leg ${decodedLeg.index} could not be built because start or end fix is unresolved`
  };
}
