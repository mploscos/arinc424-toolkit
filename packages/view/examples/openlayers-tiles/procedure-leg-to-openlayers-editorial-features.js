import { buildProcedureFeatureProperties } from "./procedure-style-hints.js";

function pickDepictionGeometry(leg) {
  return leg?.depictionGeometry?.geometry ?? leg?.chartGeometry?.geometry ?? null;
}

function pickLineCoordinates(leg) {
  const geometry = pickDepictionGeometry(leg);
  if (geometry?.type === "LineString") return geometry.coordinates ?? [];
  return [];
}

function pointAlongLine(coords, fraction = 0.5) {
  if (!Array.isArray(coords) || coords.length === 0) return null;
  if (coords.length === 1) return { coord: coords[0], rotationDegrees: 0 };
  const clamped = Math.max(0, Math.min(0.999, fraction));
  const index = Math.max(0, Math.min(coords.length - 2, Math.floor((coords.length - 1) * clamped)));
  const start = coords[index];
  const end = coords[index + 1];
  if (!Array.isArray(start) || !Array.isArray(end)) return null;
  const dx = Number(end[0]) - Number(start[0]);
  const dy = Number(end[1]) - Number(start[1]);
  return {
    coord: [
      Number(start[0]) + dx * 0.5,
      Number(start[1]) + dy * 0.5
    ],
    rotationDegrees: (Math.atan2(dy, dx) * 180) / Math.PI
  };
}

function normalizeAltitudeLabel(altitudeRestrictions) {
  if (!altitudeRestrictions) return "";
  const lower = String(altitudeRestrictions.lower ?? "").trim();
  const upper = String(altitudeRestrictions.upper ?? "").trim();
  if (lower && upper) return `${lower}-${upper}`;
  return lower || upper || "";
}

function buildProcedureResultMeta(options = {}) {
  return {
    procedureId: options.procedureId ?? null,
    routeType: options.routeType ?? options.procedureType ?? null,
    procedureType: options.procedureType ?? options.routeType ?? null,
    transitionId: options.transitionId ?? null
  };
}

function buildEditorialFeature(leg, procedureResult, editorialClass, geometry, extra = {}) {
  if (!geometry) return null;
  const properties = buildProcedureFeatureProperties(procedureResult, leg, {
    debug: extra.debug
  });
  return {
    type: "Feature",
    id: `${procedureResult.procedureId ?? "procedure"}:editorial:${leg?.branchId ?? "common"}:${leg?.index ?? "?"}:${editorialClass}:${extra.sequence ?? 0}`,
    geometry,
    minZoom: extra.minZoom,
    properties: {
      ...properties,
      layer: "procedure-editorial",
      layerHint: "procedure-editorial",
      type: "procedure-editorial-mark",
      editorialClass,
      editorialText: extra.editorialText ?? "",
      editorialRotationDegrees: Number.isFinite(extra.rotationDegrees) ? extra.rotationDegrees : 0,
      editorialMinZoom: Number.isFinite(extra.minZoom) ? extra.minZoom : null,
      editorialPriority: Number.isFinite(extra.priority) ? extra.priority : null,
      editorialStackIndex: Number.isFinite(extra.stackIndex) ? extra.stackIndex : 0,
      editorialGroup: extra.group ?? null,
      debugEditorial: true
    }
  };
}

