import { validateFeatureModel } from "@arinc424/features";
import { prepareAirspaceGeometry } from "../geometry/prepare-airspace-geometry.js";
import { spatialPartition } from "../partition/spatial-partition.js";
import { buildTilesetPlan } from "../tileset/build-tileset.js";
import { writeTilesArtifacts } from "../writer/write-tiles.js";

/**
 * Build 3D Tiles from the normalized feature model.
 * @param {{schema:string,features:object[]}} featureModel
 * @param {{outDir:string,mode?:string,tileDepth?:number,tileMaxFeatures?:number,outlines?:boolean,bbox?:number[],keepIntermediate?:boolean}} options
 * @returns {{outDir:string,intermediateDir?:string}}
 */
export function build3DTilesFromFeatures(featureModel, options) {
  validateFeatureModel(featureModel);
  const airspaces = (featureModel.features ?? []).filter((f) => f.layer === "airspaces");
  if (!airspaces.length) {
    throw new Error("No airspaces layer features found in feature model for 3D tiles generation");
  }
  const prepared = prepareAirspaceGeometry(airspaces);
  const partitionResult = spatialPartition(prepared, { strategy: "none" });
  const plan = buildTilesetPlan(partitionResult, options);
  const rootPartition = partitionResult.partitions[0];

  return writeTilesArtifacts(rootPartition, plan, { keepIntermediate: options.keepIntermediate });
}
