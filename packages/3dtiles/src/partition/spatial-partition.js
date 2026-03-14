/**
 * Minimal spatial partition stage for current 3D tiles flow.
 * Kept explicit to make strategy replacement straightforward later.
 * @param {{collections:Record<string,object>, grouped:Record<string,object[]>}} prepared
 * @param {{strategy?:string}} [options]
 * @returns {{strategy:string, partitions:Array<{id:string,layers:string[],collections:Record<string,object>}>}}
 */
export function spatialPartition(prepared, options = {}) {
  const strategy = options.strategy ?? "none";
  const layerCodes = Object.keys(prepared?.collections ?? {}).sort((a, b) => a.localeCompare(b));

  return {
    strategy,
    partitions: [
      {
        id: "root",
        layers: layerCodes,
        collections: prepared?.collections ?? {}
      }
    ]
  };
}
