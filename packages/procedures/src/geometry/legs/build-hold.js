import { bboxFromCoords } from "../../util/geo.js";
import { bearingDegrees, buildArcFromCenter, destinationPoint, haversineMeters } from "../../util/arc.js";

const NM_TO_M = 1852;
const DEFAULT_HOLD_LEG_LENGTH_NM = 4;
const DEFAULT_HOLD_TURN_RADIUS_NM = 0.9;

function normalizeTurnDirection(turnDir) {
  const normalized = String(turnDir ?? "").trim().toUpperCase();
  return normalized === "L" || normalized === "R" ? normalized : "R";
}

function parseInboundCourse(decodedLeg, startCoord) {
  const raw = String(decodedLeg?.metadata?.navBlockRaw ?? "").replace(/\s+/g, "");
  const match = raw.match(/^(\d{4})/);
  if (match) {
    const value = Number(match[1]);
    if (Number.isFinite(value) && value >= 0 && value <= 3600) return value / 10;
  }

  if (Array.isArray(startCoord) && Array.isArray(decodedLeg?.fixCoord) && haversineMeters(startCoord, decodedLeg.fixCoord) >= 1) {
    return bearingDegrees(startCoord, decodedLeg.fixCoord);
  }

  return null;
}

function parseHoldLegLength(decodedLeg) {
  const raw = String(decodedLeg?.metadata?.navBlockRaw ?? "").replace(/\s+/g, "");
  const digits = raw.slice(4).replace(/\D/g, "");
  if (digits.length < 3) return null;
  const value = Number(digits);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value / 10;
}

function parseHoldLegTime(decodedLeg) {
  const raw = String(decodedLeg?.metadata?.legCodeRaw ?? "").replace(/\s+/g, "");
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 2) return null;
  const value = Number(digits);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value / 10;
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

function buildHoldRole(pathTerminator) {
  if (pathTerminator === "HA") return "hold-to-altitude";
  if (pathTerminator === "HF") return "hold-to-fix";
  if (pathTerminator === "HM") return "hold-to-manual";
  return "hold";
}

function buildHoldDepiction(decodedLeg, fixCoord, inboundCourse, turnDirection, legLengthNm) {
  const turnRadiusNm = Math.max(
    0.6,
    Math.min(DEFAULT_HOLD_TURN_RADIUS_NM, legLengthNm / 3)
  );
  const sideBearing = inboundCourse + (turnDirection === "R" ? 90 : -90);
  const outboundCourse = inboundCourse + 180;

  const outboundStart = destinationPoint(fixCoord, sideBearing, turnRadiusNm * 2 * NM_TO_M);
  const inboundStart = destinationPoint(fixCoord, outboundCourse, legLengthNm * NM_TO_M);
  const outboundEnd = destinationPoint(outboundStart, outboundCourse, legLengthNm * NM_TO_M);
  const firstTurnCenter = destinationPoint(fixCoord, sideBearing, turnRadiusNm * NM_TO_M);
  const secondTurnCenter = destinationPoint(inboundStart, sideBearing, turnRadiusNm * NM_TO_M);

  const firstTurn = buildArcFromCenter(fixCoord, outboundStart, firstTurnCenter, turnDirection, {
    radiusNm: turnRadiusNm,
    maxStepDeg: 12
  });
  const secondTurn = buildArcFromCenter(outboundEnd, inboundStart, secondTurnCenter, turnDirection, {
    radiusNm: turnRadiusNm,
    maxStepDeg: 12
  });

  const points = [
    fixCoord,
    ...firstTurn.points.slice(1),
    outboundEnd,
    ...secondTurn.points.slice(1),
    fixCoord
  ];

  return {
    geometry: { type: "LineString", coordinates: points },
    bbox: bboxFromCoords(points),
    curve: {
      type: "hold-racetrack",
      anchorFixCoord: fixCoord,
      inboundCourse,
      outboundCourse,
      turnDirection,
      legLengthNm,
      turnRadiusNm,
      outboundStart,
      outboundEnd,
      inboundStart
    },
    annotationCoord: destinationPoint(
      fixCoord,
      sideBearing,
      Math.max(turnRadiusNm * 2.2, 1.5) * NM_TO_M
    )
  };
}

export function buildHoldLeg(decodedLeg, startCoord) {
  const fixCoord = decodedLeg.fixCoord ?? startCoord ?? null;
  const inboundCourse = parseInboundCourse(decodedLeg, startCoord);
  const turnDirection = normalizeTurnDirection(decodedLeg.turnDir);
  const legLengthNm = parseHoldLegLength(decodedLeg) ?? DEFAULT_HOLD_LEG_LENGTH_NM;
  const legTimeMinutes = parseHoldLegTime(decodedLeg);
  const altitudeRestrictions = normalizeAltitudeRestrictions(decodedLeg);
  const speedRestriction = parseSpeedRestriction(decodedLeg);

  if (!fixCoord || !Number.isFinite(inboundCourse)) {
    return {
      geometry: null,
      bbox: null,
      semanticGeometry: {
        type: "hold-pattern",
        anchorFixCoord: fixCoord ?? null,
        inboundCourse: inboundCourse ?? null,
        turnDirection,
        legLengthNm,
        legTimeMinutes,
        holdRole: buildHoldRole(decodedLeg.pathTerminator)
      },
      depictionGeometry: null,
      depictionBbox: null,
      chartAnnotations: {
        holdRole: buildHoldRole(decodedLeg.pathTerminator),
        inboundCourse: inboundCourse ?? null,
        turnDirection,
        legLengthNm,
        legTimeMinutes,
        altitudeRestrictions,
        speedRestriction
      },
      metadata: {
        ...decodedLeg.metadata,
        role: "hold-pattern",
        geometryIntent: "hold-racetrack",
        displayModel: "Hold depiction requires a fix anchor and inbound course"
      },
      endCoord: decodedLeg.pathTerminator === "HF" ? fixCoord : (startCoord ?? fixCoord),
      warning: `${decodedLeg.pathTerminator} leg ${decodedLeg.index} could not emit a hold racetrack because fix or inbound course is unresolved`
    };
  }

  const depiction = buildHoldDepiction(decodedLeg, fixCoord, inboundCourse, turnDirection, legLengthNm);
  const holdRole = buildHoldRole(decodedLeg.pathTerminator);

  return {
    geometry: depiction.geometry,
    bbox: depiction.bbox,
    semanticGeometry: {
      type: "hold-pattern",
      anchorFixCoord: fixCoord,
      inboundCourse,
      turnDirection,
      legLengthNm,
      legTimeMinutes,
      holdRole,
      anchorFixId: decodedLeg.fixId ?? null
    },
    depictionGeometry: depiction.geometry,
    depictionBbox: depiction.bbox,
    depictionCurve: depiction.curve,
    chartAnnotations: {
      holdRole,
      inboundCourse,
      turnDirection,
      legLengthNm,
      legTimeMinutes,
      altitudeRestrictions,
      speedRestriction,
      annotationCoord: depiction.annotationCoord
    },
    metadata: {
      ...decodedLeg.metadata,
      role: "hold-pattern",
      geometryIntent: "hold-racetrack",
      displayModel: "Stable racetrack hold depiction for chart rendering",
      inboundCourse,
      turnDirection,
      legLengthNm,
      legTimeMinutes
    },
    endCoord: decodedLeg.pathTerminator === "HF" ? fixCoord : startCoord ?? fixCoord
  };
}
