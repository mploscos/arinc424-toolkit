/**
 * Resolve a relative asset URL against an index URL.
 * @param {string} baseUrl
 * @param {string} relativePath
 * @returns {string}
 */
export function resolveRelativeAssetUrl(baseUrl, relativePath) {
  if (!baseUrl) throw new Error("Missing baseUrl");
  if (!relativePath) throw new Error("Missing relativePath");
  const fallbackBase = (typeof window !== "undefined" && window.location) ? window.location.href : "http://localhost/";
  const resolvedBase = new URL(baseUrl, fallbackBase).toString();
  return new URL(relativePath, resolvedBase).toString();
}

/**
 * @param {unknown} value
 * @returns {value is {dataset?:string,version?:string,outputs:Record<string,{type:string,index:string}>}}
 */
export function isVisualizationIndex(value) {
  if (!value || typeof value !== "object") return false;
  const outputs = value.outputs;
  if (!outputs || typeof outputs !== "object") return false;
  return true;
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load JSON at ${url}: HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * @param {string} url
 * @returns {Promise<{url:string,index:object}>}
 */
export async function loadVisualizationIndex(url) {
  const index = await fetchJson(url);
  if (!isVisualizationIndex(index)) {
    throw new Error(`Invalid visualization index at ${url}: missing outputs object`);
  }
  return { url, index };
}

function assertTiles2DIndex(index, indexUrl) {
  if (!index || typeof index !== "object") throw new Error(`Invalid 2D tiles index at ${indexUrl}`);
  if (index.type !== "geojson-tiles") throw new Error(`Expected geojson-tiles index at ${indexUrl}`);
  if (typeof index.tileTemplate !== "string") throw new Error(`Missing tileTemplate in ${indexUrl}`);
}

function assertTiles3DIndex(index, indexUrl) {
  if (!index || typeof index !== "object") throw new Error(`Invalid 3D tiles index at ${indexUrl}`);
  if (index.type !== "3dtiles") throw new Error(`Expected 3dtiles index at ${indexUrl}`);
  if (typeof index.tileset !== "string") throw new Error(`Missing tileset in ${indexUrl}`);
}

/**
 * Accepts either a visualization index URL or a direct 2D tiles index URL.
 * @param {string} url
 * @returns {Promise<{source:"visualization"|"tiles-index",visualizationIndexUrl?:string,tilesIndexUrl:string,visualizationIndex?:object,tilesIndex:object}>}
 */
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

/**
 * Accepts either a visualization index URL or a direct 3D tiles index URL.
 * @param {string} url
 * @returns {Promise<{source:"visualization"|"3d-index",visualizationIndexUrl?:string,threeDTilesIndexUrl:string,visualizationIndex?:object,threeDTilesIndex:object}>}
 */
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