function buildHoldEditorialFeatures(leg, procedureResult, options = {}) {
  const coords = pickLineCoordinates(leg);
  const annotationCoord = leg?.chartAnnotations?.annotationCoord ?? null;
  const holdFixCoord = coords[0] ?? null;
  const marks = [];

  if (holdFixCoord) {
    marks.push(buildEditorialFeature(
      leg,
      procedureResult,
      "holding-fix-marker",
      { type: "Point", coordinates: holdFixCoord },
      { minZoom: 11, priority: 126, group: "hold-fix", debug: options.debug }
    ));
  }

  for (const [sequence, fraction] of [0.18, 0.62].entries()) {
    const arrow = pointAlongLine(coords, fraction);
    if (!arrow?.coord) continue;
    marks.push(buildEditorialFeature(
      leg,
      procedureResult,
      "direction-arrow",
      { type: "Point", coordinates: arrow.coord },
      {
        sequence,
        minZoom: 12,
        priority: 122,
        rotationDegrees: arrow.rotationDegrees,
        group: "hold-turn",
        debug: options.debug
      }
    ));
  }

  if (annotationCoord) {
    if (Number.isFinite(leg?.chartAnnotations?.inboundCourse)) {
      marks.push(buildEditorialFeature(
        leg,
        procedureResult,
        "course-label",
        { type: "Point", coordinates: annotationCoord },
        {
          sequence: 0,
          minZoom: 11,
          priority: 120,
          stackIndex: 0,
          editorialText: `${leg.chartAnnotations.inboundCourse.toFixed(1)}deg`,
          group: "hold-labels",
          debug: options.debug
        }
      ));
    }
    if (Number.isFinite(leg?.chartAnnotations?.legTimeMinutes)) {
      marks.push(buildEditorialFeature(
        leg,
        procedureResult,
        "leg-time-label",
        { type: "Point", coordinates: annotationCoord },
        {
          sequence: 1,
          minZoom: 11,
          priority: 118,
          stackIndex: 1,
          editorialText: `${leg.chartAnnotations.legTimeMinutes.toFixed(1)}MIN`,
          group: "hold-labels",
          debug: options.debug
        }
      ));
    } else if (Number.isFinite(leg?.chartAnnotations?.legLengthNm)) {
      marks.push(buildEditorialFeature(
        leg,
        procedureResult,
        "leg-distance-label",
        { type: "Point", coordinates: annotationCoord },
        {
          sequence: 1,
          minZoom: 11,
          priority: 118,
          stackIndex: 1,
          editorialText: `${leg.chartAnnotations.legLengthNm.toFixed(1)}NM`,
          group: "hold-labels",
          debug: options.debug
        }
      ));
    }
    if (leg?.chartAnnotations?.speedRestriction != null) {
      marks.push(buildEditorialFeature(
        leg,
        procedureResult,
        "speed-label",
        { type: "Point", coordinates: annotationCoord },
        {
          sequence: 2,
          minZoom: 12,
          priority: 114,
          stackIndex: 2,
          editorialText: `${leg.chartAnnotations.speedRestriction}KT`,
          group: "hold-labels",
          debug: options.debug
        }
      ));
    }
    const altitudeText = normalizeAltitudeLabel(leg?.chartAnnotations?.altitudeRestrictions);
    if (altitudeText) {
      marks.push(buildEditorialFeature(
        leg,
        procedureResult,
        "altitude-label",
        { type: "Point", coordinates: annotationCoord },
        {
          sequence: 3,
          minZoom: 12,
          priority: 112,
          stackIndex: 3,
          editorialText: altitudeText,
          group: "hold-labels",
          debug: options.debug
        }
      ));
    }
  }

  return marks.filter(Boolean);
}

