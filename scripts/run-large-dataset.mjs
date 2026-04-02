import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { parseArincFile, writeCanonicalModel } from "@arinc424/core";
import { buildFeaturesFromCanonical, validateFeatureModel } from "@arinc424/features";
import { generateTiles, writeTileManifest } from "@arinc424/tiles";
import { build3DTilesFromFeatures } from "@arinc424/3dtiles";
import { validateCrossEntityConsistency, buildIssueFeatures } from "@arinc424/analysis";
import { buildProcedureLegFeatureCollection } from "@arinc424/procedures";

function parseArgs(argv) {
  const args = {
    input: "",
    out: "",
    dataset: "",
    skipTiles: false,
    skip3dtiles: false,
    withProcedureLegs: false,
    procedureLegsAirport: "",
    procedureLegsType: "",
    procedureLegsLimit: 0,
    minZoom: 4,
    maxZoom: 10,
    reportName: "report"
  };

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--input") args.input = argv[++i] ?? "";
    else if (a === "--out") args.out = argv[++i] ?? "";
    else if (a === "--dataset") args.dataset = argv[++i] ?? "";
    else if (a === "--skip-tiles") args.skipTiles = true;
    else if (a === "--skip-3dtiles") args.skip3dtiles = true;
    else if (a === "--with-procedure-legs") args.withProcedureLegs = true;
    else if (a === "--procedure-legs-airport") args.procedureLegsAirport = argv[++i] ?? "";
    else if (a === "--procedure-legs-type") args.procedureLegsType = argv[++i] ?? "";
    else if (a === "--procedure-legs-limit") args.procedureLegsLimit = Number(argv[++i] ?? 0);
    else if (a === "--min-zoom") args.minZoom = Number(argv[++i] ?? 4);
    else if (a === "--max-zoom") args.maxZoom = Number(argv[++i] ?? 10);
    else if (a === "--report-name") args.reportName = argv[++i] ?? "report";
    else if (a === "--help" || a === "-h") {
      printUsage();
      process.exit(0);
    }
  }

  if (!args.input) throw new Error("Missing required --input <ARINC file>");
  if (!args.out) throw new Error("Missing required --out <output dir>");
  if (!Number.isFinite(args.minZoom) || !Number.isFinite(args.maxZoom)) {
    throw new Error("--min-zoom and --max-zoom must be numbers");
  }
  if (!Number.isFinite(args.procedureLegsLimit) || args.procedureLegsLimit < 0) {
    throw new Error("--procedure-legs-limit must be a non-negative number");
  }
  if (args.minZoom > args.maxZoom) {
    throw new Error("--min-zoom cannot be greater than --max-zoom");
  }

  args.input = path.resolve(args.input);
  args.out = path.resolve(args.out);
  args.dataset = args.dataset || path.basename(args.input, path.extname(args.input));
  args.reportName = String(args.reportName || "report").trim() || "report";

  return args;
}

function printUsage() {
  console.log(`Usage:\n  node scripts/run-large-dataset.mjs \\\n    --input /path/to/FAACIFP18.dat \\\n    --out ./artifacts/faacifp18 \\\n    --dataset FAACIFP18\n\nOptions:\n  --skip-tiles\n  --skip-3dtiles\n  --with-procedure-legs\n  --procedure-legs-airport <ident>\n  --procedure-legs-type <SID|STAR|APPROACH>\n  --procedure-legs-limit <n>\n  --min-zoom <n>\n  --max-zoom <n>\n  --report-name <baseName>`);
}

function nowMs() {
  return Number(process.hrtime.bigint()) / 1e6;
}

function logProgress(stage, message, extra = null) {
  if (extra && typeof extra === "object" && Object.keys(extra).length > 0) {
    console.log(`[dataset-run] ${stage}: ${message}`, extra);
    return;
  }
  console.log(`[dataset-run] ${stage}: ${message}`);
}

function startStage(stage, extra = null) {
  logProgress(stage, "start", extra);
  return nowMs();
}

function endStage(stage, startMs, extra = null) {
  logProgress(stage, `done in ${(nowMs() - startMs).toFixed(2)} ms`, extra);
}

