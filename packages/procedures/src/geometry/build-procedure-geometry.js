import { decodeProcedureLegs } from "../decode/decode-legs.js";
import { validateProcedureLegSequence } from "../validate/validate-leg-sequence.js";
import { coordDistance, coordsMatchWithin, mergeBboxes } from "../util/geo.js";
import { buildIFLeg } from "./legs/build-if.js";
import { buildTFLeg } from "./legs/build-tf.js";
import { buildCFLeg } from "./legs/build-cf.js";
import { buildDFLeg } from "./legs/build-df.js";
import { buildRFLeg } from "./legs/build-rf.js";
import { buildAFLeg } from "./legs/build-af.js";
import { buildOpenLeg } from "./legs/build-open-leg.js";
import { buildHoldLeg } from "./legs/build-hold.js";

const DEFAULT_CONTINUITY_TOLERANCE_DEGREES = 1e-4;
const LEG_PRESENTATION_MODELS = Object.freeze({
  IF: Object.freeze({
    semanticClass: "if",
    depictionClass: "chart-point",
    geometryKind: "point",
    chartObjectClass: "fix",
    bounded: true,
    approximationLevel: "exact",
    implemented: true
  }),
  TF: Object.freeze({
    semanticClass: "tf",
    depictionClass: "chart-line",
    geometryKind: "track",
    chartObjectClass: "route-leg",
    bounded: true,
    approximationLevel: "exact",
    implemented: true
  }),
  CF: Object.freeze({
    semanticClass: "cf",
    depictionClass: "chart-line",
    geometryKind: "course",
    chartObjectClass: "route-leg",
    bounded: true,
    approximationLevel: "approximate",
    implemented: true
  }),
  DF: Object.freeze({
    semanticClass: "df",
    depictionClass: "chart-line",
    geometryKind: "direct",
    chartObjectClass: "route-leg",
    bounded: true,
    approximationLevel: "practical",
    implemented: true
  }),
  RF: Object.freeze({
    semanticClass: "rf",
    depictionClass: "chart-arc",
    geometryKind: "arc",
    chartObjectClass: "arc-leg",
    bounded: true,
    approximationLevel: "visual",
    implemented: true
  }),
  AF: Object.freeze({
    semanticClass: "af",
    depictionClass: "chart-arc",
    geometryKind: "arc",
    chartObjectClass: "arc-leg",
    bounded: true,
    approximationLevel: "visual",
    implemented: true
  }),
  CA: Object.freeze({
    semanticClass: "ca",
    depictionClass: "open-leg",
    geometryKind: "ray",
    chartObjectClass: "open-leg",
    bounded: false,
    approximationLevel: "approximate",
    implemented: true
  }),
  FA: Object.freeze({
    semanticClass: "fa",
    depictionClass: "open-leg",
    geometryKind: "ray",
    chartObjectClass: "open-leg",
    bounded: false,
    approximationLevel: "approximate",
    implemented: true
  }),
  VA: Object.freeze({
    semanticClass: "va",
    depictionClass: "open-leg",
    geometryKind: "ray",
    chartObjectClass: "open-leg",
    bounded: false,
    approximationLevel: "approximate",
    implemented: true
  }),
  VI: Object.freeze({
    semanticClass: "vi",
    depictionClass: "open-leg",
    geometryKind: "ray",
    chartObjectClass: "open-leg",
    bounded: false,
    approximationLevel: "approximate",
    implemented: true
  }),
  VM: Object.freeze({
    semanticClass: "vm",
    depictionClass: "open-leg",
    geometryKind: "ray",
    chartObjectClass: "open-leg",
    bounded: false,
    approximationLevel: "approximate",
    implemented: true
  }),
  FM: Object.freeze({
    semanticClass: "fm",
    depictionClass: "open-leg",
    geometryKind: "ray",
    chartObjectClass: "open-leg",
    bounded: false,
    approximationLevel: "approximate",
    implemented: true
  }),
  HA: Object.freeze({
    semanticClass: "ha",
    depictionClass: "hold",
    geometryKind: "hold",
    chartObjectClass: "hold-racetrack",
    bounded: false,
    approximationLevel: "practical",
    implemented: true
  }),
  HF: Object.freeze({
    semanticClass: "hf",
    depictionClass: "hold",
    geometryKind: "hold",
    chartObjectClass: "hold-racetrack",
    bounded: true,
    approximationLevel: "practical",
    implemented: true
  }),
  HM: Object.freeze({
    semanticClass: "hm",
    depictionClass: "hold",
    geometryKind: "hold",
    chartObjectClass: "hold-racetrack",
    bounded: false,
    approximationLevel: "practical",
    implemented: true
  })
});

