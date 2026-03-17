import { buildProcedureGeometry } from "../geometry/build-procedure-geometry.js";

function toFeature(procedure, builtLeg) {
  if (!builtLeg?.geometry) return null;
  const warnings = Array.isArray(builtLeg.warnings) ? builtLeg.warnings.filter(Boolean).map(String) : [];
  return {
    type: "Feature",
    id: `${procedure.id}:leg:${builtLeg.index}`,
    geometry: builtLeg.geometry,
    bbox: builtLeg.bbox ?? undefined,
    properties: {
      id: `${procedure.id}:leg:${builtLeg.index}`,
      layer: "procedure",
      type: "procedure-leg",
      procedureId: procedure.id,
      procedureType: procedure.procedureType ?? null,
      airportId: procedure.airportId ?? null,
      runwayId: procedure.runwayId ?? null,
      transitionId: procedure.transitionId ?? null,
      legIndex: builtLeg.index,
      legType: builtLeg.metadata?.legType ?? builtLeg.pathTerminator ?? null,
      supported: Boolean(builtLeg.supported),
      warnings,
      debugProcedureLeg: true,
      ...builtLeg.metadata
    }
  };
}

export function buildProcedureLegFeatureCollection(canonicalModel, options = {}) {
  const procedures = canonicalModel?.entities?.procedures ?? [];
  const features = [];
  let processedProcedures = 0;
  let processedLegs = 0;
  let emittedFeatures = 0;

  const onProgress = typeof options?.onProgress === "function" ? options.onProgress : null;
  const progressEveryProcedures = Number.isFinite(Number(options?.progressEveryProcedures))
    ? Math.max(1, Number(options.progressEveryProcedures))
    : 1000;

  for (const procedure of procedures) {
    const built = buildProcedureGeometry(canonicalModel, procedure.id);
    processedProcedures += 1;
    processedLegs += Array.isArray(built.legs) ? built.legs.length : 0;
    for (const builtLeg of built.legs ?? []) {
      const feature = toFeature(procedure, builtLeg);
      if (feature) {
        features.push(feature);
        emittedFeatures += 1;
      }
    }
    if (onProgress && (processedProcedures === procedures.length || processedProcedures % progressEveryProcedures === 0)) {
      onProgress({
        processedProcedures,
        totalProcedures: procedures.length,
        processedLegs,
        emittedFeatures
      });
    }
  }

  return {
    type: "FeatureCollection",
    features
  };
}
