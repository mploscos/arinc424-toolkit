import { filterProcedureLegs } from "./filter-procedure-legs.js";
import {
  procedureLegToOpenLayersAnnotationFeature,
  procedureLegToOpenLayersFeature
} from "./procedure-leg-to-openlayers-feature.js";
import { procedureLegToOpenLayersEditorialFeatures } from "./procedure-leg-to-openlayers-editorial-features.js";

function mergeBounds(a, b) {
  if (!a) return b ? [...b] : null;
  if (!b) return [...a];
  return [
    Math.min(a[0], b[0]),
    Math.min(a[1], b[1]),
    Math.max(a[2], b[2]),
    Math.max(a[3], b[3])
  ];
}

/**
 * Build a render-oriented model from a normalized procedure result.
 *
 * @param {object} procedureResult
 * @param {{
 *   aircraftCategory?: string|null,
 *   includeBranches?: boolean,
 *   branchIds?: string[]|string|null,
 *   semanticClasses?: string[]|string|null,
 *   depictionClasses?: string[]|string|null,
 *   debug?: boolean,
 *   useLegacyGeometryFallback?: boolean
 * }} [options={}]
 */
export function buildProcedureRenderModel(procedureResult, options = {}) {
  const legs = filterProcedureLegs(procedureResult, options);
  const features = [];
  const annotationFeatures = [];
  const editorialFeatures = [];
  let bounds = null;

  for (const leg of legs) {
    const feature = procedureLegToOpenLayersFeature(leg, {
      procedureId: procedureResult?.procedureId ?? null,
      routeType: procedureResult?.routeType ?? procedureResult?.procedureType ?? null,
      procedureType: procedureResult?.procedureType ?? procedureResult?.routeType ?? null,
      transitionId: procedureResult?.transitionId ?? null,
      debug: options.debug,
      useLegacyGeometryFallback: options.useLegacyGeometryFallback
    });
    if (!feature) continue;
    features.push(feature);
    if (Array.isArray(feature.bbox) && feature.bbox.length === 4) {
      bounds = mergeBounds(bounds, feature.bbox);
    }

    const annotationFeature = procedureLegToOpenLayersAnnotationFeature(leg, {
      procedureId: procedureResult?.procedureId ?? null,
      routeType: procedureResult?.routeType ?? procedureResult?.procedureType ?? null,
      procedureType: procedureResult?.procedureType ?? procedureResult?.routeType ?? null,
      transitionId: procedureResult?.transitionId ?? null,
      debug: options.debug
    });
    if (annotationFeature) {
      annotationFeatures.push(annotationFeature);
      if (Array.isArray(annotationFeature.bbox) && annotationFeature.bbox.length === 4) {
        bounds = mergeBounds(bounds, annotationFeature.bbox);
      }
    }

    const derivedEditorialFeatures = procedureLegToOpenLayersEditorialFeatures(leg, {
      procedureId: procedureResult?.procedureId ?? null,
      routeType: procedureResult?.routeType ?? procedureResult?.procedureType ?? null,
      procedureType: procedureResult?.procedureType ?? procedureResult?.routeType ?? null,
      transitionId: procedureResult?.transitionId ?? null,
      debug: options.debug
    });
    for (const editorialFeature of derivedEditorialFeatures) {
      editorialFeatures.push(editorialFeature);
      if (Array.isArray(editorialFeature.bbox) && editorialFeature.bbox.length === 4) {
        bounds = mergeBounds(bounds, editorialFeature.bbox);
      }
    }
  }

  return {
    procedureId: procedureResult?.procedureId ?? null,
    routeType: procedureResult?.routeType ?? procedureResult?.procedureType ?? null,
    transitionId: procedureResult?.transitionId ?? null,
    features,
    annotationFeatures,
    editorialFeatures,
    allFeatures: [...features, ...annotationFeatures, ...editorialFeatures],
    bounds
  };
}

export function buildProcedureRenderLayers(procedureResult, options = {}) {
  const renderModel = buildProcedureRenderModel(procedureResult, options);
  const layers = new Map();

  for (const feature of renderModel.allFeatures ?? renderModel.features) {
    const layerName = String(feature?.properties?.layer ?? "procedures");
    if (!layers.has(layerName)) {
      layers.set(layerName, {
        name: layerName,
        styleHint: String(
          feature?.properties?.layerHint
          ?? (
            layerName === "holds"
              ? "hold"
              : (layerName === "procedure-annotations"
                ? "procedure-annotation"
                : (layerName === "procedure-editorial" ? "procedure-editorial" : "procedure"))
          )
        ),
        featureCount: 0,
        depictionClasses: new Set(),
        semanticClasses: new Set(),
        chartObjectClasses: new Set()
      });
    }
    const layer = layers.get(layerName);
    layer.featureCount += 1;
    if (feature?.properties?.depictionClass) layer.depictionClasses.add(feature.properties.depictionClass);
    if (feature?.properties?.semanticClass) layer.semanticClasses.add(feature.properties.semanticClass);
    if (feature?.properties?.chartObjectClass) layer.chartObjectClasses.add(feature.properties.chartObjectClass);
  }

  return {
    ...renderModel,
    layers: [...layers.values()].map((layer) => ({
      ...layer,
      depictionClasses: [...layer.depictionClasses].sort(),
      semanticClasses: [...layer.semanticClasses].sort(),
      chartObjectClasses: [...layer.chartObjectClasses].sort()
    }))
  };
}