const TERMINATOR_BUILDERS = Object.freeze({
  IF: (leg) => buildIFLeg(leg),
  TF: (leg, state) => buildTFLeg(leg, leg.startCoord ?? state.currentCoord),
  CF: (leg, state) => buildCFLeg(leg, leg.startCoord ?? state.currentCoord),
  DF: (leg, state) => buildDFLeg(leg, leg.startCoord ?? state.currentCoord),
  RF: (leg, state) => buildRFLeg(leg, leg.startCoord ?? state.currentCoord),
  AF: (leg, state) => buildAFLeg(leg, leg.startCoord ?? state.currentCoord),
  CA: (leg, state) => buildOpenLeg(leg, leg.startCoord ?? state.currentCoord),
  FA: (leg, state) => buildOpenLeg(leg, leg.startCoord ?? state.currentCoord),
  VA: (leg, state) => buildOpenLeg(leg, leg.startCoord ?? state.currentCoord),
  VI: (leg, state) => buildOpenLeg(leg, leg.startCoord ?? state.currentCoord),
  VM: (leg, state) => buildOpenLeg(leg, leg.startCoord ?? state.currentCoord),
  FM: (leg, state) => buildOpenLeg(leg, leg.startCoord ?? state.currentCoord),
  HA: (leg, state) => buildHoldLeg(leg, leg.startCoord ?? state.currentCoord),
  HF: (leg, state) => buildHoldLeg(leg, leg.startCoord ?? state.currentCoord),
  HM: (leg, state) => buildHoldLeg(leg, leg.startCoord ?? state.currentCoord)
});

function getLegPresentationModel(pathTerminator) {
  return LEG_PRESENTATION_MODELS[pathTerminator] ?? {
    semanticClass: "unsupported",
    depictionClass: "unsupported",
    geometryKind: "unsupported",
    chartObjectClass: "unsupported",
    bounded: false,
    approximationLevel: "approximate",
    implemented: false
  };
}

function normalizeBuildProcedureGeometryArgs(procedureIdOrOptions = null, options = {}) {
  if (procedureIdOrOptions && typeof procedureIdOrOptions === "object" && !Array.isArray(procedureIdOrOptions)) {
    return {
      procedureId: null,
      options: procedureIdOrOptions
    };
  }

  return {
    procedureId: procedureIdOrOptions,
    options
  };
}

function isDecodedProcedureInput(input) {
  return Boolean(input)
    && typeof input.procedureId === "string"
    && (Array.isArray(input.legs) || Array.isArray(input.commonLegs));
}

function cloneApplicability(applicability) {
  return {
    aircraftCategories: applicability?.aircraftCategories ?? null,
    aircraftTypes: applicability?.aircraftTypes ?? null,
    operationTypes: applicability?.operationTypes ?? null
  };
}

function getGeometryStartCoord(geometry) {
  if (geometry?.type === "Point") return geometry.coordinates ?? null;
  if (geometry?.type === "LineString") return geometry.coordinates?.[0] ?? null;
  if (geometry?.type === "MultiLineString") return geometry.coordinates?.[0]?.[0] ?? null;
  return null;
}

