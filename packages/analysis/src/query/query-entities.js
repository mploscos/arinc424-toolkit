import { validateCanonicalModel } from "@arinc424/core";
import { validateFeatureModel } from "@arinc424/features";
import { filterByLayer } from "./filter-by-layer.js";
import { filterByBbox } from "./filter-by-bbox.js";

function flattenCanonical(canonicalModel) {
  const out = [];
  for (const [layer, items] of Object.entries(canonicalModel.entities ?? {})) {
    for (const item of items ?? []) out.push({ ...item, __layer: layer });
  }
  return out;
}

function propertyMatches(item, prop) {
  if (!prop || typeof prop !== "object") return true;
  const [key, value] = Object.entries(prop)[0] ?? [];
  if (!key) return true;

  const candidates = [
    item?.[key],
    item?.properties?.[key],
    item?.refs?.[key]
  ];

  return candidates.some((v) => String(v ?? "") === String(value));
}

/**
 * Query canonical or feature entities using simple filters.
 * @param {object} model
 * @param {{layer?:string,type?:string,id?:string,bbox?:number[],property?:Record<string,string|number>,limit?:number}} [options]
 * @returns {Array<object>}
 */
export function queryEntities(model, options = {}) {
  const schema = model?.schema;
  let items;

  if (schema === "navdata-canonical") {
    validateCanonicalModel(model);
    items = flattenCanonical(model);
  } else if (schema === "arinc-feature-model") {
    validateFeatureModel(model);
    items = [...(model.features ?? [])];
  } else {
    throw new Error("queryEntities requires navdata-canonical or arinc-feature-model input");
  }

  let out = items;

  if (options.layer) out = filterByLayer(out, options.layer);
  if (options.type) {
    const wanted = String(options.type).toLowerCase();
    out = out.filter((i) => String(i.type || i.properties?.type || "").toLowerCase() === wanted);
  }
  if (options.id) {
    const token = String(options.id).toLowerCase();
    out = out.filter((i) => {
      const id = String(i.id || "").toLowerCase();
      return id === token || id.endsWith(token);
    });
  }
  if (options.property) out = out.filter((i) => propertyMatches(i, options.property));
  if (options.bbox) out = filterByBbox(out, options.bbox);

  out = [...out].sort((a, b) => String(a.id || "").localeCompare(String(b.id || "")));
  if (Number.isFinite(options.limit) && options.limit >= 0) out = out.slice(0, options.limit);
  return out;
}
