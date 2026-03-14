const DEFAULT_LAYER_DESCRIPTORS = Object.freeze({
  airports: {
    name: "airports",
    geometryType: "point",
    styleHint: "airport",
    minZoom: 5,
    maxZoom: 14,
    label: { enabled: true, minZoom: 7, fields: ["name", "ident", "id"] }
  },
  heliports: {
    name: "heliports",
    geometryType: "point",
    styleHint: "heliport",
    minZoom: 6,
    maxZoom: 14,
    label: { enabled: true, minZoom: 8, fields: ["name", "ident", "id"] }
  },
  runways: {
    name: "runways",
    geometryType: "line",
    styleHint: "runway",
    minZoom: 7,
    maxZoom: 14,
    label: { enabled: false, minZoom: 99, fields: [] }
  },
  waypoints: {
    name: "waypoints",
    geometryType: "point",
    styleHint: "waypoint",
    minZoom: 6,
    maxZoom: 14,
    label: { enabled: true, minZoom: 8, fields: ["ident", "name", "id"] }
  },
  navaids: {
    name: "navaids",
    geometryType: "point",
    styleHint: "navaid",
    minZoom: 6,
    maxZoom: 14,
    label: { enabled: false, minZoom: 99, fields: [] }
  },
  airways: {
    name: "airways",
    geometryType: "line",
    styleHint: "airway",
    minZoom: 5,
    maxZoom: 13,
    label: { enabled: false, minZoom: 99, fields: [] }
  },
  airspaces: {
    name: "airspaces",
    geometryType: "polygon",
    styleHint: "airspace",
    minZoom: 4,
    maxZoom: 12,
    label: { enabled: true, minZoom: 7, fields: ["name", "id"] }
  },
  procedures: {
    name: "procedures",
    geometryType: "line",
    styleHint: "procedure",
    minZoom: 7,
    maxZoom: 13,
    label: { enabled: false, minZoom: 99, fields: [] }
  },
  holds: {
    name: "holds",
    geometryType: "line",
    styleHint: "hold",
    minZoom: 8,
    maxZoom: 13,
    label: { enabled: false, minZoom: 99, fields: [] }
  }
});

const FALLBACK_DESCRIPTOR = Object.freeze({
  name: "unknown",
  geometryType: "mixed",
  styleHint: "default",
  minZoom: 4,
  maxZoom: 14,
  label: { enabled: false, minZoom: 99, fields: [] }
});

export function getDefaultLayerDescriptor(layerName) {
  const key = String(layerName || "").toLowerCase();
  const descriptor = DEFAULT_LAYER_DESCRIPTORS[key];
  if (!descriptor) return { ...FALLBACK_DESCRIPTOR, name: key || "unknown" };
  return {
    ...descriptor,
    label: { ...descriptor.label }
  };
}

export function listDefaultLayerDescriptors() {
  return Object.keys(DEFAULT_LAYER_DESCRIPTORS)
    .sort((a, b) => a.localeCompare(b))
    .map((k) => getDefaultLayerDescriptor(k));
}

export function geometryTypeFromGeometry(geometry) {
  const t = geometry?.type;
  if (t === "Point" || t === "MultiPoint") return "point";
  if (t === "LineString" || t === "MultiLineString") return "line";
  if (t === "Polygon" || t === "MultiPolygon") return "polygon";
  return "mixed";
}
