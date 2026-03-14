import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { build3DTiles as runLegacy3DTiles } from "../io/run-legacy.js";

function writeIntermediateCollections(baseDir, collections) {
  const files = {};
  for (const code of Object.keys(collections ?? {})) {
    const file = path.join(baseDir, `${code}.geojson`);
    fs.writeFileSync(file, `${JSON.stringify(collections[code])}\n`, "utf8");
    files[code] = file;
  }
  return files;
}

/**
 * Write intermediate artifacts and run legacy 3D tiles writer.
 * @param {{collections:Record<string,object>}} partitionRoot
 * @param {{legacyArgs:object}} plan
 * @param {{keepIntermediate?:boolean}} [options]
 * @returns {{outDir:string,intermediateDir?:string,intermediateFiles?:Record<string,string>}}
 */
export function writeTilesArtifacts(partitionRoot, plan, options = {}) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arinc-3dtiles-"));
  const intermediateFiles = writeIntermediateCollections(tmpDir, partitionRoot?.collections ?? {});

  runLegacy3DTiles({
    inDir: tmpDir,
    ...plan.legacyArgs
  });

  if (!options.keepIntermediate) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return { outDir: plan.legacyArgs.outDir };
  }

  return {
    outDir: plan.legacyArgs.outDir,
    intermediateDir: tmpDir,
    intermediateFiles
  };
}