function getGeometryEndCoord(geometry) {
  if (geometry?.type === "Point") return geometry.coordinates ?? null;
  if (geometry?.type === "LineString") return geometry.coordinates?.[geometry.coordinates.length - 1] ?? null;
  if (geometry?.type === "MultiLineString") {
    const lastPart = geometry.coordinates?.[geometry.coordinates.length - 1];
    return lastPart?.[lastPart.length - 1] ?? null;
  }
  return null;
}

function getAggregatedLineParts(geometry) {
  if (geometry?.type === "LineString") return [geometry.coordinates];
  if (geometry?.type === "MultiLineString") return geometry.coordinates;
  return [];
}

function buildAggregateGeometry(lineParts) {
  const multiLineCoordinates = lineParts.filter((coords) => Array.isArray(coords) && coords.length >= 2);
  if (multiLineCoordinates.length === 0) return null;
  if (multiLineCoordinates.length === 1) {
    return { type: "LineString", coordinates: multiLineCoordinates[0] };
  }
  return { type: "MultiLineString", coordinates: multiLineCoordinates };
}

function buildPendingLeg(decodedLeg) {
  return {
    geometry: null,
    bbox: null,
    endCoord: decodedLeg.fixCoord ?? null,
    metadata: {
      ...decodedLeg.metadata,
      role: "interpreter-pending",
      geometryIntent: decodedLeg.pathTerminator,
      displayModel: `No depiction geometry is emitted yet for ${decodedLeg.pathTerminator}`
    },
    warning: `${decodedLeg.pathTerminator} leg ${decodedLeg.index} is recognized but its semantic/depiction geometry is not implemented yet`,
    warnings: []
  };
}

function buildSemanticGeometry(model, result) {
  return {
    semanticClass: model.semanticClass,
    geometryKind: model.geometryKind,
    chartObjectClass: model.chartObjectClass,
    bounded: model.bounded,
    approximationLevel: model.approximationLevel,
    geometry: result.semanticGeometry ?? result.geometry ?? null,
    bbox: result.semanticBbox ?? result.bbox ?? null,
    curve: result.semanticCurve ?? result.curve ?? null
  };
}

function buildDepictionGeometry(model, result) {
  return {
    depictionClass: model.depictionClass,
    chartObjectClass: model.chartObjectClass,
    geometry: result.depictionGeometry ?? result.chartGeometry ?? result.geometry ?? null,
    bbox: result.depictionBbox ?? result.chartBbox ?? result.bbox ?? null,
    curve: result.depictionCurve ?? result.chartCurve ?? result.curve ?? null
  };
}

function buildMetadata(decodedLeg, model, result) {
  return {
    ...(result.metadata ?? {}),
    legType: decodedLeg.pathTerminator,
    semanticClass: model.semanticClass,
    depictionClass: model.depictionClass,
    geometryKind: model.geometryKind,
    chartObjectClass: model.chartObjectClass,
    bounded: model.bounded,
    approximationLevel: model.approximationLevel,
    renderClass: model.semanticClass,
    implemented: model.implemented
  };
}

function buildChartAnnotations(result) {
  return result.chartAnnotations ?? null;
}

function buildLegOutput(decodedLeg, result, warnings) {
  const model = getLegPresentationModel(decodedLeg.pathTerminator);
  const semanticGeometry = buildSemanticGeometry(model, result);
  const depictionGeometry = buildDepictionGeometry(model, result);
  const legacyGeometry = result.legacyGeometry ?? depictionGeometry.geometry;
  const legacyBbox = result.legacyBbox ?? depictionGeometry.bbox;

  return {
    index: decodedLeg.index,
    pathTerminator: decodedLeg.pathTerminator,
    supported: true,
    branchId: decodedLeg.branchId ?? null,
    applicability: cloneApplicability(decodedLeg.applicability),
    semanticClass: model.semanticClass,
    depictionClass: model.depictionClass,
    geometryKind: model.geometryKind,
    chartObjectClass: model.chartObjectClass,
    bounded: model.bounded,
    approximationLevel: model.approximationLevel,
    renderClass: model.semanticClass,
    semanticGeometry,
    depictionGeometry,
    chartGeometry: depictionGeometry,
    chartAnnotations: buildChartAnnotations(result),
    legacyGeometry,
    geometry: legacyGeometry,
    bbox: legacyBbox,
    warnings,
    metadata: buildMetadata(decodedLeg, model, result)
  };
}

