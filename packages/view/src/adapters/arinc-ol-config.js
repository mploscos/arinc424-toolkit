export const ARINC_OL_THEME = {
  aipProfile: {
    lines: {
      ER: {
        RNAV: { dash: [], z: 18 },
        OTC: { dash: [8, 7], z: 12 },
        CONVENTIONAL: { dash: [5, 6], z: 13 }
      },
      PD: { dash: [], z: 17 },
      PE: { dash: [10, 5], z: 17 },
      PF: { dash: [10, 4, 2, 4], z: 17 },
      EP: { dash: [10, 6], z: 16 },
      ET: { dash: [14, 6], z: 16 }
    },
    labels: {
      ER: { minZoom: 11 },
      PD: { minZoom: 14 },
      PE: { minZoom: 14 },
      PF: { minZoom: 15 },
      ET: { minZoom: 11 },
      UC: { minZoom: 8 },
      UR: { minZoom: 8 },
      UF: { minZoom: 8 },
      PA: { minZoom: 9 },
      D: { minZoom: 9 },
      DB: { minZoom: 9 },
      EA: { minZoom: 10 },
      PC: { minZoom: 10 },
      PG: { minZoom: 14 },
      EP: { minZoom: 14 },
      OBST: { minZoom: 12 },
      OBST_AREA: { minZoom: 11 }
    }
  },
  navaid: {
    vorRoseMinZoom: 10
  },
  webgl: {
    line: {
      stroke: {
        erFamily: {
          RNAV: "#00a7c7",
          OTC: "#4c5a66",
          default: "#5d6770"
        },
        byType: {
          PD: "#8a4f00",
          PE: "#7d145b",
          PF: "#9b1c1c",
          EP: "#2f7d58",
          ET: "#365f10",
          UF: "#6b4fb3"
        },
        ucByClass: {
          A: "#003d73",
          B: "#005da8",
          C: "#1d78b5",
          D: "#2d8fc3",
          E: "#4aa3cf",
          F: "#6bb7d9",
          G: "#6f7b86",
          default: "#3f86b5"
        },
        urByType: {
          A: "#b71c1c",
          C: "#cc5500",
          F: "#546e7a",
          G: "#6d6d6d",
          K: "#5e4fa2",
          T: "#00796b",
          U: "#455a9c",
          P: "#a61b1b",
          R: "#0d5c96",
          D: "#a14f87",
          W: "#9a5c00",
          M: "#8a5d2f",
          default: "#a56f2c"
        },
        default: "#444444"
      },
      width: {
        erFamily: {
          RNAV: 2.1,
          OTC: 1.4,
          default: 1.3
        },
        byType: {
          PD: 1.6,
          PE: 1.6,
          PF: 1.8,
          EP: 1.5,
          ET: 1.5,
          UC: 1.4,
          UR: 1.4,
          UF: 1.3
        },
        default: 1.2
      },
      fill: {
        ucByClass: {
          A: "rgba(0,61,115,0.08)",
          B: "rgba(0,93,168,0.07)",
          C: "rgba(29,120,181,0.06)",
          D: "rgba(45,143,195,0.08)",
          E: "rgba(74,163,207,0.08)",
          F: "rgba(107,183,217,0.08)",
          G: "rgba(111,123,134,0.09)",
          default: "rgba(63,134,181,0.06)"
        },
        urByType: {
          A: "rgba(183,28,28,0.12)",
          C: "rgba(204,85,0,0.11)",
          F: "rgba(84,110,122,0.10)",
          G: "rgba(109,109,109,0.10)",
          K: "rgba(94,79,162,0.10)",
          T: "rgba(0,121,107,0.10)",
          U: "rgba(69,90,156,0.10)",
          P: "rgba(166,27,27,0.20)",
          R: "rgba(164,54,134,0.20)",
          D: "rgba(161,79,135,0.10)",
          W: "rgba(154,92,0,0.09)",
          M: "rgba(138,93,47,0.08)",
          default: "rgba(165,111,44,0.09)"
        },
        uf: "rgba(107,79,179,0.06)",
        default: "rgba(0,0,0,0)"
      }
    },
    point: {
      radiusByType: {
        PA: 5,
        PG: 4,
        D: 4,
        DB: 4,
        EA: 3,
        PC: 3,
        default: 3
      },
      fillByType: {
        PA: "#ffffff",
        PG: "#2b2b2b",
        D: "#111111",
        DB: "#7a4b16",
        EA: "#ffffff",
        PC: "#ffffff",
        default: "#ffffff"
      },
      strokeByType: {
        D: "#000000",
        DB: "#4b2e0d",
        PA: "#1a1a1a",
        default: "#111111"
      },
      strokeWidth: 1.1
    },
    unusable: {
      strokeColor: "rgba(100,100,100,0.95)",
      strokeWidth: 2.6,
      strokeDash: [10, 8]
    },
    otc: {
      strokeColor: "rgba(88,98,108,0.9)",
      strokeWidth: 1.4,
      strokeDash: [8, 7]
    },
    specialAirspace: {
      stroke: {
        ucByClass: {
          A: "rgba(0,61,115,0.98)",
          B: "rgba(0,93,168,0.98)",
          C: "rgba(29,120,181,0.98)",
          D: "rgba(45,143,195,0.90)",
          E: "rgba(74,163,207,0.92)",
          F: "rgba(107,183,217,0.92)",
          G: "rgba(111,123,134,0.92)",
          default: "rgba(45,143,195,0.90)"
        },
        urByType: {
          A: "rgba(183,28,28,0.95)",
          C: "rgba(204,85,0,0.95)",
          F: "rgba(84,110,122,0.95)",
          G: "rgba(109,109,109,0.95)",
          K: "rgba(94,79,162,0.95)",
          T: "rgba(0,121,107,0.95)",
          U: "rgba(69,90,156,0.95)",
          P: "rgba(183,28,28,0.98)",
          R: "rgba(164,54,134,0.98)",
          D: "rgba(161,79,135,0.95)",
          W: "rgba(191,122,0,0.95)",
          M: "rgba(138,93,47,0.95)",
          default: "rgba(165,111,44,0.95)"
        },
        uf: "rgba(107,79,179,0.95)"
      },
      strokeWidth: {
        uf: 1.4,
        uc: 2.3,
        default: 1.8
      },
      strokeDash: [6, 4],
      fill: {
        ucByClass: {
          A: "rgba(0,61,115,0.08)",
          B: "rgba(0,93,168,0.07)",
          C: "rgba(29,120,181,0.06)",
          D: "rgba(45,143,195,0.09)",
          E: "rgba(74,163,207,0.10)",
          F: "rgba(107,183,217,0.10)",
          G: "rgba(111,123,134,0.11)",
          default: "rgba(45,143,195,0.06)"
        },
        urByType: {
          A: "rgba(183,28,28,0.12)",
          C: "rgba(204,85,0,0.11)",
          F: "rgba(84,110,122,0.10)",
          G: "rgba(109,109,109,0.10)",
          K: "rgba(94,79,162,0.10)",
          T: "rgba(0,121,107,0.10)",
          U: "rgba(69,90,156,0.10)",
          P: "rgba(183,28,28,0.20)",
          R: "rgba(164,54,134,0.20)",
          D: "rgba(161,79,135,0.11)",
          W: "rgba(191,122,0,0.10)",
          M: "rgba(138,93,47,0.10)",
          default: "rgba(165,111,44,0.10)"
        },
        uf: "rgba(107,79,179,0.07)"
      }
    }
  },
  labelOffsets: {
    point: {
      pa: [18, -5],
      pg: [16, -3],
      d: [18, -1],
      db: [18, -1],
      eaPc: [14, -11],
      default: [10, -7]
    }
  },
  repeatedLineLabels: {
    spacing: 75_000,
    maxPerFeature: 7
  },
  chartPhases: {
    airways: { min: -Infinity, max: 10.999 },
    arrival: { min: 11, max: 12.999 },
    approach: { min: 13, max: Infinity }
  },
  fixUsageMinZoom: {
    airway_and_procedure: 9,
    airway_only: 10,
    procedure_only: 11,
    none: 13
  },
  tileZoomByType: {
    UF: { min: 4 },
    PA: { min: 9 },
    D: { min: 9 },
    DB: { min: 9 },
    UC: { min: 8 },
    UR: { min: 8 },
    ER: { min: 10 },
    EA: { min: 10 },
    PC: { min: 10 },
    PG: { min: 14 },
    EP: { min: 13 },
    ET: { min: 11 },
    PD: { min: 13 },
    PE: { min: 13 },
    PF: { min: 14 },
    OBST: { min: 12 },
    OBST_AREA: { min: 11 }
  },
  tileDataMaxZoom: 8
  
};
