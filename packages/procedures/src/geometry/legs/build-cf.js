import { bboxFromCoords, lineString } from "../../util/geo.js";

export function buildCFLeg(decodedLeg, startCoord) {
  const endCoord = decodedLeg.fixCoord ?? null;
  const geometry = startCoord && endCoord ? lineString(startCoord, endCoord) : null;
  return {
    geometry,
    bbox: geometry ? bboxFromCoords(geometry.coordinates) : null,
    metadata: {
      ...decodedLeg.metadata,
      role: "course-to-fix",
      approximation: "Current implementation approximates CF as anchor-to-fix line; course-origin reconstruction is pending"
    },
    endCoord,
    warning: geometry ? "CF leg approximated as straight line to fix" : `CF leg ${decodedLeg.index} could not be built because start or end fix is unresolved`
  };
}
