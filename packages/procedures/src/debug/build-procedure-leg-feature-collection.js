import { buildProcedureGeometry } from "../geometry/build-procedure-geometry.js";

function toFeature(procedure, builtLeg) {
  const geometry = builtLeg?.depictionGeometry?.geometry ?? builtLeg?.chartGeometry?.geometry ?? builtLeg?.geometry ?? null;
  if (!geometry) return null;
  const warnings = Array.isArray(builtLeg.warnings) ? builtLeg.warnings.filter(Boolean).map(String) : [];
  const layer = builtLeg?.depictionClass === "hold" ? "hold" : "procedure";
  return {
    type: "Feature",
    id: `${procedure.id}:leg:${builtLeg.branchId ?? "common"}:${builtLeg.index}`,
    geometry,
    bbox: builtLeg?.depictionGeometry?.bbox ?? builtLeg?.chartGeometry?.bbox ?? builtLeg?.bbox ?? undefined,
    properties: {
      id: `${procedure.id}:leg:${builtLeg.branchId ?? "common"}:${builtLeg.index}`,
      layer,
      type: "procedure-leg",
      procedureId: procedure.id,
      procedureType: procedure.procedureType ?? null,
      airportId: procedure.airportId ?? null,
      runwayId: procedure.runwayId ?? null,
      transitionId: procedure.transitionId ?? null,
      branchId: builtLeg.branchId ?? null,
      legIndex: builtLeg.index,
      legType: builtLeg.metadata?.legType ?? builtLeg.pathTerminator ?? null,
      semanticClass: builtLeg.semanticClass ?? null,
      depictionClass: builtLeg.depictionClass ?? null,
      geometryKind: builtLeg.geometryKind ?? null,
      chartObjectClass: builtLeg.chartObjectClass ?? null,
      renderClass: builtLeg.renderClass ?? null,
      approximationLevel: builtLeg.approximationLevel ?? null,
      bounded: builtLeg.bounded ?? null,
      applicability: builtLeg.applicability ?? null,
      chartAnnotations: builtLeg.chartAnnotations ?? null,
      supported: Boolean(builtLeg.supported),
      warnings,
      debugProcedureLeg: true,
      ...builtLeg.metadata
    }
  };
}

function iterProcedureLegs(built) {
  const items = [...(built.commonLegs ?? built.legs ?? [])];
  for (const branch of built.branches ?? []) {
    items.push(...(branch.legs ?? []));
  }
  return items;
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
    const procedureLegs = iterProcedureLegs(built);
    processedLegs += procedureLegs.length;
    for (const builtLeg of procedureLegs) {
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
