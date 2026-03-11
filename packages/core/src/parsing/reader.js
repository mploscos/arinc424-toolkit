
import fs from "node:fs";
import readline from "node:readline";

/**
 * Stream a file line-by-line as an async iterator.
 * @param {string} filepath
 * @returns {AsyncGenerator<string>}
 */
export async function* createLineReader(filepath) {
  const rl = readline.createInterface({
    input: fs.createReadStream(filepath, "utf8"),
    crlfDelay: Infinity
  });
  for await (const line of rl) yield line;
}
