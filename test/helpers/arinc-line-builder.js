import fs from "node:fs";
import path from "node:path";

const layoutConfig = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), "layouts.default.json"), "utf8")
);

function blankLine(len = 132) {
  return Array.from({ length: len }, () => " ");
}

function put(arr, start, end, value) {
  const s = Math.max(1, Number(start));
  const e = Math.max(s, Number(end));
  const len = e - s + 1;
  const txt = String(value ?? "").padEnd(len, " ").slice(0, len);
  for (let i = 0; i < len; i++) arr[s - 1 + i] = txt[i];
}

function lineWithType(type) {
  const arr = blankLine();
  arr[0] = "S";
  if (["PA", "PG", "PC", "PD", "PE", "PF", "HD", "HE", "HF"].includes(type)) {
    arr[4] = type[0];
    arr[12] = type[1];
  } else if (type === "D") {
    arr[4] = "D";
    arr[5] = " ";
  } else {
    put(arr, 5, 6, type);
  }
  return arr;
}

function buildLine(type, fields) {
  const arr = lineWithType(type);
  const layout = layoutConfig.layouts[type];
  if (!layout) throw new Error(`Unknown layout type: ${type}`);
  for (const [field, value] of Object.entries(fields || {})) {
    const range = layout[field];
    if (!range) continue;
    put(arr, range[0], range[1], value);
  }
  return arr.join("");
}

export function hdr(text = "HDR FAACIFP FIXTURE") {
  return text;
}

export function pa(fields) { return buildLine("PA", fields); }
export function pg(fields) { return buildLine("PG", fields); }
export function ea(fields) { return buildLine("EA", fields); }
export function d(fields) { return buildLine("D", fields); }
export function uc(fields) { return buildLine("UC", fields); }
export function pd(fields) { return buildLine("PD", fields); }
export function pe(fields) { return buildLine("PE", fields); }
export function pf(fields) { return buildLine("PF", fields); }
export function er(fields) { return buildLine("ER", fields); }

export function writeFixture(filepath, lines) {
  fs.writeFileSync(filepath, `${lines.join("\n")}\n`, "utf8");
}
