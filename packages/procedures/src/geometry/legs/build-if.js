import { bboxFromCoords } from "../../util/geo.js";

export function buildIFLeg(decodedLeg) {
  const geometry = decodedLeg.fixCoord
    ? { type: "Point", coordinates: decodedLeg.fixCoord }
    : null;
  return {
    geometry,
    bbox: geometry ? bboxFromCoords([decodedLeg.fixCoord]) : null,
    metadata: {
      ...decodedLeg.metadata,
      role: "initial-fix"
    },
    endCoord: decodedLeg.fixCoord ?? null,
    warning: decodedLeg.fixCoord ? null : `IF leg ${decodedLeg.index} has no resolved fix coordinates`
  };
}
