export function resolveRelativeAssetUrl(baseUrl, relativePath) {
  if (!baseUrl) throw new Error("Missing baseUrl");
  if (!relativePath) throw new Error("Missing relativePath");
  const fallbackBase = (typeof window !== "undefined" && window.location) ? window.location.href : "http://localhost/";
  const resolvedBase = new URL(baseUrl, fallbackBase).toString();
  return new URL(relativePath, resolvedBase).toString();
}

export function isVisualizationIndex(value) {
  if (!value || typeof value !== "object") return false;
  const outputs = value.outputs;
  return Boolean(outputs && typeof outputs === "object");
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load JSON at ${url}: HTTP ${res.status}`);
  }
  return res.json();
}

function assertTiles3DIndex(index, indexUrl) {
  if (!index || typeof index !== "object") throw new Error(`Invalid 3D tiles index at ${indexUrl}`);
  if (index.type !== "3dtiles") throw new Error(`Expected 3dtiles index at ${indexUrl}`);
  if (typeof index.tileset !== "string") throw new Error(`Missing tileset in ${indexUrl}`);
}

export async function load3DTilesIndex(url) {
  const doc = await fetchJson(url);
  if (isVisualizationIndex(doc)) {
    const ref = doc.outputs?.tiles3d;
    if (!ref || ref.type !== "3dtiles" || typeof ref.index !== "string") {
      throw new Error(`Visualization index at ${url} has no valid outputs.tiles3d entry`);
    }
    const threeDTilesIndexUrl = resolveRelativeAssetUrl(url, ref.index);
    const threeDTilesIndex = await fetchJson(threeDTilesIndexUrl);
    assertTiles3DIndex(threeDTilesIndex, threeDTilesIndexUrl);
    return {
      source: "visualization",
      visualizationIndexUrl: url,
      threeDTilesIndexUrl,
      visualizationIndex: doc,
      threeDTilesIndex
    };
  }

  assertTiles3DIndex(doc, url);
  return {
    source: "3d-index",
    threeDTilesIndexUrl: url,
    threeDTilesIndex: doc
  };
}