function fileSizeSafe(filepath) {
  try {
    return fs.statSync(filepath).size;
  } catch {
    return 0;
  }
}

function listFilesRecursive(dir) {
  const files = [];
  if (!fs.existsSync(dir)) return files;
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const e of entries) {
      const abs = path.join(current, e.name);
      if (e.isDirectory()) stack.push(abs);
      else if (e.isFile()) files.push(abs);
    }
  }
  return files.sort();
}

function dirSizeBytes(dir) {
  return listFilesRecursive(dir).reduce((sum, f) => sum + fileSizeSafe(f), 0);
}

function countBy(arr, keyFn) {
  const out = {};
  for (const item of arr) {
    const key = keyFn(item);
    out[key] = (out[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

function summarizeTiles(tilesDir) {
  const files = listFilesRecursive(tilesDir).filter((f) => f.endsWith(".json"));
  let totalSizeBytes = 0;
  let largestTileFileSizeBytes = 0;
  const byZoom = {};
  for (const file of files) {
    const size = fileSizeSafe(file);
    totalSizeBytes += size;
    if (size > largestTileFileSizeBytes) largestTileFileSizeBytes = size;
    const rel = path.relative(tilesDir, file);
    const m = /^(\d+)\//.exec(rel.replaceAll("\\", "/"));
    if (!m) continue;
    const z = m[1];
    byZoom[z] = (byZoom[z] ?? 0) + 1;
  }
  const averageTileFileSizeBytes = files.length ? Math.round(totalSizeBytes / files.length) : 0;

  return {
    directorySizeBytes: totalSizeBytes,
    tileFileCount: files.length,
    largestTileFileSizeBytes,
    averageTileFileSizeBytes,
    tileCountByZoom: Object.fromEntries(Object.entries(byZoom).sort(([a], [b]) => Number(a) - Number(b)))
  };
}

function buildAvailableTilesIndex(tilesDir) {
  const files = listFilesRecursive(tilesDir)
    .map((f) => path.relative(tilesDir, f).replaceAll("\\", "/"))
    .filter((rel) => /^\d+\/\d+\/\d+\.json$/.test(rel))
    .sort((a, b) => {
      const [za, xa, ya] = a.replace(".json", "").split("/").map(Number);
      const [zb, xb, yb] = b.replace(".json", "").split("/").map(Number);
      return za - zb || xa - xb || ya - yb;
    });
  return files.map((rel) => rel.replace(/\.json$/, ""));
}

function summarize3DTiles(outDir) {
  const files = listFilesRecursive(outDir);
  const tilesetPath = path.join(outDir, "tileset.json");
  let tilesetSummary = null;
  if (fs.existsSync(tilesetPath)) {
    const tileset = JSON.parse(fs.readFileSync(tilesetPath, "utf8"));
    tilesetSummary = {
      assetVersion: tileset.asset?.version ?? null,
      geometricError: tileset.geometricError ?? null,
      rootHasContent: Boolean(tileset.root?.content?.uri),
      rootChildren: Array.isArray(tileset.root?.children) ? tileset.root.children.length : 0,
      hasBoundingVolume: Boolean(tileset.root?.boundingVolume)
    };
  }

  return {
    directorySizeBytes: dirSizeBytes(outDir),
    emittedFileCount: files.length,
    tilesetJsonSizeBytes: fileSizeSafe(tilesetPath),
    tilesetSummary
  };
}

function computeBoundsFromFeatures(features) {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;

  for (const f of features ?? []) {
    const b = f?.bbox;
    if (!Array.isArray(b) || b.length !== 4) continue;
    if (!b.every((n) => Number.isFinite(n))) continue;
    minLon = Math.min(minLon, b[0]);
    minLat = Math.min(minLat, b[1]);
    maxLon = Math.max(maxLon, b[2]);
    maxLat = Math.max(maxLat, b[3]);
  }

  if (!Number.isFinite(minLon)) return null;
  return [minLon, minLat, maxLon, maxLat];
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function deriveServedVisualizationIndexUrl(outDir) {
  const repoRoot = process.cwd();
  const normalizedOut = path.resolve(outDir);
  const dataRoot = path.resolve(repoRoot, "data");
  const artifactsRoot = path.resolve(repoRoot, "artifacts");

  if (normalizedOut.startsWith(`${dataRoot}${path.sep}`) || normalizedOut === dataRoot) {
    const rel = path.relative(dataRoot, normalizedOut).replaceAll("\\", "/");
    return `/data/${rel ? `${rel}/` : ""}visualization.index.json`;
  }
  if (normalizedOut.startsWith(`${artifactsRoot}${path.sep}`) || normalizedOut === artifactsRoot) {
    const rel = path.relative(artifactsRoot, normalizedOut).replaceAll("\\", "/");
    return `/artifacts/${rel ? `${rel}/` : ""}visualization.index.json`;
  }
  return null;
}

function formatBytes(n) {
  if (!Number.isFinite(n)) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

function toMarkdown(report) {
  const lines = [];
  lines.push(`# Large Dataset Run Report: ${report.run.dataset}`);
  lines.push("");
  lines.push(`- Input: \`${report.run.inputPath}\``);
  lines.push(`- Run timestamp: ${report.run.runTimestamp}`);
  lines.push(`- Total duration: ${report.overall.totalDurationMs.toFixed(2)} ms`);
  lines.push("");
  lines.push("## Environment");
  lines.push(`- Node: ${report.environment.nodeVersion}`);
  lines.push(`- Platform: ${report.environment.platform}`);
  lines.push(`- CPU: ${report.environment.cpuModels.join(" | ")}`);
  lines.push(`- Total RAM: ${formatBytes(report.environment.totalMemoryBytes)}`);
  lines.push("");

  lines.push("## Stage Timings");
  lines.push(`- Canonical: ${report.stages.canonical.durationMs.toFixed(2)} ms`);
  lines.push(`- Features: ${report.stages.features.durationMs.toFixed(2)} ms`);
  lines.push(`- Tiles: ${report.stages.tiles.skipped ? "skipped" : `${report.stages.tiles.durationMs.toFixed(2)} ms`}`);
  lines.push(`- 3D Tiles: ${report.stages.threeDTiles.skipped ? "skipped" : `${report.stages.threeDTiles.durationMs.toFixed(2)} ms`}`);
  lines.push("");

  lines.push("## Canonical");
  lines.push(`- Output size: ${formatBytes(report.stages.canonical.outputFileSizeBytes)}`);
  lines.push("- Entity counts:");
  for (const [k, v] of Object.entries(report.stages.canonical.entityCounts)) lines.push(`  - ${k}: ${v}`);
  lines.push("");

  lines.push("## Features");
  lines.push(`- Output size: ${formatBytes(report.stages.features.outputFileSizeBytes)}`);
  lines.push(`- Total features: ${report.stages.features.totalFeatureCount}`);
  lines.push("- Layer counts:");
  for (const [k, v] of Object.entries(report.stages.features.featureCountsByLayer)) lines.push(`  - ${k}: ${v}`);
  lines.push("");

  lines.push("## Analysis QA");
  lines.push(`- Relation consistency: ${report.stages.analysis.valid ? "valid" : "invalid"}`);
  lines.push(`- Issues: ${report.stages.analysis.issueCount} (errors: ${report.stages.analysis.errorCount}, warnings: ${report.stages.analysis.warningCount})`);
  lines.push("");

  lines.push("## Tiles");
  if (report.stages.tiles.skipped) {
    lines.push("- Skipped");
  } else {
    lines.push(`- Output size: ${formatBytes(report.stages.tiles.directorySizeBytes)}`);
    lines.push(`- Tile files: ${report.stages.tiles.tileFileCount}`);
    lines.push(`- Zoom range: ${report.stages.tiles.minZoom}..${report.stages.tiles.maxZoom}`);
    lines.push(`- Largest tile: ${formatBytes(report.stages.tiles.largestTileFileSizeBytes)}`);
    lines.push(`- Average tile: ${formatBytes(report.stages.tiles.averageTileFileSizeBytes)}`);
    lines.push("- Tile count by zoom:");
    for (const [z, c] of Object.entries(report.stages.tiles.tileCountByZoom)) lines.push(`  - z${z}: ${c}`);
  }
  lines.push("");

  lines.push("## 3D Tiles");
  if (report.stages.threeDTiles.skipped) {
    lines.push("- Skipped");
  } else {
    lines.push(`- Output size: ${formatBytes(report.stages.threeDTiles.directorySizeBytes)}`);
    lines.push(`- Emitted files: ${report.stages.threeDTiles.emittedFileCount}`);
    lines.push(`- tileset.json size: ${formatBytes(report.stages.threeDTiles.tilesetJsonSizeBytes)}`);
    if (report.stages.threeDTiles.tilesetSummary) {
      lines.push(`- tileset.asset.version: ${report.stages.threeDTiles.tilesetSummary.assetVersion}`);
      lines.push(`- root children: ${report.stages.threeDTiles.tilesetSummary.rootChildren}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function toReadmeSnippet(report) {
  const lines = [];
  lines.push("## Reference Large Dataset Run");
  lines.push("");
  lines.push(`Reference run on one machine/configuration for dataset **${report.run.dataset}**.`);
  lines.push("Numbers are indicative and should not be treated as universal performance guarantees.");
  lines.push("");
  lines.push("Pipeline exercised:");
  lines.push("- ARINC424 -> canonical");
  lines.push("- canonical -> features");
  lines.push("- features -> tiled GeoJSON");
  lines.push("- features -> 3D Tiles");
  lines.push("");
  lines.push("Summary:");
  lines.push(`- Canonical: ${report.stages.canonical.durationMs.toFixed(2)} ms, ${report.stages.canonical.totalEntities} entities`);
  lines.push(`- Features: ${report.stages.features.durationMs.toFixed(2)} ms, ${report.stages.features.totalFeatureCount} features`);
  lines.push(`- Analysis issues: ${report.stages.analysis.issueCount} (errors: ${report.stages.analysis.errorCount}, warnings: ${report.stages.analysis.warningCount})`);
  if (!report.stages.tiles.skipped) {
    lines.push(`- Tiles: ${report.stages.tiles.durationMs.toFixed(2)} ms, ${report.stages.tiles.tileFileCount} files (${report.stages.tiles.minZoom}..${report.stages.tiles.maxZoom})`);
  }
  if (!report.stages.threeDTiles.skipped) {
    lines.push(`- 3D Tiles: ${report.stages.threeDTiles.durationMs.toFixed(2)} ms, ${report.stages.threeDTiles.emittedFileCount} files`);
  }
  lines.push("");
  lines.push("See [docs/large-dataset.md](docs/large-dataset.md) for command usage and report details.");
  return `${lines.join("\n")}\n`;
}

function normalizeProcedureTypeFilter(value) {
  const token = String(value || "").trim().toUpperCase();
  if (!token) return "";
  if (token === "SID") return "SID";
  if (token === "STAR") return "STAR";
  if (token === "APPROACH" || token === "APP") return "APPROACH";
  return token;
}

function canonicalProcedureCategory(procedure) {
  const raw = String(procedure?.procedureType || "").trim().toUpperCase();
  if (raw === "APPROACH" || raw === "APP") return "APPROACH";
  if (raw === "STAR" || raw === "PE") return "STAR";
  if (raw === "SID" || raw === "PD") return "SID";
  return raw;
}

function filterProceduresForDebug(canonical, args) {
  const airportFilter = String(args.procedureLegsAirport || "").trim().toUpperCase();
  const typeFilter = normalizeProcedureTypeFilter(args.procedureLegsType);
  const limit = Number(args.procedureLegsLimit || 0);
  const procedures = canonical.entities?.procedures ?? [];
  const filtered = procedures.filter((procedure) => {
    if (airportFilter) {
      const airportId = String(procedure?.airportId || "").toUpperCase();
      const airportIdent = airportId.split(":").at(-1) || airportId;
      if (airportIdent !== airportFilter) return false;
    }
    if (typeFilter) {
      if (canonicalProcedureCategory(procedure) !== typeFilter) return false;
    }
    return true;
  });
  return limit > 0 ? filtered.slice(0, limit) : filtered;
}

async function main() {
  const args = parseArgs(process.argv);

  if (!fs.existsSync(args.input)) {
    throw new Error(`Input file not found: ${args.input}`);
  }

  fs.mkdirSync(args.out, { recursive: true });
  const canonicalPath = path.join(args.out, "canonical.json");
  const featuresPath = path.join(args.out, "features.json");
  const tilesDir = path.join(args.out, "tiles");
  const threeDTilesDir = path.join(args.out, "3dtiles");
  const analysisDir = path.join(args.out, "analysis");
  const procedureLegsPath = path.join(analysisDir, "procedure-legs.geojson");

  const report = {
    run: {
      dataset: args.dataset,
      inputPath: args.input,
      inputFileSizeBytes: fileSizeSafe(args.input),
      runTimestamp: new Date().toISOString()
    },
    environment: {
      nodeVersion: process.version,
      platform: `${process.platform} ${process.arch}`,
      cpuModels: [...new Set(os.cpus().map((c) => c.model))],
      totalMemoryBytes: os.totalmem()
    },
    stages: {
      canonical: {},
      features: {},
      tiles: {},
      threeDTiles: {}
    },
    overall: {}
  };

  const totalStart = nowMs();

  const canonicalStart = startStage("parse/canonical", { input: args.input, out: canonicalPath });
  const canonical = await parseArincFile(args.input, { generatedAt: null });
  writeCanonicalModel(canonical, canonicalPath);
  const canonicalEnd = nowMs();

  const entityCounts = Object.fromEntries(
    Object.entries(canonical.entities).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0])
  );

  report.stages.canonical = {
    durationMs: canonicalEnd - canonicalStart,
    outputFileSizeBytes: fileSizeSafe(canonicalPath),
    totalEntities: Object.values(entityCounts).reduce((a, b) => a + b, 0),
    entityCounts
  };
  endStage("parse/canonical", canonicalStart, {
    output: canonicalPath,
    sizeBytes: report.stages.canonical.outputFileSizeBytes,
    totalEntities: report.stages.canonical.totalEntities
  });

  const featuresStart = startStage("features", { out: featuresPath });
  const featureModel = buildFeaturesFromCanonical(canonical, { generatedAt: null });
  validateFeatureModel(featureModel);
  fs.writeFileSync(featuresPath, `${JSON.stringify(featureModel, null, 2)}\n`, "utf8");
  const featuresEnd = nowMs();

  report.stages.features = {
    durationMs: featuresEnd - featuresStart,
    outputFileSizeBytes: fileSizeSafe(featuresPath),
    totalFeatureCount: featureModel.features.length,
    featureCountsByLayer: countBy(featureModel.features, (f) => f.layer)
  };
  endStage("features", featuresStart, {
    output: featuresPath,
    sizeBytes: report.stages.features.outputFileSizeBytes,
    featureCount: report.stages.features.totalFeatureCount
  });

  const consistencyStart = startStage("consistency", { out: path.join(analysisDir, "consistency.json") });
  const consistency = validateCrossEntityConsistency(canonical);
  endStage("consistency", consistencyStart, {
    valid: consistency.valid,
    errors: consistency.errors.length,
    warnings: consistency.warnings.length
  });

  const issuesStart = startStage("issues", { out: path.join(analysisDir, "issues.geojson") });
  const issues = buildIssueFeatures(canonical, consistency);
  endStage("issues", issuesStart, {
    issueCount: issues.summary?.issueCount ?? issues.features?.length ?? 0,
    errorCount: issues.summary?.errorCount ?? consistency.errors.length,
    warningCount: issues.summary?.warningCount ?? consistency.warnings.length
  });

  let procedureLegs = null;
  let procedureLegSelectionCount = 0;
  if (args.withProcedureLegs) {
    const selectedProcedures = filterProceduresForDebug(canonical, args);
    procedureLegSelectionCount = selectedProcedures.length;
    const procedureLegsStart = startStage("procedure-legs", {
      out: procedureLegsPath,
      selectedProcedures: procedureLegSelectionCount,
      airportFilter: args.procedureLegsAirport || null,
      typeFilter: normalizeProcedureTypeFilter(args.procedureLegsType) || null,
      limit: args.procedureLegsLimit || null
    });
    let lastProcedureLegProgressLog = 0;
    procedureLegs = buildProcedureLegFeatureCollection(
      {
        ...canonical,
        entities: {
          ...canonical.entities,
          procedures: selectedProcedures
        }
      },
      {
        progressEveryProcedures: 5000,
        onProgress: ({ processedProcedures, totalProcedures, processedLegs, emittedFeatures }) => {
          const now = nowMs();
          if ((now - lastProcedureLegProgressLog) < 250 && processedProcedures !== totalProcedures) return;
          lastProcedureLegProgressLog = now;
          logProgress("procedure-legs", "progress", {
            processedProcedures,
            totalProcedures,
            processedLegs,
            emittedFeatures
          });
        }
      }
    );
    endStage("procedure-legs", procedureLegsStart, {
      selectedProcedures: procedureLegSelectionCount,
      featureCount: procedureLegs.features?.length ?? 0
    });
  } else {
    try {
      fs.rmSync(procedureLegsPath, { force: true });
    } catch {
      // ignore stale debug artifact cleanup failures
    }
    logProgress("procedure-legs", "skipped", { reason: "Use --with-procedure-legs to generate debug leg output" });
  }
  const analysisWriteStart = startStage("analysis-write", { out: analysisDir });
  writeJson(path.join(analysisDir, "consistency.json"), consistency);
  writeJson(path.join(analysisDir, "issues.geojson"), issues);
  if (procedureLegs) {
    writeJson(procedureLegsPath, procedureLegs);
  }
  endStage("analysis-write", analysisWriteStart, {
    issueCount: issues.summary?.issueCount ?? issues.features?.length ?? 0,
    procedureLegCount: procedureLegs?.features?.length ?? 0
  });
  report.stages.analysis = {
    valid: consistency.valid,
    errorCount: consistency.errors.length,
    warningCount: consistency.warnings.length,
    issueCount: issues.summary?.issueCount ?? issues.features?.length ?? 0,
    procedureLegsGenerated: Boolean(procedureLegs),
    procedureLegCount: procedureLegs?.features?.length ?? 0,
    procedureLegSelectionCount
  };

  if (args.skipTiles) {
    logProgress("tiles", "skipped", { reason: "--skip-tiles" });
    report.stages.tiles = { skipped: true, reason: "--skip-tiles" };
  } else {
    const tilesStart = startStage("tiles", { out: tilesDir, minZoom: args.minZoom, maxZoom: args.maxZoom });
    const { manifest } = generateTiles(featureModel, {
      outDir: tilesDir,
      minZoom: args.minZoom,
      maxZoom: args.maxZoom,
      generatedAt: null
    });
    writeTileManifest(manifest, path.join(tilesDir, "manifest.json"));
    const tilesEnd = nowMs();

    report.stages.tiles = {
      skipped: false,
      durationMs: tilesEnd - tilesStart,
      minZoom: args.minZoom,
      maxZoom: args.maxZoom,
      ...summarizeTiles(tilesDir)
    };
    endStage("tiles", tilesStart, {
      tileCount: report.stages.tiles.tileFileCount,
      zoomRange: `${report.stages.tiles.minZoom}..${report.stages.tiles.maxZoom}`
    });
  }

  if (args.skip3dtiles) {
    logProgress("3dtiles", "skipped", { reason: "--skip-3dtiles" });
    report.stages.threeDTiles = { skipped: true, reason: "--skip-3dtiles" };
  } else {
    const airspaceCount = featureModel.features.filter((f) => f.layer === "airspaces").length;
    if (airspaceCount === 0) {
      logProgress("3dtiles", "skipped", { reason: "No airspaces layer features available for 3D tiles generation" });
      report.stages.threeDTiles = {
        skipped: true,
        reason: "No airspaces layer features available for 3D tiles generation"
      };
    } else {
      const threeDStart = startStage("3dtiles", { out: threeDTilesDir, airspaceCount });
      build3DTilesFromFeatures(featureModel, { outDir: threeDTilesDir, mode: "tileset" });
      const threeDEnd = nowMs();
      report.stages.threeDTiles = {
        skipped: false,
        durationMs: threeDEnd - threeDStart,
        ...summarize3DTiles(threeDTilesDir)
      };
      endStage("3dtiles", threeDStart, {
        emittedFiles: report.stages.threeDTiles.emittedFileCount,
        tilesetJsonSizeBytes: report.stages.threeDTiles.tilesetJsonSizeBytes
      });
    }
  }

  report.overall.totalDurationMs = nowMs() - totalStart;

  const reportJsonPath = path.join(args.out, `${args.reportName}.json`);
  const reportMdPath = path.join(args.out, `${args.reportName}.md`);
  const snippetPath = path.join(args.out, "readme-snippet.md");
  const bounds = computeBoundsFromFeatures(featureModel.features);
  const outputs = {};
  outputs.qa = {
    type: "analysis-issues",
    consistency: "./analysis/consistency.json",
    issues: "./analysis/issues.geojson"
  };
  if (procedureLegs) {
    outputs.debug = {
      procedureLegs: "./analysis/procedure-legs.geojson"
    };
  }

  if (!report.stages.tiles.skipped) {
    const tilesIndexPath = path.join(tilesDir, "index.json");
    const tilesManifestPath = path.join(tilesDir, "manifest.json");
    const tilesManifestExists = fs.existsSync(tilesManifestPath);
    const availableTiles = buildAvailableTilesIndex(tilesDir);
    const tilesIndex = {
      type: "geojson-tiles",
      version: "1.0",
      minZoom: args.minZoom,
      maxZoom: args.maxZoom,
      layers: Object.keys(report.stages.features.featureCountsByLayer),
      bounds,
      tileTemplate: "./{z}/{x}/{y}.json",
      availableTiles,
      manifest: tilesManifestExists ? "./manifest.json" : null
    };
    writeJson(tilesIndexPath, tilesIndex);
    outputs.tiles2d = {
      type: "geojson-tiles",
      index: "./tiles/index.json"
    };
  }

  if (!report.stages.threeDTiles.skipped) {
    const threeDIndexPath = path.join(threeDTilesDir, "index.json");
    const threeDIndex = {
      type: "3dtiles",
      version: "1.0",
      tileset: "./tileset.json",
      bounds,
      summary: {
        fileCount: report.stages.threeDTiles.emittedFileCount,
        tilesetJsonSizeBytes: report.stages.threeDTiles.tilesetJsonSizeBytes
      }
    };
    writeJson(threeDIndexPath, threeDIndex);
    outputs.tiles3d = {
      type: "3dtiles",
      index: "./3dtiles/index.json"
    };
  }

  const visualizationIndex = {
    dataset: args.dataset,
    version: "1.0",
    servedVisualizationIndexUrl: deriveServedVisualizationIndexUrl(args.out),
    outputs
  };
  const visualizationIndexPath = path.join(args.out, "visualization.index.json");

  const reportsStart = startStage("reports", {
    reportJsonPath,
    reportMdPath,
    snippetPath,
    visualizationIndexPath
  });
  writeJson(reportJsonPath, report);
  fs.writeFileSync(reportMdPath, toMarkdown(report), "utf8");
  fs.writeFileSync(snippetPath, toReadmeSnippet(report), "utf8");
  writeJson(visualizationIndexPath, visualizationIndex);
  endStage("reports", reportsStart);

  console.log(`[dataset-run] complete: ${args.dataset}`);
  console.log(`[dataset-run] report json: ${reportJsonPath}`);
  console.log(`[dataset-run] report md:   ${reportMdPath}`);
  console.log(`[dataset-run] snippet:     ${snippetPath}`);
  console.log(`[dataset-run] viz index:   ${visualizationIndexPath}`);
}

const isEntrypoint = process.argv[1]
  ? import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
  : false;

if (isEntrypoint) {
  main().catch((err) => {
    console.error(err?.stack || String(err));
    process.exit(1);
  });
}

export { summarizeTiles, listFilesRecursive };
