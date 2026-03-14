function toFiniteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function classifyAirspace(feature) {
  const p = feature.properties ?? {};
  const t = String(p.airspaceType ?? "").toLowerCase();
  if (t.includes("fir") || t.includes("uir")) return "UF";
  if (p.restrictiveType) return "UR";
  return "UC";
}

function toAirspaceLayerCollection(features, layerCode) {
  return {
    type: "FeatureCollection",
    features: features.map((f) => {
      const p = f.properties ?? {};
      const lower = toFiniteNumber(p.lowerLimit ?? p.lowerLimitM ?? p.lower_m_effective, 0);
      const upper = toFiniteNumber(p.upperLimit ?? p.upperLimitM ?? p.upper_m_effective ?? p.fir_upper_m, 0);
      return {
        type: "Feature",
        geometry: f.geometry,
        properties: {
          ...p,
          type: layerCode,
          lower_m_effective: lower,
          upper_m_effective: upper,
          sourceFeatureId: f.id
        }
      };
    })
  };
}

/**
 * Prepare grouped airspace geometry collections from normalized features.
 * @param {object[]} airspaceFeatures
 * @returns {{grouped:Record<string, object[]>, collections:Record<string, object>, stats:object}}
 */
export function prepareAirspaceGeometry(airspaceFeatures) {
  const grouped = { UC: [], UR: [], UF: [] };

  for (const feature of airspaceFeatures ?? []) {
    const code = classifyAirspace(feature);
    grouped[code].push(feature);
  }

  const collections = {};
  for (const code of ["UC", "UR", "UF"]) {
    if (!grouped[code].length) continue;
    collections[code] = toAirspaceLayerCollection(grouped[code], code);
  }

  return {
    grouped,
    collections,
    stats: {
      totalAirspaces: airspaceFeatures.length,
      byType: {
        UC: grouped.UC.length,
        UR: grouped.UR.length,
        UF: grouped.UF.length
      }
    }
  };
}
