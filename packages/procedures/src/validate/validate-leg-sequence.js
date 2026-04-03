import { decodeProcedureLegs, isSupportedPathTerminator } from "../decode/decode-legs.js";

const ANCHORED_TERMINATORS = new Set(["TF", "CF", "DF", "RF", "AF", "CA", "FA", "VA", "VI", "VM", "FM"]);
const FIX_REQUIRED_TERMINATORS = new Set(["IF", "TF", "CF", "DF", "RF", "AF", "HA", "HF", "HM"]);

function getLegGroups(decoded) {
  if (Array.isArray(decoded?.commonLegs) || Array.isArray(decoded?.branches)) {
    const groups = [{
      label: "common",
      prefix: "",
      legs: decoded.commonLegs ?? decoded.legs ?? []
    }];
    for (const branch of decoded.branches ?? []) {
      groups.push({
        label: `branch ${branch.id}`,
        prefix: `Branch ${branch.id}: `,
        legs: branch.legs ?? []
      });
    }
    return groups;
  }

  return [{
    label: "procedure",
    prefix: "",
    legs: decoded.legs ?? []
  }];
}

function validateLegGroup(legs, prefix, options = {}) {
  const errors = [];
  const warnings = [];
  let previousSeq = -Infinity;
  let hasAnchor = Boolean(options?.initialHasAnchor);

  for (const leg of legs) {
    if (leg.seq <= previousSeq) {
      errors.push(`${prefix}Leg sequence is not strictly increasing at seq=${leg.seq}`);
    }
    previousSeq = leg.seq;

    if (!isSupportedPathTerminator(leg.pathTerminator)) {
      warnings.push(`${prefix}Leg ${leg.index} uses unsupported path terminator ${leg.pathTerminator || "UNKNOWN"}`);
      continue;
    }

    if (leg.pathTerminator === "IF") {
      hasAnchor = true;
      continue;
    }

    if (!hasAnchor && ANCHORED_TERMINATORS.has(leg.pathTerminator)) {
      warnings.push(
        `${prefix}Leg ${leg.index} (${leg.pathTerminator}) has no explicit IF anchor before it; `
        + "geometry will use previous fix if available"
      );
    }

    if (FIX_REQUIRED_TERMINATORS.has(leg.pathTerminator) && !leg.fixId) {
      errors.push(`${prefix}Leg ${leg.index} (${leg.pathTerminator}) is missing fixId`);
    }

    if (["RF", "AF"].includes(leg.pathTerminator)) {
      if (!leg.centerFixId) warnings.push(`${prefix}Leg ${leg.index} (${leg.pathTerminator}) is missing center fix`);
      if (!(Number(leg.radiusNm) > 0)) warnings.push(`${prefix}Leg ${leg.index} (${leg.pathTerminator}) is missing radius`);
    }

    if (["CA", "FA", "VA", "VI", "VM", "FM"].includes(leg.pathTerminator) && !leg.metadata?.navBlockRaw) {
      warnings.push(
        `${prefix}Leg ${leg.index} (${leg.pathTerminator}) has no nav/course block; open-leg depiction may be omitted`
      );
    }

    if (["HA", "HF", "HM"].includes(leg.pathTerminator) && !leg.metadata?.navBlockRaw) {
      warnings.push(
        `${prefix}Leg ${leg.index} (${leg.pathTerminator}) has no hold nav block; inbound course may fall back to anchor bearing`
      );
    }

    hasAnchor = hasAnchor || Boolean(leg.fixId);
  }

  return {
    errors,
    warnings,
    hasAnchor
  };
}

export function validateProcedureLegSequence(input, procedureId = null) {
  const decoded = (typeof input?.procedureId === "string" && (Array.isArray(input?.legs) || Array.isArray(input?.commonLegs)))
    ? input
    : decodeProcedureLegs(input, procedureId);

  const errors = [];
  const warnings = [...(decoded.warnings ?? [])];
  const groups = getLegGroups(decoded);
  const commonResult = validateLegGroup(groups[0]?.legs ?? [], groups[0]?.prefix ?? "");
  errors.push(...commonResult.errors);
  warnings.push(...commonResult.warnings);

  for (const group of groups.slice(1)) {
    const result = validateLegGroup(group.legs, group.prefix, { initialHasAnchor: commonResult.hasAnchor });
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}
