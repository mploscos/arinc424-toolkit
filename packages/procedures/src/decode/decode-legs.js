const SUPPORTED_PATH_TERMINATORS = new Set([
  "IF",
  "TF",
  "CF",
  "DF",
  "RF",
  "AF",
  "CA",
  "FA",
  "VA",
  "VI",
  "VM",
  "FM",
  "HA",
  "HF",
  "HM"
]);

function parseSuppressedNmThousandths(raw) {
  const text = String(raw ?? "").trim();
  if (!/^\d+$/.test(text)) return null;
  return Number(text) / 1000;
}

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

function hasOwn(object, key) {
  return Boolean(object) && Object.prototype.hasOwnProperty.call(object, key);
}

function normalizeStringList(value) {
  if (value == null) return null;
  const rawItems = Array.isArray(value) ? value : [value];
  const items = rawItems
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
  return items.length > 0 ? [...new Set(items)] : null;
}

function normalizeAircraftCategories(value) {
  const items = normalizeStringList(value);
  if (!items) return null;
  const categories = items
    .map((item) => item.toUpperCase())
    .filter((item) => ["A", "B", "C", "D", "E"].includes(item));
  return categories.length > 0 ? [...new Set(categories)] : null;
}

function extractApplicabilitySpec(source) {
  if (!source || typeof source !== "object") return null;
  const nested = source.applicability && typeof source.applicability === "object"
    ? source.applicability
    : null;
  const container = nested ?? source;
  const hasApplicability = ["aircraftCategories", "aircraftTypes", "operationTypes"].some((key) => hasOwn(container, key));
  if (!hasApplicability) return null;
  return {
    aircraftCategories: hasOwn(container, "aircraftCategories")
      ? normalizeAircraftCategories(container.aircraftCategories)
      : undefined,
    aircraftTypes: hasOwn(container, "aircraftTypes")
      ? normalizeStringList(container.aircraftTypes)
      : undefined,
    operationTypes: hasOwn(container, "operationTypes")
      ? normalizeStringList(container.operationTypes)
      : undefined
  };
}

function mergeApplicability(base, override) {
  return {
    aircraftCategories: override?.aircraftCategories !== undefined
      ? override.aircraftCategories
      : (base?.aircraftCategories ?? null),
    aircraftTypes: override?.aircraftTypes !== undefined
      ? override.aircraftTypes
      : (base?.aircraftTypes ?? null),
    operationTypes: override?.operationTypes !== undefined
      ? override.operationTypes
      : (base?.operationTypes ?? null)
  };
}

function buildMetadata(leg, supported, pathTerminator) {
  if (!supported) {
    return {
      unsupportedReason: `Path terminator ${pathTerminator || "UNKNOWN"} is not implemented in current phase`
    };
  }

  return {
    ...(leg.centerSection ? { centerSection: leg.centerSection } : {}),
    ...(leg.navBlockRaw ? { navBlockRaw: leg.navBlockRaw } : {}),
    ...(leg.auxRefBlockRaw ? { auxRefBlockRaw: leg.auxRefBlockRaw } : {}),
    ...(leg.legCodeRaw ? { legCodeRaw: leg.legCodeRaw } : {})
  };
}

function decodeLegList(legs, context) {
  return (legs ?? []).map((leg, index) => {
    const pathTerminator = String(leg.pathTerm || "").toUpperCase();
    const supported = isSupportedPathTerminator(pathTerminator);
    if (!supported) {
      context.warnings.push(`Unsupported path terminator ${pathTerminator || "UNKNOWN"} at leg ${index}`);
    }
    const fixCoord = leg.fixId ? (context.fixLookup.get(leg.fixId) ?? null) : null;
    const centerCoord = leg.centerFixId ? (context.fixLookup.get(leg.centerFixId) ?? null) : null;
    const applicability = mergeApplicability(
      context.baseApplicability,
      extractApplicabilitySpec(leg)
    );

    return {
      index,
      seq: Number(leg.seq ?? index + 1),
      pathTerminator,
      supported,
      branchId: context.branchId ?? null,
      applicability,
      fixId: leg.fixId ?? null,
      fixRawId: leg.fixRawId ?? null,
      fixCoord,
      centerFixId: leg.centerFixId ?? null,
      centerFixRawId: leg.centerFixRawId ?? null,
      centerCoord,
      arcRadiusRaw: leg.arcRadiusRaw ?? null,
      radiusNm: Number.isFinite(Number(leg.arcRadiusNm))
        ? Number(leg.arcRadiusNm)
        : parseSuppressedNmThousandths(leg.arcRadiusRaw),
      turnDir: leg.turnDir ?? null,
      alt1: leg.alt1 ?? null,
      alt2: leg.alt2 ?? null,
      speed: leg.speed ?? null,
      metadata: buildMetadata(leg, supported, pathTerminator)
    };
  });
}

export function isSupportedPathTerminator(pathTerminator) {
  return SUPPORTED_PATH_TERMINATORS.has(String(pathTerminator || "").toUpperCase());
}

/**
 * Decode procedure legs into a richer normalized model with optional shared legs and branches.
 *
 * @param {object} input
 * @param {string|null} [procedureId=null]
 */
export function decodeProcedureLegs(input, procedureId = null) {
  const { procedure, canonicalModel } = normalizeProcedureInput(input, procedureId);
  const fixLookup = buildFixCoordLookup(canonicalModel);
  const warnings = [];
  const procedureApplicability = mergeApplicability(null, extractApplicabilitySpec(procedure));
  const commonLegSource = Array.isArray(procedure.commonLegs) ? procedure.commonLegs : (procedure.legs ?? []);
  const commonLegs = decodeLegList(commonLegSource, {
    warnings,
    fixLookup,
    branchId: null,
    baseApplicability: procedureApplicability
  });

  const branches = (procedure.branches ?? []).map((branch, index) => {
    const branchId = String(branch?.id ?? `branch:${index + 1}`);
    const branchApplicability = mergeApplicability(
      procedureApplicability,
      extractApplicabilitySpec(branch)
    );
    return {
      id: branchId,
      applicability: branchApplicability,
      legs: decodeLegList(branch?.legs ?? [], {
        warnings,
        fixLookup,
        branchId,
        baseApplicability: branchApplicability
      })
    };
  });

  return {
    procedureId: procedure.id,
    procedureType: procedure.procedureType ?? null,
    routeType: procedure.procedureType ?? null,
    transitionId: procedure.transitionId ?? null,
    airportId: procedure.airportId ?? null,
    applicability: procedureApplicability,
    commonLegs,
    branches,
    legs: commonLegs,
    warnings
  };
}
