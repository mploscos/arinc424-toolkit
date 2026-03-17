import { decodeProcedureLegs, isSupportedPathTerminator } from "../decode/decode-legs.js";

export function validateProcedureLegSequence(input, procedureId = null) {
  const decoded = Array.isArray(input?.legs) && typeof input?.procedureId === "string"
    ? input
    : decodeProcedureLegs(input, procedureId);

  const errors = [];
  const warnings = [...(decoded.warnings ?? [])];
  let previousSeq = -Infinity;
  let hasAnchor = false;

  for (const leg of decoded.legs) {
    if (leg.seq <= previousSeq) {
      errors.push(`Leg sequence is not strictly increasing at seq=${leg.seq}`);
    }
    previousSeq = leg.seq;

    if (!isSupportedPathTerminator(leg.pathTerminator)) {
      warnings.push(`Leg ${leg.index} uses unsupported path terminator ${leg.pathTerminator || "UNKNOWN"}`);
      continue;
    }

    if (leg.pathTerminator === "IF") {
      hasAnchor = true;
      continue;
    }

    if (!hasAnchor && ["TF", "CF", "DF", "RF", "AF"].includes(leg.pathTerminator)) {
      warnings.push(`Leg ${leg.index} (${leg.pathTerminator}) has no explicit IF anchor before it; geometry will use previous fix if available`);
    }

    if (!leg.fixId) {
      errors.push(`Leg ${leg.index} (${leg.pathTerminator}) is missing fixId`);
    }

    if (["RF", "AF"].includes(leg.pathTerminator)) {
      if (!leg.centerFixId) warnings.push(`Leg ${leg.index} (${leg.pathTerminator}) is missing center fix`);
      if (!(Number(leg.radiusNm) > 0)) warnings.push(`Leg ${leg.index} (${leg.pathTerminator}) is missing radius`);
    }

    hasAnchor = hasAnchor || Boolean(leg.fixId);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}
