const DEFAULT_LAYER_DESCRIPTORS = Object.freeze({
  airports: {
    name: "airports",
    geometryType: "point",
    styleHint: "airport",
    minZoom: 4,
    maxZoom: 22,
    label: { enabled: true, minZoom: 7, priority: 98, fields: ["ident", "name", "id"] }
  },
  heliports: {
    name: "heliports",
    geometryType: "point",
    styleHint: "heliport",
    minZoom: 6,
    maxZoom: 22,
    label: { enabled: true, minZoom: 11, priority: 36, fields: ["ident", "name", "id"] }
  },
  runways: {
    name: "runways",
    geometryType: "line",
    styleHint: "runway",
    minZoom: 10,
    maxZoom: 22,
    label: { enabled: false, minZoom: 99, priority: 0, fields: [] }
  },
  waypoints: {
    name: "waypoints",
    geometryType: "point",
    styleHint: "waypoint",
    minZoom: 9,
    maxZoom: 22,
    label: { enabled: true, minZoom: 12, priority: 24, fields: ["ident", "name", "id"] }
  },
  navaids: {
    name: "navaids",
    geometryType: "point",
    styleHint: "navaid",
    minZoom: 8,
    maxZoom: 22,
    label: { enabled: true, minZoom: 11, priority: 34, fields: ["ident", "name", "id"] }
  },
  airways: {
    name: "airways",
    geometryType: "line",
    styleHint: "airway",
    minZoom: 10,
    maxZoom: 22,
    label: { enabled: true, minZoom: 10, priority: 54, fields: ["airwayName", "name", "id"] }
  },
  airspaces: {
    name: "airspaces",
    geometryType: "polygon",
    styleHint: "airspace",
    minZoom: 4,
    maxZoom: 22,
    label: { enabled: true, minZoom: 7, priority: 120, fields: ["name", "airspaceClass", "id"] }
  },
  procedures: {
    name: "procedures",
    geometryType: "line",
    styleHint: "procedure",
    minZoom: 7,
    maxZoom: 22,
    label: { enabled: true, minZoom: 9, priority: 56, fields: ["procedureName", "name", "ident", "procedureId", "id"] }
  },
  procedure: {
    name: "procedure",
    geometryType: "line",
    styleHint: "procedure",
    minZoom: 7,
    maxZoom: 22,
    label: { enabled: true, minZoom: 9, priority: 56, fields: ["procedureName", "name", "ident", "procedureId", "id"] }
  },
  holds: {
    name: "holds",
    geometryType: "line",
    styleHint: "hold",
    minZoom: 12,
    maxZoom: 22,
    label: { enabled: false, minZoom: 99, priority: 0, fields: [] }
  },
  "procedure-annotations": {
    name: "procedure-annotations",
    geometryType: "point",
    styleHint: "procedure-annotation",
    minZoom: 10,
    maxZoom: 22,
    label: { enabled: true, minZoom: 10, priority: 72, fields: ["annotationText", "procedureId", "id"] }
  },
  "procedure-editorial": {
    name: "procedure-editorial",
    geometryType: "point",
    styleHint: "procedure-editorial",
    minZoom: 11,
    maxZoom: 22,
    label: { enabled: false, minZoom: 99, priority: 0, fields: [] }
  }
});

const FALLBACK_DESCRIPTOR = Object.freeze({
  name: "unknown",
  geometryType: "mixed",
  styleHint: "default",
  minZoom: 4,
  maxZoom: 22,
  label: { enabled: false, minZoom: 99, priority: 0, fields: [] }
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
