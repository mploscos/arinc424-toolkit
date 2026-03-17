import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

function run(scriptPath, args, cwd) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd,
    encoding: "utf8"
  });
}

function runRootCli(args, cwd) {
  return run(path.join(cwd, "bin/arinc.js"), args, cwd);
}

function runToolkitCli(args, cwd) {
  return run(path.join(cwd, "packages/toolkit/bin/arinc.js"), args, cwd);
}

test("cli smoke: parse -> features -> tiles", () => {
  const cwd = process.cwd();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "arinc-cli-"));
  const fixture = path.join(cwd, "test/fixtures/airway-network.arinc");
  const canonical = path.join(tmp, "canonical.json");
  const features = path.join(tmp, "features.json");
  const tilesOut = path.join(tmp, "tiles");

  let r = runRootCli(["parse", fixture, canonical], cwd);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(canonical));

  r = runRootCli(["features", canonical, features], cwd);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(features));

  r = runRootCli(["tiles", features, tilesOut, "--min-zoom", "4", "--max-zoom", "6"], cwd);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(path.join(tilesOut, "manifest.json")));

  fs.rmSync(tmp, { recursive: true, force: true });
});

test("cli smoke: 3dtiles from features", () => {
  const cwd = process.cwd();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "arinc-cli-3d-"));
  const features = path.join(cwd, "test/golden/airspace/features.golden.json");
  const out = path.join(tmp, "3d");

  const r = runRootCli(["3dtiles", features, out], cwd);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(path.join(out, "tileset.json")));
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("cli smoke: invalid command usage returns non-zero", () => {
  const cwd = process.cwd();
  const r = runRootCli(["parse"], cwd);
  assert.notEqual(r.status, 0);
});

test("cli smoke: analysis commands", () => {
  const cwd = process.cwd();
  const canonical = path.join(cwd, "test/golden/minimal-airport/canonical.golden.json");
  const features = path.join(cwd, "test/golden/airway-network/features.golden.json");

  let r = runRootCli(["stats", canonical, "--json"], cwd);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /\"kind\": \"canonical\"/);

  r = runRootCli(["inspect-airport", canonical, "KMIN", "--json"], cwd);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /\"kind\": \"airport\"/);

  r = runRootCli(["query", features, "--layer", "airways", "--json"], cwd);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /airway/);

  r = runRootCli(["inspect-procedure", path.join(cwd, "test/golden/procedure/canonical.golden.json"), "PRC1", "--json"], cwd);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /\"kind\": \"procedure\"/);

  r = runRootCli(["procedure-geometry", path.join(cwd, "test/golden/procedure/canonical.golden.json"), "PRC1", "--json"], cwd);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /\"procedureId\":/);
  assert.match(r.stdout, /\"pathTerminator\": \"(IF|TF|CF|DF)\"/);

  r = runRootCli(["related", path.join(cwd, "test/golden/procedure/canonical.golden.json"), "--airport", "KPRC", "--relation", "procedureIds", "--json"], cwd);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /procedure:PD:/);

  r = runRootCli(["validate-relations", canonical, "--json"], cwd);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /\"valid\": true/);
});

test("cli smoke: toolkit package bin exposes arinc commands", () => {
  const cwd = process.cwd();
  const canonical = path.join(cwd, "test/golden/minimal-airport/canonical.golden.json");

  let r = runToolkitCli(["stats", canonical, "--json"], cwd);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /\"kind\": \"canonical\"/);

  r = runToolkitCli(["validate-relations", canonical, "--json"], cwd);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /\"valid\": true/);
});
