import { buildProcedureAnnotationText, buildProcedureFeatureProperties } from "./procedure-style-hints.js";

function pickGeometry(leg, useLegacyGeometryFallback = true) {
  const depiction = leg?.depictionGeometry?.geometry ?? leg?.chartGeometry?.geometry ?? null;
  if (depiction) return depiction;
  if (useLegacyGeometryFallback) return leg?.legacyGeometry ?? leg?.geometry ?? null;
  return null;
}

function pickBbox(leg, useLegacyGeometryFallback = true) {
  const depictionBbox = leg?.depictionGeometry?.bbox ?? leg?.chartGeometry?.bbox ?? null;
  if (depictionBbox) return depictionBbox;
  if (useLegacyGeometryFallback) return leg?.bbox ?? null;
  return null;
}

/**
 * Build an OpenLayers-ready GeoJSON feature from a procedure leg.
 * Consumers can pass it to `ol/format/GeoJSON.readFeature`.
 *
 * @param {object} leg
 * @param {{
 *   procedureId?: string|null,
 *   routeType?: string|null,
 *   procedureType?: string|null,
 *   transitionId?: string|null,
 *   debug?: boolean,
 *   useLegacyGeometryFallback?: boolean
 * }} [options={}]
 */
export function procedureLegToOpenLayersFeature(leg, options = {}) {
  const geometry = pickGeometry(leg, options.useLegacyGeometryFallback !== false);
  if (!geometry) return null;

  const procedureResult = {
    procedureId: options.procedureId ?? null,
    routeType: options.routeType ?? options.procedureType ?? null,
    procedureType: options.procedureType ?? options.routeType ?? null,
    transitionId: options.transitionId ?? null
  };

  return {
    type: "Feature",
    id: `${procedureResult.procedureId ?? "procedure"}:leg:${leg?.branchId ?? "common"}:${leg?.index ?? "?"}`,
    geometry,
    bbox: pickBbox(leg, options.useLegacyGeometryFallback !== false) ?? undefined,
    properties: buildProcedureFeatureProperties(procedureResult, leg, options)
  };
}

function pickAnnotationGeometry(leg) {
  const annotationCoord = leg?.chartAnnotations?.annotationCoord;
  if (Array.isArray(annotationCoord) && annotationCoord.length >= 2) {
    return { type: "Point", coordinates: annotationCoord };
  }
  if (leg?.depictionClass === "open-leg") {
    const anchorCoord = leg?.chartAnnotations?.anchorCoord;
    if (Array.isArray(anchorCoord) && anchorCoord.length >= 2) {
      return { type: "Point", coordinates: anchorCoord };
    }
  }
  return null;
}

export function procedureLegToOpenLayersAnnotationFeature(leg, options = {}) {
  const geometry = pickAnnotationGeometry(leg);
  if (!geometry || !leg?.chartAnnotations) return null;

  const procedureResult = {
    procedureId: options.procedureId ?? null,
    routeType: options.routeType ?? options.procedureType ?? null,
    procedureType: options.procedureType ?? options.routeType ?? null,
    transitionId: options.transitionId ?? null
  };
  const baseProperties = buildProcedureFeatureProperties(procedureResult, leg, options);

  return {
    type: "Feature",
    id: `${procedureResult.procedureId ?? "procedure"}:annotation:${leg?.branchId ?? "common"}:${leg?.index ?? "?"}`,
    geometry,
    properties: {
      ...baseProperties,
      layer: "procedure-annotations",
      layerHint: "procedure-annotation",
      type: "procedure-annotation",
      annotationText: buildProcedureAnnotationText(leg),
      annotationRole: leg?.depictionClass === "hold" ? "hold-annotation" : "procedure-annotation"
    }
  };
}
