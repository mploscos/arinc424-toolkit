
/**
 * Slice a 1-based inclusive range from a fixed-width line.
 * @param {string} line
 * @param {number} s
 * @param {number} e
 * @returns {string}
 */
export function sliceRaw(line, s, e) {
  return line.slice(s - 1, e);
}

/**
 * Slice and trim a 1-based inclusive range from a fixed-width line.
 * @param {string} line
 * @param {number} s
 * @param {number} e
 * @returns {string}
 */
export function sliceTrim(line, s, e) {
  return line.slice(s - 1, e).trim();
}

/**
 * Detect ARINC record type based on header positions.
 * @param {string} line
 * @returns {string|null}
 */
export function detectType(line) {
  if (!line || line.length < 13) return null;
  const recordType = line[0];
  if (recordType === "S" || recordType === "T") {
    const id1 = line.slice(4, 6); // section/subsection for most records
    const id2 = line[4] + line[12]; // airport/heliport/terminal sections
    if (
      id2 === "PA" ||
      id2 === "PG" ||
      id2 === "PC" ||
      id2 === "PD" ||
      id2 === "PE" ||
      id2 === "PF" ||
      id2 === "HD" ||
      id2 === "HE" ||
      id2 === "HF"
    ) {
      return id2;
    }
    if (id1 === "EA" || id1 === "ER" || id1 === "EP" || id1 === "ET" || id1 === "UC" || id1 === "UR" || id1 === "UF") return id1;
    if (id1 === "D ") return "D";
    if (id1 === "DB") return "DB";
  }
  return null;
}
