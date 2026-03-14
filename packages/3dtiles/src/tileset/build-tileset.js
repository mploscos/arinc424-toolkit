/**
 * Build a tileset generation plan from partitioned airspace collections.
 * @param {{partitions:Array<{id:string,layers:string[],collections:Record<string,object>}>}} partitionResult
 * @param {{outDir:string,mode?:string,tileDepth?:number,tileMaxFeatures?:number,outlines?:boolean,bbox?:number[]}} options
 * @returns {{layers:string[],legacyArgs:object,metadata:object}}
 */
export function buildTilesetPlan(partitionResult, options) {
  const root = partitionResult?.partitions?.[0] ?? { layers: [], collections: {} };
  const layers = (root.layers ?? []).filter(Boolean);

  return {
    layers,
    legacyArgs: {
      outDir: options.outDir,
      layers,
      mode: options.mode ?? "tileset",
      tileDepth: options.tileDepth,
      tileMaxFeatures: options.tileMaxFeatures,
      outlines: options.outlines,
      bbox: options.bbox
    },
    metadata: {
      partitionStrategy: partitionResult?.strategy ?? "none",
      partitionCount: partitionResult?.partitions?.length ?? 0,
      layerCount: layers.length
    }
  };
}