function buildOpenLegEditorialFeatures(leg, procedureResult, options = {}) {
  const coords = pickLineCoordinates(leg);
  const anchorCoord = leg?.chartAnnotations?.anchorCoord ?? coords[0] ?? null;
  const rayEndCoord = leg?.chartAnnotations?.rayEndCoord ?? coords[coords.length - 1] ?? null;
  const marks = [];

  const arrow = pointAlongLine(coords, 0.72);
  if (arrow?.coord) {
    marks.push(buildEditorialFeature(
      leg,
      procedureResult,
      "direction-arrow",
      { type: "Point", coordinates: arrow.coord },
      {
        minZoom: 11,
        priority: 118,
        rotationDegrees: arrow.rotationDegrees,
        group: "open-leg",
        debug: options.debug
      }
    ));
  }

  if (rayEndCoord && leg?.chartAnnotations?.truncationMarker === "open-end") {
    marks.push(buildEditorialFeature(
      leg,
      procedureResult,
      "open-end-marker",
      { type: "Point", coordinates: rayEndCoord },
      { minZoom: 11, priority: 120, group: "open-leg", debug: options.debug }
    ));
  }

  if (rayEndCoord && leg?.chartAnnotations?.truncationMarker === "intercept") {
    marks.push(buildEditorialFeature(
      leg,
      procedureResult,
      "intercept-marker",
      { type: "Point", coordinates: rayEndCoord },
      { minZoom: 11, priority: 120, group: "open-leg", debug: options.debug }
    ));
  }

  if (anchorCoord && Number.isFinite(leg?.chartAnnotations?.courseDegrees)) {
    marks.push(buildEditorialFeature(
      leg,
      procedureResult,
      "course-label",
      { type: "Point", coordinates: anchorCoord },
      {
        sequence: 0,
        minZoom: 12,
        priority: 114,
        stackIndex: 0,
        editorialText: `${leg.chartAnnotations.courseDegrees.toFixed(1)}deg`,
        group: "open-leg-labels",
        debug: options.debug
      }
    ));
  }

  if (anchorCoord && leg?.chartAnnotations?.speedRestriction != null) {
    marks.push(buildEditorialFeature(
      leg,
      procedureResult,
      "speed-label",
      { type: "Point", coordinates: anchorCoord },
      {
        sequence: 1,
        minZoom: 12,
        priority: 110,
        stackIndex: 1,
        editorialText: `${leg.chartAnnotations.speedRestriction}KT`,
        group: "open-leg-labels",
        debug: options.debug
      }
    ));
  }

  const altitudeText = normalizeAltitudeLabel(leg?.chartAnnotations?.altitudeRestrictions);
  if (anchorCoord && altitudeText) {
    marks.push(buildEditorialFeature(
      leg,
      procedureResult,
      "altitude-label",
      { type: "Point", coordinates: anchorCoord },
      {
        sequence: 2,
        minZoom: 12,
        priority: 108,
        stackIndex: 2,
        editorialText: altitudeText,
        group: "open-leg-labels",
        debug: options.debug
      }
    ));
  }

  return marks.filter(Boolean);
}

export function procedureLegToOpenLayersEditorialFeatures(leg, options = {}) {
  const procedureResult = buildProcedureResultMeta(options);
  if (leg?.depictionClass === "hold") return buildHoldEditorialFeatures(leg, procedureResult, options);
  if (leg?.depictionClass === "open-leg") return buildOpenLegEditorialFeatures(leg, procedureResult, options);
  return [];
}

function normalizeLegFromProcedureDebugFeature(feature) {
  const properties = feature?.properties ?? {};
  const geometry = feature?.geometry ?? null;
  return {
    index: properties.legIndex ?? properties.index ?? null,
    branchId: properties.branchId ?? null,
    pathTerminator: properties.legType ?? null,
    semanticClass: properties.semanticClass ?? null,
    depictionClass: properties.depictionClass ?? null,
    geometryKind: properties.geometryKind ?? null,
    chartObjectClass: properties.chartObjectClass ?? null,
    approximationLevel: properties.approximationLevel ?? null,
    bounded: properties.bounded ?? null,
    depictionGeometry: {
      depictionClass: properties.depictionClass ?? null,
      geometry,
      bbox: feature?.bbox ?? null,
      curve: null
    },
    chartGeometry: {
      depictionClass: properties.depictionClass ?? null,
      geometry,
      bbox: feature?.bbox ?? null,
      curve: null
    },
    chartAnnotations: properties.chartAnnotations ?? null,
    applicability: properties.applicability ?? null,
    metadata: {
      legType: properties.legType ?? null
    }
  };
}

export function procedureDebugFeatureToOpenLayersEditorialFeatures(feature, options = {}) {
  const leg = normalizeLegFromProcedureDebugFeature(feature);
  return procedureLegToOpenLayersEditorialFeatures(leg, {
    procedureId: feature?.properties?.procedureId ?? options.procedureId ?? null,
    routeType: feature?.properties?.routeType ?? feature?.properties?.procedureType ?? options.routeType ?? null,
    procedureType: feature?.properties?.procedureType ?? feature?.properties?.routeType ?? options.procedureType ?? null,
    transitionId: feature?.properties?.transitionId ?? options.transitionId ?? null,
    debug: options.debug
  });
}

export function buildProcedureEditorialFeatureCollectionFromProcedureLegs(featureCollection, options = {}) {
  const features = [];
  for (const feature of featureCollection?.features ?? []) {
    features.push(...procedureDebugFeatureToOpenLayersEditorialFeatures(feature, options));
  }
  return {
    type: "FeatureCollection",
    features
  };
}