function buildUnsupportedLeg(decodedLeg) {
  const model = getLegPresentationModel(decodedLeg.pathTerminator);
  const depictionGeometry = {
    depictionClass: model.depictionClass,
    geometry: null,
    bbox: null,
    curve: null
  };
  const semanticGeometry = {
    semanticClass: model.semanticClass,
    geometryKind: model.geometryKind,
    bounded: model.bounded,
    approximationLevel: model.approximationLevel,
    geometry: null,
    bbox: null,
    curve: null
  };
  return {
    index: decodedLeg.index,
    pathTerminator: decodedLeg.pathTerminator,
    supported: false,
    branchId: decodedLeg.branchId ?? null,
    applicability: cloneApplicability(decodedLeg.applicability),
    semanticClass: model.semanticClass,
    depictionClass: model.depictionClass,
    geometryKind: model.geometryKind,
    chartObjectClass: model.chartObjectClass,
    bounded: model.bounded,
    approximationLevel: model.approximationLevel,
    renderClass: model.semanticClass,
    semanticGeometry,
    depictionGeometry,
    chartGeometry: depictionGeometry,
    chartAnnotations: null,
    legacyGeometry: null,
    geometry: null,
    bbox: null,
    warnings: [decodedLeg.metadata?.unsupportedReason ?? `Unsupported leg ${decodedLeg.pathTerminator || "UNKNOWN"}`].filter(Boolean),
    metadata: {
      ...decodedLeg.metadata,
      legType: decodedLeg.pathTerminator,
      semanticClass: model.semanticClass,
      depictionClass: model.depictionClass,
      geometryKind: model.geometryKind,
      chartObjectClass: model.chartObjectClass,
      bounded: model.bounded,
      approximationLevel: model.approximationLevel,
      renderClass: model.semanticClass,
      implemented: model.implemented,
      preserved: true
    }
  };
}

function buildProcedureLeg(decodedLeg, state, warnings) {
  if (!decodedLeg.supported) {
    return {
      built: buildUnsupportedLeg(decodedLeg),
      nextState: state,
      legacyLineParts: []
    };
  }

  const builder = TERMINATOR_BUILDERS[decodedLeg.pathTerminator] ?? buildPendingLeg;
  const result = builder(decodedLeg, state);
  const legWarnings = [result.warning, ...(result.warnings ?? [])].filter(Boolean);
  for (const item of legWarnings) warnings.push(item);
  const built = buildLegOutput(decodedLeg, result, legWarnings);
  const depictionGeometry = built.depictionGeometry?.geometry ?? built.legacyGeometry;
  const depictionStart = getGeometryStartCoord(depictionGeometry);
  const depictionEnd = getGeometryEndCoord(depictionGeometry);

  if (
    built.supported
    && state.previousBounded !== false
    && built.bounded !== false
    && state.previousEndCoord
    && depictionStart
    && !coordsMatchWithin(state.previousEndCoord, depictionStart, state.continuityToleranceDegrees)
  ) {
    warnings.push(
      `Geometry discontinuity detected between leg ${state.previousLegIndex} and leg ${decodedLeg.index} `
      + `(delta=${coordDistance(state.previousEndCoord, depictionStart).toFixed(6)}, `
      + `tolerance=${state.continuityToleranceDegrees.toFixed(6)})`
    );
  }

  return {
    built,
    nextState: {
      ...state,
      currentCoord: result.endCoord ?? state.currentCoord,
      previousEndCoord: built.bounded !== false && depictionEnd ? depictionEnd : state.previousEndCoord,
      previousLegIndex: built.bounded !== false && depictionEnd ? decodedLeg.index : state.previousLegIndex,
      previousBounded: built.bounded
    },
    legacyLineParts: getAggregatedLineParts(built.legacyGeometry)
  };
}

