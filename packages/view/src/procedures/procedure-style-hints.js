function cloneApplicability(applicability) {
  return {
    aircraftCategories: applicability?.aircraftCategories ?? null,
    aircraftTypes: applicability?.aircraftTypes ?? null,
    operationTypes: applicability?.operationTypes ?? null
  };
}

function cloneChartAnnotations(chartAnnotations) {
  if (!chartAnnotations || typeof chartAnnotations !== "object") return null;
  return {
    ...chartAnnotations,
    annotationCoord: Array.isArray(chartAnnotations.annotationCoord)
      ? [...chartAnnotations.annotationCoord]
      : null,
    anchorCoord: Array.isArray(chartAnnotations.anchorCoord)
      ? [...chartAnnotations.anchorCoord]
      : null,
    rayEndCoord: Array.isArray(chartAnnotations.rayEndCoord)
      ? [...chartAnnotations.rayEndCoord]
      : null,
    altitudeRestrictions: chartAnnotations.altitudeRestrictions
      ? { ...chartAnnotations.altitudeRestrictions }
      : null
  };
}

export function getProcedureLayerName(leg) {
  return leg?.depictionClass === "hold" ? "holds" : "procedures";
}

export function getProcedureStyleHint(leg) {
  return leg?.depictionClass === "hold" ? "hold" : "procedure";
}

export function buildProcedureAnnotationText(leg) {
  const annotations = leg?.chartAnnotations ?? null;
  if (!annotations) return "";
  if (leg?.depictionClass === "hold") {
    const parts = [];
    if (Number.isFinite(annotations.inboundCourse)) parts.push(`${annotations.inboundCourse.toFixed(1)}deg`);
    if (annotations.turnDirection) parts.push(annotations.turnDirection);
    if (Number.isFinite(annotations.legLengthNm)) parts.push(`${annotations.legLengthNm.toFixed(1)}NM`);
    else if (Number.isFinite(annotations.legTimeMinutes)) parts.push(`${annotations.legTimeMinutes.toFixed(1)}MIN`);
    return parts.join(" ");
  }
  if (leg?.depictionClass === "open-leg" && Number.isFinite(annotations.courseDegrees)) {
    return `${annotations.courseDegrees.toFixed(1)}deg`;
  }
  return "";
}

export function buildProcedureDebugLabel(leg) {
  const parts = [String(leg?.semanticClass ?? "").trim()];
  if (leg?.branchId) parts.push(`branch:${leg.branchId}`);
  if (leg?.approximationLevel) parts.push(leg.approximationLevel);
  if (leg?.chartObjectClass) parts.push(leg.chartObjectClass);
  return parts.filter(Boolean).join(" | ");
}

export function buildProcedureFeatureProperties(procedureResult, leg, options = {}) {
  return {
    id: `${procedureResult?.procedureId ?? "procedure"}:leg:${leg?.branchId ?? "common"}:${leg?.index ?? "?"}`,
    layer: getProcedureLayerName(leg),
    layerHint: getProcedureStyleHint(leg),
    type: "procedure-leg",
    procedureId: procedureResult?.procedureId ?? null,
    procedureType: procedureResult?.routeType ?? procedureResult?.procedureType ?? null,
    routeType: procedureResult?.routeType ?? null,
    transitionId: procedureResult?.transitionId ?? null,
    branchId: leg?.branchId ?? null,
    legIndex: leg?.index ?? null,
    legType: leg?.pathTerminator ?? null,
    semanticClass: leg?.semanticClass ?? null,
    depictionClass: leg?.depictionClass ?? null,
    geometryKind: leg?.geometryKind ?? null,
    chartObjectClass: leg?.chartObjectClass ?? null,
    approximationLevel: leg?.approximationLevel ?? null,
    bounded: leg?.bounded ?? null,
    applicability: cloneApplicability(leg?.applicability),
    chartAnnotations: cloneChartAnnotations(leg?.chartAnnotations),
    debugProcedureLeg: true,
    debugLabel: options.debug ? buildProcedureDebugLabel(leg) : undefined,
    depictionCurveType: leg?.depictionGeometry?.curve?.type ?? leg?.chartGeometry?.curve?.type ?? null,
    ...leg?.metadata
  };
}
