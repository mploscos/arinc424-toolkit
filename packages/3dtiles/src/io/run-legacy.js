import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Run the legacy 3D tiles builder script as a pure Node subprocess.
 * @param {{inDir:string,outDir:string,file?:string,layers?:string[],mode?:string,tileDepth?:number,tileMaxFeatures?:number,outlines?:boolean,bbox?:number[]}} options
 * @returns {{outDir:string}}
 */
export function build3DTiles(options) {
  const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../builder/build-3dtiles-legacy.js");
  const args = [script, "--in", options.inDir, "--out", options.outDir];
  if (options.file) args.push("--file", options.file);
  if (options.layers?.length) args.push("--layers", options.layers.join(","));
  if (options.mode) args.push("--mode", options.mode);
  if (Number.isFinite(options.tileDepth)) args.push("--tile-depth", String(options.tileDepth));
  if (Number.isFinite(options.tileMaxFeatures)) args.push("--tile-max-features", String(options.tileMaxFeatures));
  if (options.outlines === false) args.push("--no-outlines");
  if (options.bbox?.length === 4) args.push("--bbox", options.bbox.join(","));

  const run = spawnSync(process.execPath, args, { stdio: "inherit" });
  if (run.error) throw run.error;
  if (run.status !== 0) throw new Error(`3D tiles build failed with exit code ${run.status}`);
  return { outDir: options.outDir };
}
