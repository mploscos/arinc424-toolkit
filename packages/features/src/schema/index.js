import featureBaseSchema from "./feature.base.schema.json" with { type: "json" };
import featureDiscriminatorSchema from "./feature.discriminator.schema.json" with { type: "json" };
import schemaRegistry from "./registry.index.json" with { type: "json" };

export { featureBaseSchema, featureDiscriminatorSchema, schemaRegistry };
export { assertFeatureBaseSchema, assertFeatureDiscriminatorSchema } from "./validate.js";
