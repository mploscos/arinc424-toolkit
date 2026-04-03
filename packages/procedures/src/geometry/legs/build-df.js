import { bboxFromCoords, lineString } from "../../util/geo.js";

export function buildDFLeg(decodedLeg, startCoord) {
  const endCoord = decodedLeg.fixCoord ?? null;
  const geometry = startCoord && endCoord ? lineString(startCoord, endCoord) : null;
  return {
    geometry,
    bbox: geometry ? bboxFromCoords(geometry.coordinates) : null,
    metadata: {
      ...decodedLeg.metadata,
      role: "direct-to-fix",
      geometryIntent: "direct-to-fix",
      displayModel: "Direct line from current anchor to terminating fix"
    },
    endCoord,
    warning: geometry ? null : `DF leg ${decodedLeg.index} could not be built because start or end fix is unresolved`
  };
}
