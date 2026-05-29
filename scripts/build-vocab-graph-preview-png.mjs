#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const WIDTH = 1800;
const HEIGHT = 1200;
const PADDING = 110;

const BG = [245, 248, 252, 255];
const EDGE_COLORS = {
  subClassOf: [31, 111, 146, 150],
  domain: [47, 128, 64, 145],
  range: [171, 107, 34, 145],
  conceptOf: [123, 92, 167, 150],
  annotation: [166, 67, 67, 145]
};

const NODE_COLORS = {
  class: [183, 220, 246, 255],
  scopeConcept: [211, 197, 246, 255],
  enforcementConcept: [246, 197, 230, 255],
  metricConcept: [197, 246, 238, 255],
  objectProperty: [190, 231, 195, 255],
  datatypeProperty: [247, 215, 171, 255],
  annotationProperty: [242, 190, 191, 255],
  concept: [216, 206, 233, 255],
  external: [223, 230, 238, 255]
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function parseHexBytepairToInt(bytepair) {
  return parseInt(bytepair, 16);
}

function toRgbaFromHex(hex, alpha = 255) {
  const source = hex.startsWith("#") ? hex.slice(1) : hex;
  const normalized = source.length === 3
    ? source.split("").map((part) => part + part).join("")
    : source;
  return [
    parseHexBytepairToInt(normalized.slice(0, 2)),
    parseHexBytepairToInt(normalized.slice(2, 4)),
    parseHexBytepairToInt(normalized.slice(4, 6)),
    alpha
  ];
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];
    for (let j = 0; j < 8; j += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32BE(data.length, 0);
  const crcBuffer = Buffer.alloc(4);
  const crcValue = crc32(Buffer.concat([typeBuffer, data]));
  crcBuffer.writeUInt32BE(crcValue, 0);
  return Buffer.concat([lengthBuffer, typeBuffer, data, crcBuffer]);
}

function encodePng({ width, height, rgba }) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);

  for (let y = 0; y < height; y += 1) {
    const rawOffset = y * (stride + 1);
    raw[rawOffset] = 0;
    rgba.copy(raw, rawOffset + 1, y * stride, (y + 1) * stride);
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const compressed = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", compressed),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

function blendPixel(buffer, width, height, x, y, rgba) {
  const xi = Math.round(x);
  const yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= width || yi >= height) {
    return;
  }
  const index = (yi * width + xi) * 4;
  const srcA = rgba[3] / 255;
  const dstA = buffer[index + 3] / 255;
  const outA = srcA + dstA * (1 - srcA);
  if (outA <= 0) {
    return;
  }

  for (let channel = 0; channel < 3; channel += 1) {
    const src = rgba[channel] / 255;
    const dst = buffer[index + channel] / 255;
    const out = (src * srcA + dst * dstA * (1 - srcA)) / outA;
    buffer[index + channel] = Math.round(out * 255);
  }
  buffer[index + 3] = Math.round(outA * 255);
}

function drawDisk(buffer, width, height, cx, cy, radius, rgba) {
  const r2 = radius * radius;
  const minX = Math.floor(cx - radius);
  const maxX = Math.ceil(cx + radius);
  const minY = Math.floor(cy - radius);
  const maxY = Math.ceil(cy + radius);

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) {
        blendPixel(buffer, width, height, x, y, rgba);
      }
    }
  }
}

function drawLine(buffer, width, height, x1, y1, x2, y2, thickness, rgba) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const steps = Math.max(Math.abs(dx), Math.abs(dy), 1);
  const stepX = dx / steps;
  const stepY = dy / steps;

  for (let i = 0; i <= steps; i += 1) {
    const x = x1 + stepX * i;
    const y = y1 + stepY * i;
    drawDisk(buffer, width, height, x, y, thickness / 2, rgba);
  }
}

function drawArrowhead(buffer, width, height, x1, y1, x2, y2, size, rgba) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const left = angle + Math.PI * 0.78;
  const right = angle - Math.PI * 0.78;
  const lx = x2 + Math.cos(left) * size;
  const ly = y2 + Math.sin(left) * size;
  const rx = x2 + Math.cos(right) * size;
  const ry = y2 + Math.sin(right) * size;
  drawLine(buffer, width, height, x2, y2, lx, ly, 1.4, rgba);
  drawLine(buffer, width, height, x2, y2, rx, ry, 1.4, rgba);
}

