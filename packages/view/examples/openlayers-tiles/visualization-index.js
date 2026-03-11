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

function assertTiles2DIndex(index, indexUrl) {
  if (!index || typeof index !== "object") throw new Error(`Invalid 2D tiles index at ${indexUrl}`);
  if (index.type !== "geojson-tiles") throw new Error(`Expected geojson-tiles index at ${indexUrl}`);
  if (typeof index.tileTemplate !== "string") throw new Error(`Missing tileTemplate in ${indexUrl}`);
}

export async function load2DTilesIndex(url) {
  const doc = await fetchJson(url);
  if (isVisualizationIndex(doc)) {
    const ref = doc.outputs?.tiles2d;
    if (!ref || ref.type !== "geojson-tiles" || typeof ref.index !== "string") {
      throw new Error(`Visualization index at ${url} has no valid outputs.tiles2d entry`);
    }
    const tilesIndexUrl = resolveRelativeAssetUrl(url, ref.index);
    const tilesIndex = await fetchJson(tilesIndexUrl);
    assertTiles2DIndex(tilesIndex, tilesIndexUrl);
    return {
      source: "visualization",
      visualizationIndexUrl: url,
      tilesIndexUrl,
      visualizationIndex: doc,
      tilesIndex
    };
  }

  assertTiles2DIndex(doc, url);
  return {
    source: "tiles-index",
    tilesIndexUrl: url,
    tilesIndex: doc
  };
}
