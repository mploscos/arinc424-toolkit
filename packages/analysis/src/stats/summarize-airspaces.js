function statFromNumbers(values) {
  const nums = values.filter((v) => Number.isFinite(v));
  if (!nums.length) return { count: 0, min: null, max: null, uniqueCount: 0 };
  return {
    count: nums.length,
    min: Math.min(...nums),
    max: Math.max(...nums),
    uniqueCount: new Set(nums).size
  };
}

function getSegmentCount(airspace) {
  if (Array.isArray(airspace?.segmentMetadata)) return airspace.segmentMetadata.length;
  if (Array.isArray(airspace?.reconstructionMetadata?.segmentMetadata)) {
    return airspace.reconstructionMetadata.segmentMetadata.length;
  }
  return null;
}

/**
 * Summarize airspace-specific statistics from canonical entities.
 * @param {Array<object>} airspaces
 * @returns {object}
 */
export function summarizeAirspaces(airspaces = []) {
  const byClass = {};
  const byType = {};
  const lower = [];
  const upper = [];
  const segmentCounts = [];
  let withWarnings = 0;

  for (const airspace of airspaces) {
    const cls = String(airspace?.airspaceClass || "unknown");
    const typ = String(airspace?.airspaceType || airspace?.restrictiveType || "unknown");
    byClass[cls] = (byClass[cls] ?? 0) + 1;
    byType[typ] = (byType[typ] ?? 0) + 1;

    lower.push(Number(airspace?.lowerLimitM));
    upper.push(Number(airspace?.upperLimitM));

    const segCount = getSegmentCount(airspace);
    if (Number.isFinite(segCount)) segmentCounts.push(segCount);

    const warnings = [
      ...(Array.isArray(airspace?.validationWarnings) ? airspace.validationWarnings : []),
      ...(Array.isArray(airspace?.reconstructionWarnings) ? airspace.reconstructionWarnings : [])
    ];
    if (warnings.length) withWarnings += 1;
  }

  const sortedByClass = Object.fromEntries(Object.entries(byClass).sort(([a], [b]) => a.localeCompare(b)));
  const sortedByType = Object.fromEntries(Object.entries(byType).sort(([a], [b]) => a.localeCompare(b)));

  return {
    total: airspaces.length,
    byClass: sortedByClass,
    byType: sortedByType,
    lowerLimitM: statFromNumbers(lower),
    upperLimitM: statFromNumbers(upper),
    segmentCount: statFromNumbers(segmentCounts),
    withWarnings
  };
}
