import { decodeProcedureLegs } from "../decode/decode-legs.js";
import { validateProcedureLegSequence } from "../validate/validate-leg-sequence.js";
import { coordDistance, coordsMatchWithin, mergeBboxes } from "../util/geo.js";
import { buildIFLeg } from "./legs/build-if.js";
import { buildTFLeg } from "./legs/build-tf.js";
import { buildCFLeg } from "./legs/build-cf.js";
import { buildDFLeg } from "./legs/build-df.js";
import { buildRFLeg } from "./legs/build-rf.js";
import { buildAFLeg } from "./legs/build-af.js";

// TODO (0.1.7):
// Implement additional Attachment 5 leg types beyond phase 2 arcs.

function buildUnsupportedLeg(decodedLeg) {
  return {
    index: decodedLeg.index,
    pathTerminator: decodedLeg.pathTerminator,
    supported: false,
    geometry: null,
    warnings: [decodedLeg.metadata?.unsupportedReason ?? `Unsupported leg ${decodedLeg.pathTerminator || "UNKNOWN"}`].filter(Boolean),
    metadata: {
      legType: decodedLeg.pathTerminator,
      ...decodedLeg.metadata,
      preserved: true
    }
  };
}

export function buildProcedureGeometry(input, procedureId = null) {
  const decoded = Array.isArray(input?.legs) && typeof input?.procedureId === "string"
    ? input
    : decodeProcedureLegs(input, procedureId);
  const validation = validateProcedureLegSequence(decoded);
  const warnings = [...(decoded.warnings ?? []), ...(validation.warnings ?? [])];
  const builtLegs = [];
  const lineParts = [];
  let currentCoord = null;
  let previousEndCoord = null;
  let previousLegIndex = null;

  for (const leg of decoded.legs) {
    let built;
    let legWarnings = [];
    if (!leg.supported) {
      built = buildUnsupportedLeg(leg);
    } else if (leg.pathTerminator === "IF") {
      const result = buildIFLeg(leg);
      legWarnings = [result.warning].filter(Boolean);
      for (const item of legWarnings) warnings.push(item);
      currentCoord = result.endCoord ?? currentCoord;
      built = {
        index: leg.index,
        pathTerminator: leg.pathTerminator,
        supported: true,
        geometry: result.geometry,
        bbox: result.bbox,
        warnings: legWarnings,
        metadata: {
          legType: leg.pathTerminator,
          ...result.metadata
        }
      };
    } else if (leg.pathTerminator === "TF") {
      const result = buildTFLeg(leg, currentCoord);
      legWarnings = [result.warning].filter(Boolean);
      for (const item of legWarnings) warnings.push(item);
      if (result.geometry) lineParts.push(result.geometry.coordinates);
      currentCoord = result.endCoord ?? currentCoord;
      built = {
        index: leg.index,
        pathTerminator: leg.pathTerminator,
        supported: true,
        geometry: result.geometry,
        bbox: result.bbox,
        warnings: legWarnings,
        metadata: {
          legType: leg.pathTerminator,
          ...result.metadata
        }
      };
    } else if (leg.pathTerminator === "CF") {
      const result = buildCFLeg(leg, currentCoord);
      legWarnings = [result.warning].filter(Boolean);
      for (const item of legWarnings) warnings.push(item);
      if (result.geometry) lineParts.push(result.geometry.coordinates);
      currentCoord = result.endCoord ?? currentCoord;
      built = {
        index: leg.index,
        pathTerminator: leg.pathTerminator,
        supported: true,
        geometry: result.geometry,
        bbox: result.bbox,
        warnings: legWarnings,
        metadata: {
          legType: leg.pathTerminator,
          ...result.metadata
        }
      };
    } else if (leg.pathTerminator === "DF") {
      const result = buildDFLeg(leg, currentCoord);
      legWarnings = [result.warning].filter(Boolean);
      for (const item of legWarnings) warnings.push(item);
      if (result.geometry) lineParts.push(result.geometry.coordinates);
      currentCoord = result.endCoord ?? currentCoord;
      built = {
        index: leg.index,
        pathTerminator: leg.pathTerminator,
        supported: true,
        geometry: result.geometry,
        bbox: result.bbox,
        warnings: legWarnings,
        metadata: {
          legType: leg.pathTerminator,
          ...result.metadata
        }
      };
    } else if (leg.pathTerminator === "RF") {
      const result = buildRFLeg(leg, currentCoord);
      legWarnings = [result.warning, ...(result.warnings ?? [])].filter(Boolean);
      for (const item of legWarnings) warnings.push(item);
      if (result.geometry) lineParts.push(result.geometry.coordinates);
      currentCoord = result.endCoord ?? currentCoord;
      built = {
        index: leg.index,
        pathTerminator: leg.pathTerminator,
        supported: true,
        geometry: result.geometry,
        bbox: result.bbox,
        warnings: legWarnings,
        metadata: {
          legType: leg.pathTerminator,
          ...result.metadata
        }
      };
    } else if (leg.pathTerminator === "AF") {
      const result = buildAFLeg(leg, currentCoord);
      legWarnings = [result.warning, ...(result.warnings ?? [])].filter(Boolean);
      for (const item of legWarnings) warnings.push(item);
      if (result.geometry) lineParts.push(result.geometry.coordinates);
      currentCoord = result.endCoord ?? currentCoord;
      built = {
        index: leg.index,
        pathTerminator: leg.pathTerminator,
        supported: true,
        geometry: result.geometry,
        bbox: result.bbox,
        warnings: legWarnings,
        metadata: {
          legType: leg.pathTerminator,
          ...result.metadata
        }
      };
    } else {
      built = buildUnsupportedLeg(leg);
    }

    const builtStartCoord = built?.geometry?.type === "LineString"
      ? built.geometry.coordinates?.[0]
      : (built?.geometry?.type === "Point" ? built.geometry.coordinates : null);
    const builtEndCoord = built?.geometry?.type === "LineString"
      ? built.geometry.coordinates?.[built.geometry.coordinates.length - 1]
      : (built?.geometry?.type === "Point" ? built.geometry.coordinates : null);

    if (built?.supported && previousEndCoord && builtStartCoord && !coordsMatchWithin(previousEndCoord, builtStartCoord)) {
      warnings.push(
        `Geometry discontinuity detected between leg ${previousLegIndex} and leg ${leg.index} (delta=${coordDistance(previousEndCoord, builtStartCoord).toFixed(6)})`
      );
    }

    builtLegs.push(built);
    if (builtEndCoord) {
      previousEndCoord = builtEndCoord;
      previousLegIndex = leg.index;
    }
  }

  const multiLineCoordinates = lineParts.filter((coords) => Array.isArray(coords) && coords.length >= 2);
  const geometry = multiLineCoordinates.length === 0
    ? null
    : multiLineCoordinates.length === 1
      ? { type: "LineString", coordinates: multiLineCoordinates[0] }
      : { type: "MultiLineString", coordinates: multiLineCoordinates };

  return {
    procedureId: decoded.procedureId,
    routeType: decoded.routeType,
    transitionId: decoded.transitionId,
    legs: builtLegs,
    geometry,
    bbox: mergeBboxes(builtLegs.map((leg) => leg.bbox).filter(Boolean)),
    warnings,
    validation
  };
}