function buildLegSequence(legs, options = {}) {
  const warnings = options.warnings;
  const builtLegs = [];
  const lineParts = [];
  let state = {
    currentCoord: options.initialState?.currentCoord ?? null,
    previousEndCoord: options.initialState?.previousEndCoord ?? null,
    previousLegIndex: options.initialState?.previousLegIndex ?? null,
    previousBounded: options.initialState?.previousBounded ?? true,
    continuityToleranceDegrees: options.continuityToleranceDegrees
  };

  for (const leg of legs) {
    const result = buildProcedureLeg(leg, state, warnings);
    builtLegs.push(result.built);
    lineParts.push(...result.legacyLineParts);
    state = result.nextState;
  }

  return {
    legs: builtLegs,
    geometry: buildAggregateGeometry(lineParts),
    bbox: mergeBboxes(builtLegs.map((leg) => leg.bbox).filter(Boolean)),
    finalState: state
  };
}

/**
 * Build per-leg procedure geometry with explicit semantic meaning, depiction meaning,
 * applicability, and optional branches. Legacy aggregated geometry remains available
 * through the existing `geometry` field and per-leg `geometry` alias.
 *
 * @param {object} input
 * @param {string|{ continuityToleranceDegrees?: number }|null} [procedureIdOrOptions=null]
 * @param {{ continuityToleranceDegrees?: number }} [options={}]
 */
export function buildProcedureGeometry(input, procedureIdOrOptions = null, options = {}) {
  const { procedureId, options: resolvedOptions } = normalizeBuildProcedureGeometryArgs(procedureIdOrOptions, options);
  const decoded = isDecodedProcedureInput(input)
    ? input
    : decodeProcedureLegs(input, procedureId);
  const validation = validateProcedureLegSequence(decoded);
  const warnings = [...(decoded.warnings ?? []), ...(validation.warnings ?? [])];
  const continuityToleranceDegrees = Number.isFinite(Number(resolvedOptions?.continuityToleranceDegrees))
    ? Math.max(0, Number(resolvedOptions.continuityToleranceDegrees))
    : DEFAULT_CONTINUITY_TOLERANCE_DEGREES;

  const commonSequence = buildLegSequence(decoded.commonLegs ?? decoded.legs ?? [], {
    warnings,
    continuityToleranceDegrees,
    initialState: null
  });

  const branches = [];
  const allBboxes = [commonSequence.bbox];
  const allLineParts = getAggregatedLineParts(commonSequence.geometry);

  for (const branch of decoded.branches ?? []) {
    const builtBranch = buildLegSequence(branch.legs ?? [], {
      warnings,
      continuityToleranceDegrees,
      initialState: commonSequence.finalState
    });
    branches.push({
      id: branch.id,
      applicability: cloneApplicability(branch.applicability),
      legs: builtBranch.legs,
      geometry: builtBranch.geometry,
      bbox: builtBranch.bbox
    });
    allBboxes.push(builtBranch.bbox);
    allLineParts.push(...getAggregatedLineParts(builtBranch.geometry));
  }

  return {
    procedureId: decoded.procedureId,
    routeType: decoded.routeType,
    transitionId: decoded.transitionId,
    applicability: cloneApplicability(decoded.applicability),
    legs: commonSequence.legs,
    commonLegs: commonSequence.legs,
    branches,
    geometry: buildAggregateGeometry(allLineParts),
    bbox: mergeBboxes(allBboxes.filter(Boolean)),
    warnings,
    validation
  };
}
