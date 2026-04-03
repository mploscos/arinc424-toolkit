import { bboxFromCoords } from "../../util/geo.js";
import { bearingDegrees, destinationPoint, haversineMeters } from "../../util/arc.js";

const NM_TO_M = 1852;
const DEFAULT_OPEN_LEG_DEPICTION_NM = 6;

function parseCourseDegrees(decodedLeg) {
  const raw = String(decodedLeg?.metadata?.navBlockRaw ?? "").replace(/\s+/g, "");
  const match = raw.match(/^(\d{4})/);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value < 0 || value > 3600) return null;
  return value / 10;
}

function inferCourseDegrees(anchorCoord, fixCoord) {
  if (!Array.isArray(anchorCoord) || !Array.isArray(fixCoord)) return null;
  if (haversineMeters(anchorCoord, fixCoord) < 1) return null;
  return bearingDegrees(anchorCoord, fixCoord);
}

function normalizeAltitudeRestrictions(decodedLeg) {
  if (!decodedLeg?.alt1 && !decodedLeg?.alt2) return null;
  return {
    lower: decodedLeg.alt1 || null,
    upper: decodedLeg.alt2 || null
  };
}

function parseSpeedRestriction(decodedLeg) {
  const raw = String(decodedLeg?.speed ?? "").trim();
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : raw;
}

export function buildOpenLeg(decodedLeg, startCoord) {
  const anchorCoord = startCoord ?? decodedLeg.fixCoord ?? null;
  const explicitCourse = parseCourseDegrees(decodedLeg);
  const inferredCourse = explicitCourse == null
    ? inferCourseDegrees(anchorCoord, decodedLeg.fixCoord ?? null)
    : null;
  const courseDegrees = explicitCourse ?? inferredCourse ?? null;

  if (!anchorCoord || !Number.isFinite(courseDegrees)) {
    return {
      geometry: null,
      bbox: null,
      semanticGeometry: {
        type: "open-leg-ray",
        anchorCoord: anchorCoord ?? null,
        courseDegrees,
        openEnded: true,
        semanticTerminator: decodedLeg.pathTerminator
      },
      depictionGeometry: null,
      depictionBbox: null,
      chartAnnotations: {
        openEnded: true,
        courseDegrees,
        truncationMarker: "open-end",
        anchorCoord: anchorCoord ?? null,
        altitudeRestrictions: normalizeAltitudeRestrictions(decodedLeg),
        speedRestriction: parseSpeedRestriction(decodedLeg)
      },
      metadata: {
        ...decodedLeg.metadata,
        role: "open-leg",
        geometryIntent: "open-leg",
        displayModel: "Open leg depiction requires an anchor and a course"
      },
      endCoord: decodedLeg.fixCoord ?? startCoord ?? null,
      warning: `${decodedLeg.pathTerminator} leg ${decodedLeg.index} could not emit an open-leg ray because anchor or course is unresolved`
    };
  }

  const rayEndCoord = destinationPoint(anchorCoord, courseDegrees, DEFAULT_OPEN_LEG_DEPICTION_NM * NM_TO_M);
  const geometry = {
    type: "LineString",
    coordinates: [anchorCoord, rayEndCoord]
  };
  const warnings = [];
  if (explicitCourse == null && inferredCourse != null) {
    warnings.push(`${decodedLeg.pathTerminator} leg ${decodedLeg.index} inferred open-leg course from anchor-to-fix bearing`);
  }

  return {
    geometry,
    bbox: bboxFromCoords(geometry.coordinates),
    semanticGeometry: {
      type: "open-leg-ray",
      anchorCoord,
      courseDegrees,
      rayEndCoord,
      openEnded: true,
      semanticTerminator: decodedLeg.pathTerminator
    },
    depictionGeometry: geometry,
    depictionBbox: bboxFromCoords(geometry.coordinates),
    depictionCurve: {
      type: "open-leg-ray",
      anchorCoord,
      courseDegrees,
      rayEndCoord
    },
    chartAnnotations: {
      openEnded: true,
      courseDegrees,
      truncationMarker: "open-end",
      anchorCoord,
      rayEndCoord,
      altitudeRestrictions: normalizeAltitudeRestrictions(decodedLeg),
      speedRestriction: parseSpeedRestriction(decodedLeg)
    },
    metadata: {
      ...decodedLeg.metadata,
      role: "open-leg",
      geometryIntent: "ray",
      displayModel: "Short chart ray used for open-leg depiction",
      courseDegrees
    },
    endCoord: decodedLeg.fixCoord ?? anchorCoord,
    warnings
  };
}
