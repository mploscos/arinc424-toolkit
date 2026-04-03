function normalizeStringList(value) {
  if (value == null) return null;
  const items = (Array.isArray(value) ? value : [value])
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
  return items.length > 0 ? [...new Set(items)] : null;
}

function normalizeCategory(value) {
  const text = String(value ?? "").trim().toUpperCase();
  return ["A", "B", "C", "D", "E"].includes(text) ? text : null;
}

function matchesAircraftCategory(leg, aircraftCategory) {
  const normalized = normalizeCategory(aircraftCategory);
  if (!normalized) return true;
  const categories = leg?.applicability?.aircraftCategories ?? null;
  return !Array.isArray(categories) || categories.length === 0 || categories.includes(normalized);
}

function matchesBranchId(leg, branchIds) {
  const normalized = normalizeStringList(branchIds);
  if (!normalized) return true;
  return leg?.branchId == null || normalized.includes(String(leg.branchId));
}

function matchesSemanticClass(leg, semanticClasses) {
  const normalized = normalizeStringList(semanticClasses);
  if (!normalized) return true;
  return normalized.includes(String(leg?.semanticClass ?? "").trim());
}

function matchesDepictionClass(leg, depictionClasses) {
  const normalized = normalizeStringList(depictionClasses);
  if (!normalized) return true;
  return normalized.includes(String(leg?.depictionClass ?? "").trim());
}

function iterProcedureLegs(procedureResult, includeBranches = true) {
  const out = [...(procedureResult?.commonLegs ?? procedureResult?.legs ?? [])];
  if (!includeBranches) return out;
  for (const branch of procedureResult?.branches ?? []) {
    out.push(...(branch.legs ?? []));
  }
  return out;
}

/**
 * Filter normalized procedure legs by applicability and rendering semantics.
 *
 * @param {object} procedureResult
 * @param {{
 *   aircraftCategory?: string|null,
 *   includeBranches?: boolean,
 *   branchIds?: string[]|string|null,
 *   semanticClasses?: string[]|string|null,
 *   depictionClasses?: string[]|string|null
 * }} [options={}]
 */
export function filterProcedureLegs(procedureResult, options = {}) {
  const includeBranches = options.includeBranches !== false;
  return iterProcedureLegs(procedureResult, includeBranches).filter((leg) => (
    matchesAircraftCategory(leg, options.aircraftCategory)
    && matchesBranchId(leg, options.branchIds)
    && matchesSemanticClass(leg, options.semanticClasses)
    && matchesDepictionClass(leg, options.depictionClasses)
  ));
}
