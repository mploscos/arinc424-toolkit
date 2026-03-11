
// ARINC lat/lon can be NDDMMSSss or DDMMSSsH; support both hemisphere positions.
/**
 * Parse a lat/lon with leading hemisphere (e.g., NDDMMSSss).
 * @param {string} value
 * @param {number} degDigits
 * @returns {number|null}
 */
function parseHemLeading(value, degDigits) {
  const s = value.trim();
  if (s.length < degDigits + 6) return null;
  const hem = s[0];
  const sign = hem === "S" || hem === "W" ? -1 : 1;
  const digits = s.slice(1);
  if (digits.length < degDigits + 4) return null;
  const deg = Number(digits.slice(0, degDigits));
  const min = Number(digits.slice(degDigits, degDigits + 2));
  const sec = Number(digits.slice(degDigits + 2, degDigits + 4));
  const frac = digits.slice(degDigits + 4);
  const fracSec = frac ? Number(frac) / 10 ** frac.length : 0;
  if (Number.isNaN(deg) || Number.isNaN(min) || Number.isNaN(sec) || Number.isNaN(fracSec)) return null;
  return sign * (deg + min / 60 + (sec + fracSec) / 3600);
}

/**
 * Parse a lat/lon with trailing hemisphere (e.g., DDMMSSsH).
 * @param {string} value
 * @param {number} degDigits
 * @returns {number|null}
 */
function parseHemTrailing(value, degDigits) {
  const s = value.trim();
  if (s.length < degDigits + 6) return null;
  const hem = s[s.length - 1];
  const sign = hem === "S" || hem === "W" ? -1 : 1;
  const digits = s.slice(0, -1);
  const deg = Number(digits.slice(0, degDigits));
  const min = Number(digits.slice(degDigits, degDigits + 2));
  const sec = Number(digits.slice(degDigits + 2, degDigits + 4));
  const frac = digits.slice(degDigits + 4);
  const fracSec = frac ? Number(frac) / 10 ** frac.length : 0;
  if (Number.isNaN(deg) || Number.isNaN(min) || Number.isNaN(sec) || Number.isNaN(fracSec)) return null;
  return sign * (deg + min / 60 + (sec + fracSec) / 3600);
}

/**
 * Parse an ARINC latitude string into decimal degrees.
 * @param {string|null} value
 * @returns {number|null}
 */
export function parseLat(value) {
  if (!value) return null;
  if (/^[NS]/.test(value.trim())) return parseHemLeading(value, 2);
  if (/[NS]$/.test(value.trim())) return parseHemTrailing(value, 2);
  return null;
}

/**
 * Parse an ARINC longitude string into decimal degrees.
 * @param {string|null} value
 * @returns {number|null}
 */
export function parseLon(value) {
  if (!value) return null;
  if (/^[EW]/.test(value.trim())) return parseHemLeading(value, 3);
  if (/[EW]$/.test(value.trim())) return parseHemTrailing(value, 3);
  return null;
}
