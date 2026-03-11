import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import process from "node:process";

const repoRoot = process.cwd();
const root = path.resolve(repoRoot, "packages/view/examples");
const dataRoot = path.resolve(repoRoot, "data");
const artifactsRoot = path.resolve(repoRoot, "artifacts");
const port = Number(process.env.PORT || 8080);

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".pbf": "application/x-protobuf",
  ".b3dm": "application/octet-stream"
};

function safeResolveUnder(baseDir, urlPath) {
  const clean = decodeURIComponent(urlPath.split("?")[0]);
  const rel = clean === "/" ? "/index.html" : clean;
  const abs = path.resolve(baseDir, `.${rel}`);
  if (!abs.startsWith(baseDir)) return null;
  return abs;
}

function safeResolve(urlPath) {
  const clean = decodeURIComponent((urlPath || "/").split("?")[0]);

  if (clean.startsWith("/data/")) {
    if (!fs.existsSync(dataRoot) || !fs.statSync(dataRoot).isDirectory()) return null;
    return safeResolveUnder(dataRoot, clean.slice("/data".length));
  }
  if (clean === "/data" || clean === "/data/") {
    if (!fs.existsSync(dataRoot) || !fs.statSync(dataRoot).isDirectory()) return null;
    return path.join(dataRoot, "index.html");
  }

  if (clean.startsWith("/artifacts/")) {
    if (!fs.existsSync(artifactsRoot) || !fs.statSync(artifactsRoot).isDirectory()) return null;
    return safeResolveUnder(artifactsRoot, clean.slice("/artifacts".length));
  }
  if (clean === "/artifacts" || clean === "/artifacts/") {
    if (!fs.existsSync(artifactsRoot) || !fs.statSync(artifactsRoot).isDirectory()) return null;
    return path.join(artifactsRoot, "index.html");
  }

  return safeResolveUnder(root, clean);
}

const server = http.createServer((req, res) => {
  const abs = safeResolve(req.url || "/");
  if (!abs) {
    res.statusCode = 400;
    res.end("Bad request");
    return;
  }

  let file = abs;
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    file = path.join(file, "index.html");
  }

  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.statusCode = 404;
    res.end("Not found");
    return;
  }

  const ext = path.extname(file).toLowerCase();
  res.setHeader("Content-Type", mime[ext] || "application/octet-stream");
  fs.createReadStream(file).pipe(res);
});

server.listen(port, () => {
  console.log(`[view] serving ${root}`);
  if (fs.existsSync(dataRoot)) console.log(`[view] mounted /data -> ${dataRoot}`);
  if (fs.existsSync(artifactsRoot)) console.log(`[view] mounted /artifacts -> ${artifactsRoot}`);
  console.log(`[view] open http://localhost:${port}`);
});
