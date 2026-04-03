import {
  geometryTypeFromGeometry,
  getDefaultLayerDescriptor,
  listDefaultLayerDescriptors
} from "./cartography-layer-descriptors.js";
import { buildLabelCandidates } from "./cartography-label-candidates.js";
import { buildProcedureRenderLayers } from "./procedure-build-procedure-render-layers.js";

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

function collectBoundsFromGeometry(geometry) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  function walk(coords) {
    if (!Array.isArray(coords)) return;
    if (typeof coords[0] === "number" && typeof coords[1] === "number") {
      const x = Number(coords[0]);
      const y = Number(coords[1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      return;
    }
    for (const child of coords) walk(child);
  }

  walk(geometry?.coordinates);
  if (!Number.isFinite(minX)) return null;
  return [minX, minY, maxX, maxY];
}

function normalizeFeatureBounds(feature) {
  if (Array.isArray(feature?.bbox) && feature.bbox.length === 4 && feature.bbox.every(Number.isFinite)) {
    return [...feature.bbox];
  }
  return collectBoundsFromGeometry(feature?.geometry);
}

function normalizeLayerName(layerName) {
  const key = String(layerName || "").toLowerCase();
  if (key === "procedure") return "procedures";
  if (key === "hold") return "holds";
  return key;
}

function collectProcedureFeatures(featureModel) {
  const procedureResults = [
    ...(Array.isArray(featureModel?.procedureResults) ? featureModel.procedureResults : []),
    ...(Array.isArray(featureModel?.procedures) ? featureModel.procedures : [])
  ];
  if (procedureResults.length === 0) return [];
  const renderOptions = featureModel?.procedureRenderOptions ?? {};
  const features = [];
  for (const procedureResult of procedureResults) {
    const renderModel = buildProcedureRenderLayers(procedureResult, renderOptions);
    features.push(...(renderModel.allFeatures ?? [...renderModel.features, ...(renderModel.annotationFeatures ?? [])]));
  }
  return features;
}

export function buildCartography(featureModel, seed = {}) {
  const features = [
    ...(Array.isArray(featureModel?.features) ? featureModel.features : []),
    ...collectProcedureFeatures(featureModel)
  ];
  const layerMap = new Map();
  const seedLayers = Array.isArray(seed.layers) ? seed.layers : [];

  for (const layerName of seedLayers) {
    const descriptor = getDefaultLayerDescriptor(layerName);
    layerMap.set(descriptor.name, {
      ...descriptor,
      bounds: null,
      featureCount: 0,
      minZoom: descriptor.minZoom,
      maxZoom: descriptor.maxZoom,
      availableMinZoom: Number.isFinite(seed.minZoom) ? seed.minZoom : null,
      availableMaxZoom: Number.isFinite(seed.maxZoom) ? seed.maxZoom : null,
      depictionClasses: new Set(),
      semanticClasses: new Set(),
      branchIds: new Set(),
      chartObjectClasses: new Set()
    });
  }

  let globalBounds = Array.isArray(seed.bounds) && seed.bounds.length === 4 ? [...seed.bounds] : null;

  for (const feature of features) {
    const layerName = normalizeLayerName(feature?.layer ?? feature?.properties?.layer);
    const descriptor = layerMap.get(layerName) || (() => {
      const def = getDefaultLayerDescriptor(layerName);
      const fresh = {
        ...def,
        bounds: null,
        featureCount: 0,
        depictionClasses: new Set(),
        semanticClasses: new Set(),
        branchIds: new Set(),
        chartObjectClasses: new Set()
      };
      layerMap.set(layerName, fresh);
      return fresh;
    })();

    descriptor.featureCount += 1;
    const featureGeomType = geometryTypeFromGeometry(feature.geometry);
    if (descriptor.geometryType === "mixed") descriptor.geometryType = featureGeomType;
    else if (descriptor.geometryType !== featureGeomType) descriptor.geometryType = "mixed";

    const props = feature?.properties ?? {};
    if (props.depictionClass) descriptor.depictionClasses.add(props.depictionClass);
    if (props.semanticClass) descriptor.semanticClasses.add(props.semanticClass);
    if (props.branchId) descriptor.branchIds.add(props.branchId);
    if (props.chartObjectClass) descriptor.chartObjectClasses.add(props.chartObjectClass);

    const fBounds = normalizeFeatureBounds(feature);
    descriptor.bounds = mergeBounds(descriptor.bounds, fBounds);
    globalBounds = mergeBounds(globalBounds, fBounds);

    if (Number.isFinite(feature?.minZoom)) {
      descriptor.minZoom = Number.isFinite(descriptor.minZoom)
        ? Math.min(descriptor.minZoom, feature.minZoom)
        : feature.minZoom;
    }
    if (Number.isFinite(feature?.maxZoom)) {
      descriptor.maxZoom = Number.isFinite(descriptor.maxZoom)
        ? Math.max(descriptor.maxZoom, feature.maxZoom)
        : feature.maxZoom;
    }
  }

  const layers = [...layerMap.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((layer) => ({
      name: layer.name,
      geometryType: layer.geometryType,
      bounds: layer.bounds,
      featureCount: layer.featureCount,
      minZoom: Number.isFinite(layer.minZoom) ? layer.minZoom : 4,
      maxZoom: Number.isFinite(layer.maxZoom) ? layer.maxZoom : 14,
      availableMinZoom: Number.isFinite(layer.availableMinZoom) ? layer.availableMinZoom : null,
      availableMaxZoom: Number.isFinite(layer.availableMaxZoom) ? layer.availableMaxZoom : null,
      styleHint: layer.styleHint,
      label: layer.label,
      depictionClasses: [...layer.depictionClasses].sort(),
      semanticClasses: [...layer.semanticClasses].sort(),
      branchIds: [...layer.branchIds].sort(),
      chartObjectClasses: [...layer.chartObjectClasses].sort(),
      simplifyHint: {
        4: 0.1,
        6: 0.01,
        8: 0.001
      }
    }));

  if (layers.length === 0 && seedLayers.length === 0) {
    for (const descriptor of listDefaultLayerDescriptors()) {
      layers.push({
        ...descriptor,
        bounds: null,
        featureCount: 0,
        depictionClasses: [],
        semanticClasses: [],
        branchIds: [],
        chartObjectClasses: [],
        simplifyHint: { 4: 0.1, 6: 0.01, 8: 0.001 }
      });
    }
  }

  return {
    layers,
    labelCandidates: buildLabelCandidates(features, new Map(layers.map((l) => [l.name, l]))),
    bounds: globalBounds
  };
}

export {
  getDefaultLayerDescriptor,
  listDefaultLayerDescriptors,
  geometryTypeFromGeometry
} from "./cartography-layer-descriptors.js";
