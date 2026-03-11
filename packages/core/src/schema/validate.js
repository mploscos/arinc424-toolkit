function fail(message) {
  throw new Error(`Canonical schema validation failed: ${message}`);
}

/**
 * Validate canonical model against its runtime contract.
 * @param {object} model
 */
export function assertCanonicalSchema(model) {
  if (!model || typeof model !== "object") fail("payload must be an object");
  if (model.schema !== "navdata-canonical") fail("schema must equal navdata-canonical");
  if (model.schemaVersion !== "1.0.0") fail("schemaVersion must equal 1.0.0");

  if (!model.metadata || typeof model.metadata !== "object") fail("metadata must be an object");
  if (!Object.prototype.hasOwnProperty.call(model.metadata, "source")) fail("metadata.source is required");
  if (!Object.prototype.hasOwnProperty.call(model.metadata, "generatedAt")) fail("metadata.generatedAt is required (null allowed)");

  if (!model.entities || typeof model.entities !== "object") fail("entities must be an object");
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
    const list = model.entities[key];
    if (!Array.isArray(list)) fail(`entities.${key} must be an array`);

    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      if (!item || typeof item !== "object") fail(`entities.${key}[${i}] must be an object`);
      if (typeof item.id !== "string" || !item.id) fail(`entities.${key}[${i}].id must be a non-empty string`);
      if (typeof item.type !== "string" || !item.type) fail(`entities.${key}[${i}].type must be a non-empty string`);
      if (!Array.isArray(item.sourceRefs) || item.sourceRefs.length < 1) fail(`entities.${key}[${i}].sourceRefs must be a non-empty array`);
      for (let j = 0; j < item.sourceRefs.length; j++) {
        const ref = item.sourceRefs[j];
        if (!ref || typeof ref !== "object") fail(`entities.${key}[${i}].sourceRefs[${j}] must be an object`);
        if (typeof ref.recordType !== "string" || !ref.recordType) fail(`entities.${key}[${i}].sourceRefs[${j}].recordType must be a string`);
        if (!Number.isInteger(ref.lineNumber) || ref.lineNumber < 1) fail(`entities.${key}[${i}].sourceRefs[${j}].lineNumber must be integer >= 1`);
        if (typeof ref.entityType !== "string" || !ref.entityType) fail(`entities.${key}[${i}].sourceRefs[${j}].entityType must be a string`);
        if (typeof ref.entityId !== "string" || !ref.entityId) fail(`entities.${key}[${i}].sourceRefs[${j}].entityId must be a string`);
      }
    }
  }
}
