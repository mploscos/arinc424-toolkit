import fs from "node:fs";
import { assertCanonicalSchema } from "../schema/validate.js";

/**
 * Create a canonical navigation model container.
 * @param {object} [metadata]
 * @returns {object}
 */
export function createCanonicalModel(metadata = {}) {
  return {
    schema: "navdata-canonical",
    schemaVersion: "1.0.0",
    metadata: {
      datasetId: metadata.datasetId ?? null,
      source: metadata.source ?? null,
      inputFile: metadata.inputFile ?? null,
      effectiveFrom: metadata.effectiveFrom ?? null,
      effectiveTo: metadata.effectiveTo ?? null,
      generatedAt: metadata.generatedAt ?? null
    },
    entities: {
      airports: [],
      heliports: [],
      runways: [],
      waypoints: [],
      navaids: [],
      airways: [],
      airspaces: [],
      procedures: [],
      holds: []
    }
  };
}

/**
 * Read canonical model from JSON file.
 * @param {string} filepath
 * @returns {object}
 */
export function readCanonicalModel(filepath) {
  const data = JSON.parse(fs.readFileSync(filepath, "utf8"));
  validateCanonicalModel(data);
  return data;
}

/**
 * Write canonical model to disk.
 * @param {object} model
 * @param {string} filepath
 * @returns {string}
 */
export function writeCanonicalModel(model, filepath) {
  validateCanonicalModel(model);
  fs.writeFileSync(filepath, `${JSON.stringify(model, null, 2)}\n`, "utf8");
  return filepath;
}

/**
 * Validate canonical model invariants.
 * @param {object} model
 * @returns {void}
 */
export function validateCanonicalModel(model) {
  assertCanonicalSchema(model);

  const entityKeys = [
    "airports",
    "heliports",
    "runways",
    "waypoints",
    "navaids",
    "airways",
    "airspaces",
    "procedures",
    "holds"
  ];

  for (const key of entityKeys) {
    const ids = new Set();
    for (const item of model.entities[key]) {
      if (ids.has(item.id)) throw new Error(`Duplicate id in entities.${key}: ${item.id}`);
      ids.add(item.id);
    }
  }
}
