/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx
 * @param {number} cy
 * @param {number} sides
 * @param {number} radius
 * @param {number} [rot]
 */
export function drawRegularPolygon(ctx, cx, cy, sides, radius, rot = 0) {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = rot + (i * 2 * Math.PI) / sides;
    const x = cx + Math.cos(a) * radius;
    const y = cy + Math.sin(a) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/**
 * Draw ICAO/AIP-like symbol by key.
 * Caller controls context transform and line join/cap setup.
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} key
 * @param {number} cx
 * @param {number} cy
 * @param {number} r
 */
export function drawArincSymbol(ctx, key, cx, cy, r) {
  const blue = "#0f5798";
  const navaidStroke = "#1f1f1f";
  const ndbBrown = "#7a2a00";
  const lw = 0.82;

  const drawFourPointStar = (radiusOuter, radiusInner, fill, stroke = null, lineWidth = 1.5 * lw) => {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 4;
      const rr = i % 2 === 0 ? radiusOuter : radiusInner;
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }
  };

  const drawAirportBase = () => {
    const outer = r + 1.2;
    const inner = r * 0.74;
    ctx.beginPath();
    ctx.arc(cx, cy, outer, 0, Math.PI * 2);
    ctx.arc(cx, cy, inner, 0, Math.PI * 2, true);
    ctx.fillStyle = "#124792";
    ctx.fill("evenodd");
    const tabW = r * 0.44;
    const tabH = r * 0.9;
    ctx.fillRect(cx - tabW / 2, cy - outer - tabH + 1, tabW, tabH);
    ctx.fillRect(cx - tabW / 2, cy + outer - 1, tabW, tabH);
    const sideW = r * 0.86;
    const sideH = r * 0.44;
    ctx.fillRect(cx - outer - sideW + 1, cy - sideH / 2, sideW, sideH);
    ctx.fillRect(cx + outer - 1, cy - sideH / 2, sideW, sideH);
  };

  const drawHeliportBase = () => {
    const outer = r + 1.15;
    ctx.beginPath();
    ctx.arc(cx, cy, outer, 0, Math.PI * 2);
    ctx.strokeStyle = "#124792";
    ctx.lineWidth = 1.45 * lw;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.7, cy - r * 0.9);
    ctx.lineTo(cx - r * 0.7, cy + r * 0.9);
    ctx.moveTo(cx + r * 0.7, cy - r * 0.9);
    ctx.lineTo(cx + r * 0.7, cy + r * 0.9);
    ctx.moveTo(cx - r * 0.7, cy);
    ctx.lineTo(cx + r * 0.7, cy);
    ctx.strokeStyle = "#124792";
    ctx.lineWidth = 1.35 * lw;
    ctx.stroke();
  };

  const drawPrivateSlash = () => {
    ctx.beginPath();
    ctx.moveTo(cx - r * 1.35, cy + r * 1.35);
    ctx.lineTo(cx + r * 1.35, cy - r * 1.35);
    ctx.strokeStyle = "#124792";
    ctx.lineWidth = 1.45 * lw;
    ctx.stroke();
  };

  const drawMilitaryMark = () => {
    // Small central filled lozenge + cross marker to distinguish military/state use.
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.55);
    ctx.lineTo(cx + r * 0.55, cy);
    ctx.lineTo(cx, cy + r * 0.55);
    ctx.lineTo(cx - r * 0.55, cy);
    ctx.closePath();
    ctx.fillStyle = "#124792";
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.9, cy);
    ctx.lineTo(cx + r * 0.9, cy);
    ctx.moveTo(cx, cy - r * 0.9);
    ctx.lineTo(cx, cy + r * 0.9);
    ctx.strokeStyle = "#124792";
    ctx.lineWidth = 1.0 * lw;
    ctx.stroke();
  };

  const drawJointMark = () => {
    drawMilitaryMark();
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.26, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.26, 0, Math.PI * 2);
    ctx.strokeStyle = "#124792";
    ctx.lineWidth = 0.9 * lw;
    ctx.stroke();
  };

  const drawWaterMark = () => {
    ctx.strokeStyle = "#124792";
    ctx.lineWidth = 1.05 * lw;
    const y0 = cy + r * 1.35;
    for (let k = 0; k < 2; k++) {
      const y = y0 + k * r * 0.28;
      ctx.beginPath();
      ctx.moveTo(cx - r * 1.35, y);
      ctx.bezierCurveTo(cx - r * 0.9, y - r * 0.12, cx - r * 0.45, y + r * 0.12, cx, y);
      ctx.bezierCurveTo(cx + r * 0.45, y - r * 0.12, cx + r * 0.9, y + r * 0.12, cx + r * 1.35, y);
      ctx.stroke();
    }
  };

  if (key === "vor") {
    // Flat-top hexagon (aligned with chart symbol orientation).
    drawRegularPolygon(ctx, cx, cy, 6, r + 1.45, 0);
    ctx.strokeStyle = blue;
    ctx.lineWidth = 1.55 * lw;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.2, 0, Math.PI * 2);
    ctx.fillStyle = blue;
    ctx.fill();
  } else if (key === "vor_dme") {
    // VOR/DME: rectangular frame with inner hexagon + center dot.
    ctx.beginPath();
    ctx.rect(cx - r * 1.28, cy - r * 1.02, r * 2.56, r * 2.04);
    ctx.strokeStyle = blue;
    ctx.lineWidth = 1.45 * lw;
    ctx.stroke();
    // Flat-top hexagon so top/bottom sides align with the rectangle.
    drawRegularPolygon(ctx, cx, cy, 6, r * 1.14, 0);
    ctx.strokeStyle = blue;
    ctx.lineWidth = 1.45 * lw;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.2, 0, Math.PI * 2);
    ctx.fillStyle = blue;
    ctx.fill();
  } else if (key === "vortac") {
    // VORTAC: hex ring (flat top/bottom) with attached blocks on top-left, top-right and bottom sides.
    ctx.save();
    ctx.translate(0, r * 0.08);

    const hcY = cy + r * 0.28;
    const outerR = r * 1.02;
    const innerR = r * 0.67;
    const rot = 0; // flat top/bottom, no vertex pointing down

    // Hex ring
    drawRegularPolygon(ctx, cx, hcY, 6, outerR, rot);
    ctx.fillStyle = blue;
    ctx.fill();
    drawRegularPolygon(ctx, cx, hcY, 6, innerR, rot);
    ctx.fillStyle = "#ffffff";
    ctx.fill();

    // Center dot
    ctx.beginPath();
    ctx.arc(cx, hcY, r * 0.24, 0, Math.PI * 2);
    ctx.fillStyle = blue;
    ctx.fill();

    // Helper to build a rectangle attached to a side segment [A,B], offset outward by normal.
    const rectOnSide = (ax, ay, bx, by, tAlong, hOut) => {
      const vx = bx - ax;
      const vy = by - ay;
      const len = Math.hypot(vx, vy) || 1;
      const ux = vx / len;
      const uy = vy / len;
      // Outward normal for clockwise polygon (right-hand normal)
      const nx = uy;
      const ny = -ux;
      const p1x = ax;
      const p1y = ay;
      const p2x = bx;
      const p2y = by;
      const p3x = bx + nx * hOut;
      const p3y = by + ny * hOut;
      const p4x = ax + nx * hOut;
      const p4y = ay + ny * hOut;
      // Trim along side so the block is shorter than full side.
      const trim = (1 - tAlong) * 0.5;
      const q1x = p1x + ux * (len * trim);
      const q1y = p1y + uy * (len * trim);
      const q2x = p2x - ux * (len * trim);
      const q2y = p2y - uy * (len * trim);
      const q3x = q2x + nx * hOut;
      const q3y = q2y + ny * hOut;
      const q4x = q1x + nx * hOut;
      const q4y = q1y + ny * hOut;
      ctx.beginPath();
      ctx.moveTo(q1x, q1y);
      ctx.lineTo(q2x, q2y);
      ctx.lineTo(q3x, q3y);
      ctx.lineTo(q4x, q4y);
      ctx.closePath();
      ctx.fill();
    };

    // Hex vertices for rot=0 (clockwise from right)
    const verts = [];
    for (let i = 0; i < 6; i++) {
      const a = rot + (i * 2 * Math.PI) / 6;
      verts.push([cx + Math.cos(a) * outerR, hcY + Math.sin(a) * outerR]);
    }
    // Sides:
    // 0: right-down, 1: bottom, 2: left-down, 3: left-up, 4: top, 5: right-up (depending on y-down coords)
    // With y-down canvas and rot=0, the visually "upper" slanted sides are 4->5 and 3->4? We target the two
    // upper slanted sides plus the bottom horizontal side.
    // Bottom horizontal side = vertices 1 -> 2
    rectOnSide(verts[1][0], verts[1][1], verts[2][0], verts[2][1], 0.74, r * 0.9);
    // Upper-left slanted side = vertices 3 -> 4
    rectOnSide(verts[3][0], verts[3][1], verts[4][0], verts[4][1], 0.78, r * 0.74);
    // Upper-right slanted side = vertices 5 -> 0
    rectOnSide(verts[5][0], verts[5][1], verts[0][0], verts[0][1], 0.78, r * 0.74);

    ctx.restore();
  } else if (key === "ndb") {
    // Dotted ring + center dot (closer to GEN 2.3 NDB pattern).
    const rows = [r * 1.35, r * 1.0, r * 0.7];
    const counts = [30, 20, 12];
    for (let j = 0; j < rows.length; j++) {
      const rr = rows[j];
      const n = counts[j];
      for (let i = 0; i < n; i++) {
        const a = (i * 2 * Math.PI) / n;
        const x = cx + Math.cos(a) * rr;
        const y = cy + Math.sin(a) * rr;
        ctx.beginPath();
        ctx.arc(x, y, r * (j === 0 ? 0.095 : 0.09), 0, Math.PI * 2);
        ctx.fillStyle = ndbBrown;
        ctx.fill();
      }
    }
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.22, 0, Math.PI * 2);
    ctx.fillStyle = ndbBrown;
    ctx.fill();
  } else if (key === "fix_comp") {
    drawFourPointStar(r * 1.55, r * 0.92, blue);
  } else if (key === "fix") {
    drawFourPointStar(r * 1.55, r * 0.9, "#ffffff", blue, 1.9 * lw);
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.82, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = blue;
    ctx.lineWidth = 1.45 * lw;
    ctx.stroke();
  } else if (key === "airport") {
    drawAirportBase();
  } else if (key === "airport_private") {
    drawAirportBase();
  } else if (key === "airport_mil") {
    drawAirportBase();
    drawMilitaryMark();
  } else if (key === "airport_joint") {
    drawAirportBase();
    drawJointMark();
  } else if (key === "airport_water") {
    drawAirportBase();
    drawWaterMark();
  } else if (key === "heliport") {
    // Heliport: circled H.
    drawHeliportBase();
  } else if (key === "heliport_private") {
    drawHeliportBase();
  } else if (key === "heliport_mil") {
    drawHeliportBase();
    drawMilitaryMark();
  } else if (key === "heliport_joint") {
    drawHeliportBase();
    drawJointMark();
  } else if (key === "heliport_water") {
    drawHeliportBase();
    drawWaterMark();
  } else if (key === "runway") {
    // Short blue bar + thin gray baseline.
    ctx.beginPath();
    ctx.moveTo(cx - r * 1.6, cy - r * 0.54);
    ctx.lineTo(cx + r * 1.6, cy - r * 0.54);
    ctx.strokeStyle = "#8d8d8d";
    ctx.lineWidth = 0.95 * lw;
    ctx.stroke();
    ctx.beginPath();
    ctx.rect(cx - r * 1.05, cy - r * 0.48, r * 2.1, r * 0.34);
    ctx.fillStyle = "#2a34a0";
    ctx.fill();
  } else if (key === "obst") {
    // Obstacle/group marker: blue A-frame (and optional second frame) + base dot.
    ctx.strokeStyle = blue;
    ctx.lineWidth = 1.65 * lw;
    ctx.beginPath();
    ctx.moveTo(cx - r * 1.05, cy + r * 1.25);
    ctx.lineTo(cx, cy - r * 1.15);
    ctx.lineTo(cx + r * 1.05, cy + r * 1.25);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy + r * 1.45, r * 0.17, 0, Math.PI * 2);
    ctx.fillStyle = blue;
    ctx.fill();
  } else if (key === "obst_group") {
    // Group obstacles: two A-frames + two base dots.
    ctx.strokeStyle = blue;
    ctx.lineWidth = 1.6 * lw;
    const drawFrame = (ox) => {
      ctx.beginPath();
      ctx.moveTo(cx + ox - r * 0.9, cy + r * 1.25);
      ctx.lineTo(cx + ox, cy - r * 1.05);
      ctx.lineTo(cx + ox + r * 0.9, cy + r * 1.25);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx + ox, cy + r * 1.42, r * 0.15, 0, Math.PI * 2);
      ctx.fillStyle = blue;
      ctx.fill();
    };
    drawFrame(-r * 0.72);
    drawFrame(r * 0.72);
  } else if (key === "obst_lit") {
    // Lighted obstacle: A-frame + light rays at apex + base dot.
    ctx.strokeStyle = blue;
    ctx.lineWidth = 1.65 * lw;
    const apexX = cx;
    const apexY = cy - r * 1.05;
    ctx.beginPath();
    ctx.moveTo(cx - r * 1.25, cy + r * 1.3);
    ctx.lineTo(apexX, apexY);
    ctx.lineTo(cx + r * 1.25, cy + r * 1.3);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy + r * 1.45, r * 0.17, 0, Math.PI * 2);
    ctx.fillStyle = blue;
    ctx.fill();
    // Rays (top + diagonals + horizontals), matching reference feel.
    const ray = (x1, y1, x2, y2) => {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    };
    ray(apexX, apexY - r * 0.65, apexX, apexY - r * 0.1);
    ray(apexX - r * 0.95, apexY + r * 0.05, apexX - r * 0.3, apexY + r * 0.05);
    ray(apexX + r * 0.3, apexY + r * 0.05, apexX + r * 0.95, apexY + r * 0.05);
    ray(apexX - r * 0.7, apexY - r * 0.55, apexX - r * 0.22, apexY - r * 0.12);
    ray(apexX + r * 0.22, apexY - r * 0.12, apexX + r * 0.7, apexY - r * 0.55);
  } else if (key === "obst_group_lit") {
    // Lighted group obstacles: two A-frames, two dots, and a light crown.
    ctx.strokeStyle = blue;
    ctx.lineWidth = 1.6 * lw;
    const apexes = [];
    const drawFrame = (ox) => {
      const apexX = cx + ox;
      const apexY = cy - r * 1.0;
      apexes.push([apexX, apexY]);
      ctx.beginPath();
      ctx.moveTo(cx + ox - r * 0.95, cy + r * 1.25);
      ctx.lineTo(apexX, apexY);
      ctx.lineTo(cx + ox + r * 0.95, cy + r * 1.25);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx + ox, cy + r * 1.42, r * 0.15, 0, Math.PI * 2);
      ctx.fillStyle = blue;
      ctx.fill();
    };
    drawFrame(-r * 0.78);
    drawFrame(r * 0.78);
    // Top bridge/crown and rays.
    ctx.beginPath();
    ctx.moveTo(apexes[0][0] + r * 0.18, apexes[0][1] - r * 0.1);
    ctx.lineTo(cx, cy - r * 1.55);
    ctx.lineTo(apexes[1][0] - r * 0.18, apexes[1][1] - r * 0.1);
    ctx.stroke();
    const ray = (x1, y1, x2, y2) => {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    };
    ray(apexes[0][0], apexes[0][1] - r * 0.55, apexes[0][0], apexes[0][1] - r * 0.1);
    ray(apexes[1][0], apexes[1][1] - r * 0.55, apexes[1][0], apexes[1][1] - r * 0.1);
  } else if (key === "wind_farm") {
    // Wind farm marker: 3 filled blades + hub.
    const black = "#171115";
    const hubX = cx;
    const hubY = cy - r * 0.2;
    const bladePoly = (pts) => {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath();
      ctx.fillStyle = black;
      ctx.fill();
    };
    // Top blade
    bladePoly([
      [hubX - r * 0.14, hubY - r * 0.05],
      [hubX + r * 0.14, hubY - r * 0.05],
      [hubX + r * 0.05, hubY - r * 2.15],
      [hubX - r * 0.05, hubY - r * 2.15]
    ]);
    // Lower blade
    bladePoly([
      [hubX - r * 0.13, hubY + r * 0.18],
      [hubX + r * 0.13, hubY + r * 0.18],
      [hubX + r * 0.28, hubY + r * 2.9],
      [hubX - r * 0.28, hubY + r * 2.9]
    ]);
    // Right blade
    bladePoly([
      [hubX + r * 0.18, hubY - r * 0.08],
      [hubX + r * 0.32, hubY + r * 0.12],
      [hubX + r * 2.55, hubY + r * 1.0],
      [hubX + r * 2.35, hubY + r * 0.7]
    ]);
    // Left blade
    bladePoly([
      [hubX - r * 0.18, hubY - r * 0.08],
      [hubX - r * 0.32, hubY + r * 0.12],
      [hubX - r * 2.55, hubY + r * 1.0],
      [hubX - r * 2.35, hubY + r * 0.7]
    ]);
    ctx.beginPath();
    ctx.arc(hubX, hubY, r * 0.23, 0, Math.PI * 2);
    ctx.fillStyle = black;
    ctx.fill();
  } else if (key === "vfr_report") {
    // VFR reporting point (request/on-request): orange outlined triangle.
    drawRegularPolygon(ctx, cx, cy, 3, r * 1.2, -Math.PI / 2);
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.fill();
    ctx.strokeStyle = "#cc5a00";
    ctx.lineWidth = 1.5 * lw;
    ctx.stroke();
  } else if (key === "vfr_report_comp") {
    // VFR reporting point (compulsory): filled orange triangle.
    drawRegularPolygon(ctx, cx, cy, 3, r * 1.2, -Math.PI / 2);
    ctx.fillStyle = "#cc5a00";
    ctx.fill();
    ctx.strokeStyle = "#8a3a00";
    ctx.lineWidth = 1.2 * lw;
    ctx.stroke();
    // Inner white triangle keeps the shape legible at small sizes while remaining filled.
    drawRegularPolygon(ctx, cx, cy + r * 0.03, 3, r * 0.65, -Math.PI / 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = "#111111";
    ctx.lineWidth = 1.5 * lw;
    ctx.stroke();
  }
}
