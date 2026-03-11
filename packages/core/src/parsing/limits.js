/**
 * Parse ARINC altitude limits into meters.
 * @param {string|null} limit
 * @param {string|null} unit
 * @returns {number|null}
 */
export function parseLimit(limit, unit) {
  const raw = (limit ?? "").trim().toUpperCase();
  if (!raw || raw === "U" || raw === "UNL") return null;
  if (raw === "GND" || raw === "SFC") return 0;

  if (raw.startsWith("FL")) {
    const fl = Number(raw.slice(2));
    if (Number.isNaN(fl)) return null;
    return fl * 100 * 0.3048;
  }

  const value = Number(raw);
  if (Number.isNaN(value)) return null;

  const u = (unit ?? "").trim().toUpperCase();
  if (u === "M") return value;
  if (u === "A" || u === "FT") return value * 0.3048;
  if (u === "FL") return value * 100 * 0.3048;
  return value * 0.3048;
}
