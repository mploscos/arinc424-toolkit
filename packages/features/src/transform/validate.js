import { assertFeatureBaseSchema, assertFeatureDiscriminatorSchema } from "../schema/validate.js";

/**
 * Runtime validation for feature model and per-layer discriminators.
 * @param {object} model
 */
export function validateFeatureModel(model) {
  if (!model || model.schema !== "arinc-feature-model") throw new Error("Invalid feature model schema");
  if (!Array.isArray(model.features)) throw new Error("features must be an array");
  for (const f of model.features) {
    assertFeatureBaseSchema(f);
    assertFeatureDiscriminatorSchema(f);
    if (f.minZoom != null && f.maxZoom != null && f.minZoom > f.maxZoom) {
      throw new Error(`Invalid zoom range for feature ${f.id}`);
    }
  }
}
