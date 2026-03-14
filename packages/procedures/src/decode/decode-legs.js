const SUPPORTED_PATH_TERMINATORS = new Set(["IF", "TF", "CF", "DF"]);

function buildFixCoordLookup(canonicalModel) {
  const map = new Map();
  for (const entityType of ["waypoints", "navaids", "airports", "runways"]) {
    for (const entity of canonicalModel?.entities?.[entityType] ?? []) {
      const coord = Array.isArray(entity?.coord) ? entity.coord : null;
      if (entity?.id && coord) map.set(entity.id, coord);
    }
  }
  return map;
}

function normalizeProcedureInput(input, procedureId = null) {
  if (input?.schema === "navdata-canonical") {
    const procedures = input.entities?.procedures ?? [];
    const procedure = procedures.find((item) => item.id === procedureId || item.procedureCode === procedureId);
    if (!procedure) {
      throw new Error(`Procedure not found: ${procedureId}`);
    }
    return { procedure, canonicalModel: input };
  }
  if (!input || input.type !== "procedure") {
    throw new Error("decodeProcedureLegs expects a canonical procedure entity or canonical model + procedure id");
  }
  return { procedure: input, canonicalModel: null };
}

export function isSupportedPathTerminator(pathTerminator) {
  return SUPPORTED_PATH_TERMINATORS.has(String(pathTerminator || "").toUpperCase());
}

export function decodeProcedureLegs(input, procedureId = null) {
  const { procedure, canonicalModel } = normalizeProcedureInput(input, procedureId);
  const fixLookup = buildFixCoordLookup(canonicalModel);
  const warnings = [];

  const legs = (procedure.legs ?? []).map((leg, index) => {
    const pathTerminator = String(leg.pathTerm || "").toUpperCase();
    const supported = isSupportedPathTerminator(pathTerminator);
    if (!supported) {
      warnings.push(`Unsupported path terminator ${pathTerminator || "UNKNOWN"} at leg ${index}`);
    }
    const fixCoord = leg.fixId ? (fixLookup.get(leg.fixId) ?? null) : null;
    return {
      index,
      seq: Number(leg.seq ?? index + 1),
      pathTerminator,
      supported,
      fixId: leg.fixId ?? null,
      fixRawId: leg.fixRawId ?? null,
      fixCoord,
      turnDir: leg.turnDir ?? null,
      alt1: leg.alt1 ?? null,
      alt2: leg.alt2 ?? null,
      speed: leg.speed ?? null,
      metadata: supported ? {} : { unsupportedReason: `Path terminator ${pathTerminator || "UNKNOWN"} is not implemented in phase 1` }
    };
  });

  return {
    procedureId: procedure.id,
    procedureType: procedure.procedureType ?? null,
    routeType: procedure.procedureType ?? null,
    transitionId: procedure.transitionId ?? null,
    airportId: procedure.airportId ?? null,
    legs,
    warnings
  };
}
