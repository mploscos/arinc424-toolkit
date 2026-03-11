import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { build3DTiles as runLegacy3DTiles } from "./run-legacy.js";
import { validateFeatureModel } from "@arinc/features";

function toAirspaceLayerCollection(features, layerCode) {
  return {
    type: "FeatureCollection",
    features: features.map((f) => {
      const p = f.properties ?? {};
      const lower = Number(p.lowerLimit ?? p.lowerLimitM ?? p.lower_m_effective ?? 0);
      const upper = Number(p.upperLimit ?? p.upperLimitM ?? p.upper_m_effective ?? p.fir_upper_m ?? 0);
      return {
        type: "Feature",
        geometry: f.geometry,
        properties: {
          ...p,
          type: layerCode,
          lower_m_effective: Number.isFinite(lower) ? lower : 0,
          upper_m_effective: Number.isFinite(upper) ? upper : 0,
          sourceFeatureId: f.id
        }
      };
    })
  };
}

function classifyAirspace(feature) {
  const p = feature.properties ?? {};
  const t = String(p.airspaceType ?? "").toLowerCase();
  if (t.includes("fir") || t.includes("uir")) return "UF";
  if (p.restrictiveType) return "UR";
  return "UC";
}

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

  const grouped = { UC: [], UR: [], UF: [] };
  for (const feature of airspaces) {
    const code = classifyAirspace(feature);
    grouped[code].push(feature);
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arinc-3dtiles-"));
  for (const code of ["UC", "UR", "UF"]) {
    if (!grouped[code].length) continue;
    const fc = toAirspaceLayerCollection(grouped[code], code);
    fs.writeFileSync(path.join(tmpDir, `${code}.geojson`), `${JSON.stringify(fc)}\n`, "utf8");
  }

  runLegacy3DTiles({
    inDir: tmpDir,
    outDir: options.outDir,
    layers: ["UC", "UR", "UF"],
    mode: options.mode ?? "tileset",
    tileDepth: options.tileDepth,
    tileMaxFeatures: options.tileMaxFeatures,
    outlines: options.outlines,
    bbox: options.bbox
  });

  if (!options.keepIntermediate) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return { outDir: options.outDir };
  }

  return { outDir: options.outDir, intermediateDir: tmpDir };
}
