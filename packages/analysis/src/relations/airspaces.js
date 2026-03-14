function intersects(a, b) {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

function bboxOfCoordinates(coords) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of coords ?? []) {
    if (!Array.isArray(p) || p.length < 2) continue;
    const [x, y] = p;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return Number.isFinite(minX) ? [minX, minY, maxX, maxY] : null;
}

/**
 * Build airspace relation helpers, including optional nearby entities by bbox.
 * @param {object} canonicalModel
 * @returns {Map<string, object>}
 */
export function buildAirspaceRelations(canonicalModel) {
  const out = new Map();

  const candidates = [
    ...(canonicalModel.entities.airports ?? []),
    ...(canonicalModel.entities.heliports ?? []),
    ...(canonicalModel.entities.runways ?? []),
    ...(canonicalModel.entities.waypoints ?? []),
    ...(canonicalModel.entities.navaids ?? [])
  ];

  const candidateBboxes = candidates
    .map((entity) => {
      const bbox = Array.isArray(entity.bbox)
        ? entity.bbox
        : (Array.isArray(entity.coord) ? [entity.coord[0], entity.coord[1], entity.coord[0], entity.coord[1]] : null);
      if (!bbox) return null;
      return { id: entity.id, type: entity.type, bbox };
    })
    .filter(Boolean);

  for (const airspace of canonicalModel.entities.airspaces ?? []) {
    const bbox = Array.isArray(airspace.bbox) ? airspace.bbox : bboxOfCoordinates(airspace.coordinates);
    const nearby = bbox
      ? candidateBboxes
        .filter((c) => intersects(c.bbox, bbox))
        .map((c) => ({ id: c.id, type: c.type }))
        .sort((a, b) => a.id.localeCompare(b.id))
      : [];

    out.set(airspace.id, {
      airspaceId: airspace.id,
      airspaceClass: airspace.airspaceClass ?? null,
      airspaceType: airspace.airspaceType ?? null,
      restrictiveType: airspace.restrictiveType ?? null,
      sourceRefCount: (airspace.sourceRefs ?? []).length,
      segmentMetadata: airspace.segmentMetadata
        ?? airspace.geometryDebug?.segmentMetadata
        ?? airspace.reconstructionMetadata?.segmentMetadata
        ?? [],
      nearbyEntityRefs: nearby
    });
  }

  return out;
}