function relaxLayout(initialCoords, nodes, edges, width, height, padding) {
  const nodeIndex = new Map(nodes.map((node, idx) => [node.id, idx]));
  const coords = nodes.map((node) => {
    const base = initialCoords.get(node.id);
    return { x: base.x, y: base.y };
  });
  const anchors = coords.map((point) => ({ x: point.x, y: point.y }));
  const displacements = coords.map(() => ({ x: 0, y: 0 }));
  const minDistance = 36;
  const repulsion = 12500;
  const springStrength = 0.012;
  const anchorStrength = 0.024;
  const step = 0.19;
  const maxMove = 16;
  const targetLength = 168;

  for (let iter = 0; iter < 280; iter += 1) {
    for (const disp of displacements) {
      disp.x = 0;
      disp.y = 0;
    }

    for (let i = 0; i < coords.length; i += 1) {
      const a = coords[i];
      for (let j = i + 1; j < coords.length; j += 1) {
        const b = coords[j];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1e-6) {
          dx = (i % 3) - 1;
          dy = (j % 3) - 1;
          d2 = dx * dx + dy * dy + 1e-6;
        }
        const dist = Math.sqrt(d2);
        let force = repulsion / d2;
        if (dist < minDistance) {
          force += ((minDistance - dist) / minDistance) * 1.7;
        }
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        displacements[i].x += fx;
        displacements[i].y += fy;
        displacements[j].x -= fx;
        displacements[j].y -= fy;
      }
    }

    for (const edge of edges) {
      const i = nodeIndex.get(edge.source);
      const j = nodeIndex.get(edge.target);
      if (i == null || j == null) {
        continue;
      }
      const a = coords[i];
      const b = coords[j];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let dist = Math.hypot(dx, dy);
      if (dist < 1e-6) {
        dist = 1e-6;
        dx = 1;
        dy = 0;
      }
      const delta = dist - targetLength;
      const force = springStrength * delta;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      displacements[i].x += fx;
      displacements[i].y += fy;
      displacements[j].x -= fx;
      displacements[j].y -= fy;
    }

    for (let i = 0; i < coords.length; i += 1) {
      const anchor = anchors[i];
      displacements[i].x += (anchor.x - coords[i].x) * anchorStrength;
      displacements[i].y += (anchor.y - coords[i].y) * anchorStrength;
    }

    for (let i = 0; i < coords.length; i += 1) {
      const disp = displacements[i];
      let moveX = disp.x * step;
      let moveY = disp.y * step;
      const moveMag = Math.hypot(moveX, moveY);
      if (moveMag > maxMove) {
        moveX = (moveX / moveMag) * maxMove;
        moveY = (moveY / moveMag) * maxMove;
      }
      coords[i].x = clamp(coords[i].x + moveX, padding, width - padding);
      coords[i].y = clamp(coords[i].y + moveY, padding, height - padding);
    }
  }

  return new Map(nodes.map((node, idx) => [node.id, coords[idx]]));
}

function main() {
  const repoRoot = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
  const assetsDir = path.join(repoRoot, "docs", "assets");
  const graphPath = path.join(assetsDir, "vocab_graph_data.json");
  const outputPath = path.join(assetsDir, "vocab_graph_preview.png");

  if (!fs.existsSync(graphPath)) {
    throw new Error(`Missing graph data: ${graphPath}`);
  }

  const graphData = JSON.parse(fs.readFileSync(graphPath, "utf8"));
  const nodes = graphData.nodes || [];
  const edges = graphData.edges || [];
  if (!nodes.length) {
    throw new Error("No nodes found in graph data.");
  }

  const xs = nodes.map((node) => node.x);
  const ys = nodes.map((node) => node.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(maxX - minX, 1);
  const spanY = Math.max(maxY - minY, 1);
  const scale = Math.min((WIDTH - PADDING * 2) / spanX, (HEIGHT - PADDING * 2) / spanY);

  const project = (node) => ({
    x: (node.x - minX) * scale + PADDING,
    y: (node.y - minY) * scale + PADDING
  });

  const projected = new Map(nodes.map((node) => [node.id, project(node)]));
  const coordinates = relaxLayout(projected, nodes, edges, WIDTH, HEIGHT, PADDING);
  const image = Buffer.alloc(WIDTH * HEIGHT * 4);
  for (let i = 0; i < image.length; i += 4) {
    image[i] = BG[0];
    image[i + 1] = BG[1];
    image[i + 2] = BG[2];
    image[i + 3] = BG[3];
  }

  for (const edge of edges) {
    const source = coordinates.get(edge.source);
    const target = coordinates.get(edge.target);
    if (!source || !target) {
      continue;
    }
    const color = EDGE_COLORS[edge.relation] || [111, 131, 148, 140];
    drawLine(image, WIDTH, HEIGHT, source.x, source.y, target.x, target.y, 1.6, color);
    drawArrowhead(image, WIDTH, HEIGHT, source.x, source.y, target.x, target.y, 5.5, color);
  }

  for (const node of nodes) {
    const point = coordinates.get(node.id);
    if (!point) {
      continue;
    }
    const fill = NODE_COLORS[node.termType] || toRgbaFromHex("#dfe6ee");
    const stroke = [32, 56, 78, 210];
    const radius = node.isExternal ? 4.6 : 6.2;
    drawDisk(image, WIDTH, HEIGHT, point.x, point.y, radius + 1.4, stroke);
    drawDisk(image, WIDTH, HEIGHT, point.x, point.y, radius, fill);
  }

  fs.mkdirSync(assetsDir, { recursive: true });
  const png = encodePng({ width: WIDTH, height: HEIGHT, rgba: image });
  fs.writeFileSync(outputPath, png);
  console.log(`Wrote ${path.relative(repoRoot, outputPath)}`);
}

main();
