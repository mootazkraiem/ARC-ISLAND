#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// ARC ISLAND — system seal emblem generator.
//
// Produces every icon asset the app ships, from one vector definition, with
// ZERO dependencies: Node's built-in zlib writes the PNG, and the shapes are
// rasterized here from signed distance fields with 4x4 supersampling (so
// edges are properly antialiased without a canvas library).
//
// Why generate rather than hand-draw: the same emblem has to appear as a
// 1024px app icon, a 96px white-silhouette Android status-bar icon, and a
// web favicon. Deriving all of them from one definition is the only way
// they stay genuinely identical rather than approximately similar.
//
// THE MARK (original artwork, authored for Arc Island):
//   - an outer SEAL RING, broken at four points — a system boundary, not a
//     solid disc
//   - an inner ring, thinner, continuous
//   - an ASCENDING CHEVRON through the centre — the direction of travel
//   - four RADIATING TICKS on the cardinal axes — a signal being broadcast
//   - for the full-colour icon: a violet-to-cyan vertical gradient, a
//     volumetric bloom behind the ring, and corner brackets matching the
//     app's own SystemPanel chrome
//
// It reads as "the System has summoned you", not "you have a reminder".
// Nothing here derives from any existing character, logo, or artwork.
//
// Usage: node scripts/generate-emblem.js
// ─────────────────────────────────────────────────────────────────────────

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, '..', 'assets');

// ── PNG encoding ─────────────────────────────────────────────────────────

function crc32(buf) {
  let c;
  const table = crc32.table || (crc32.table = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })());
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/** rgba: Uint8ClampedArray of size w*h*4 */
function encodePNG(rgba, w, h) {
  const stride = w * 4;
  // One filter byte (0 = None) per scanline, as the PNG spec requires.
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── geometry helpers (all in normalized 0..1 space, origin top-left) ─────

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

function dSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const len2 = vx * vx + vy * vy;
  let t = len2 === 0 ? 0 : (wx * vx + wy * vy) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + t * vx;
  const cy = ay + t * vy;
  return Math.hypot(px - cx, py - cy);
}

/** Distance to a ring of radius r centred at (cx,cy), optionally broken:
 * `gaps` are [startAngle, endAngle] pairs in radians where the ring is
 * absent. Angles measured from +x axis, counter-clockwise in screen terms. */
function dRing(px, py, cx, cy, r, gaps) {
  const dx = px - cx;
  const dy = py - cy;
  const dist = Math.hypot(dx, dy);
  if (gaps && gaps.length) {
    let a = Math.atan2(dy, dx);
    if (a < 0) a += Math.PI * 2;
    for (const [g0, g1] of gaps) {
      if (a >= g0 && a <= g1) return Infinity;
    }
  }
  return Math.abs(dist - r);
}

// ── the mark ─────────────────────────────────────────────────────────────

const TAU = Math.PI * 2;
// Four small breaks in the outer ring, on the diagonals — the seal is a
// boundary with gates, not a closed circle.
const RING_GAPS = [0.125, 0.375, 0.625, 0.875].map((f) => [
  (f - 0.028) * TAU,
  (f + 0.028) * TAU,
]);

/** Ink coverage of the mark at normalized point (x,y), 0..1.
 * `s` scales stroke weights so small renders stay legible. */
function markCoverage(x, y, s) {
  const cx = 0.5;
  const cy = 0.5;
  let cov = 0;

  const aa = 0.0016 * s; // antialias width

  const stroke = (d, halfWidth) => clamp01((halfWidth - d) / aa + 0.5);

  // outer seal ring (broken)
  cov = Math.max(cov, stroke(dRing(x, y, cx, cy, 0.335, RING_GAPS), 0.0175 * s));
  // inner ring, continuous and thinner
  cov = Math.max(cov, stroke(dRing(x, y, cx, cy, 0.212, null), 0.0085 * s));

  // ascending chevron — the direction of travel
  const chevW = 0.019 * s;
  const cd = Math.min(
    dSegment(x, y, 0.392, 0.565, 0.5, 0.437),
    dSegment(x, y, 0.5, 0.437, 0.608, 0.565)
  );
  cov = Math.max(cov, stroke(cd, chevW));

  // four radiating ticks on the cardinal axes
  const tickW = 0.0125 * s;
  const ticks = [
    [0.5, 0.075, 0.5, 0.145],
    [0.5, 0.855, 0.5, 0.925],
    [0.075, 0.5, 0.145, 0.5],
    [0.855, 0.5, 0.925, 0.5],
  ];
  for (const [ax, ay, bx, by] of ticks) {
    cov = Math.max(cov, stroke(dSegment(x, y, ax, ay, bx, by), tickW));
  }

  return cov;
}

/** Corner brackets, matching the app's SystemPanel chrome. Icon only. */
function bracketCoverage(x, y, s) {
  const aa = 0.0016 * s;
  const w = 0.011 * s;
  const m = 0.085; // margin from edge
  const arm = 0.115;
  let cov = 0;
  const corners = [
    [m, m, 1, 1],
    [1 - m, m, -1, 1],
    [m, 1 - m, 1, -1],
    [1 - m, 1 - m, -1, -1],
  ];
  for (const [ox, oy, sx, sy] of corners) {
    const d = Math.min(
      dSegment(x, y, ox, oy, ox + sx * arm, oy),
      dSegment(x, y, ox, oy, ox, oy + sy * arm)
    );
    cov = Math.max(cov, clamp01((w - d) / aa + 0.5));
  }
  return cov;
}

// ── render ───────────────────────────────────────────────────────────────

const SS = 4; // supersampling factor per axis

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * mode 'mono'   — flat white mark on transparent (Android notification icon:
 *                 the platform tints it and ignores colour, so anything but
 *                 a white silhouette renders as a grey blob)
 * mode 'icon'   — full colour on the world background, with brackets
 * mode 'adaptive' — full colour mark on transparent, inset into Android's
 *                 safe zone, no brackets (the launcher masks the edges)
 */
function render(size, mode) {
  const rgba = new Uint8ClampedArray(size * size * 4);
  // Keep the mark inside Android's adaptive-icon safe zone (inner ~66%).
  const inset = mode === 'adaptive' ? 0.70 : 1;
  // Stroke scale: below ~128px the hairlines vanish, so fatten them.
  const s = size >= 512 ? 1 : size >= 192 ? 1.5 : 2.4;

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let mark = 0;
      let bracket = 0;
      let bloom = 0;

      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const fx = (px + (sx + 0.5) / SS) / size;
          const fy = (py + (sy + 0.5) / SS) / size;
          // Map through the inset so 'adaptive' shrinks toward the centre.
          const ix = 0.5 + (fx - 0.5) / inset;
          const iy = 0.5 + (fy - 0.5) / inset;
          if (ix >= 0 && ix <= 1 && iy >= 0 && iy <= 1) {
            mark += markCoverage(ix, iy, s);
            if (mode === 'icon') bracket += bracketCoverage(ix, iy, s);
          }
        }
      }
      const n = SS * SS;
      mark /= n;
      bracket /= n;

      const i = (py * size + px) * 4;

      if (mode === 'mono') {
        // Pure white silhouette on transparent — required by Android.
        rgba[i] = 255;
        rgba[i + 1] = 255;
        rgba[i + 2] = 255;
        rgba[i + 3] = Math.round(mark * 255);
        continue;
      }

      // Colour: a vertical violet→cyan gradient across the mark, matching
      // the app's signal (#7C5CFF) and arcCyan (#5CE1FF) tokens.
      const t = py / size;
      const mr = lerp(0x7c, 0x5c, t);
      const mg = lerp(0x5c, 0xe1, t);
      const mb = lerp(0xff, 0xff, t);

      if (mode === 'adaptive') {
        const a = Math.max(mark, bracket);
        rgba[i] = Math.round(mr);
        rgba[i + 1] = Math.round(mg);
        rgba[i + 2] = Math.round(mb);
        rgba[i + 3] = Math.round(a * 255);
        continue;
      }

      // 'icon': composite over the world background with a radial bloom.
      const dx = px / size - 0.5;
      const dy = py / size - 0.5;
      const dist = Math.hypot(dx, dy);
      bloom = Math.max(0, 1 - dist / 0.52) ** 2.4;

      // background: deep void, lifted by the bloom toward violet
      let r = lerp(0x04, 0x2a, bloom * 0.85);
      let g = lerp(0x04, 0x1d, bloom * 0.85);
      let b = lerp(0x07, 0x4d, bloom * 0.85);

      // brackets in a dim cyan
      if (bracket > 0) {
        r = lerp(r, 0x5c, bracket * 0.75);
        g = lerp(g, 0xe1, bracket * 0.75);
        b = lerp(b, 0xff, bracket * 0.75);
      }
      // the mark itself, fully opaque where covered
      if (mark > 0) {
        r = lerp(r, mr, mark);
        g = lerp(g, mg, mark);
        b = lerp(b, mb, mark);
      }

      rgba[i] = Math.round(r);
      rgba[i + 1] = Math.round(g);
      rgba[i + 2] = Math.round(b);
      rgba[i + 3] = 255;
    }
  }
  return encodePNG(rgba, size, size);
}

// ── write ────────────────────────────────────────────────────────────────

const targets = [
  ['icon.png', 1024, 'icon'],
  ['adaptive-icon.png', 1024, 'adaptive'],
  ['notification-icon.png', 96, 'mono'],
  ['favicon.png', 64, 'icon'],
];

for (const [name, size, mode] of targets) {
  const buf = render(size, mode);
  fs.writeFileSync(path.join(OUT, name), buf);
  console.log(`wrote assets/${name}  ${size}x${size}  ${mode}  ${(buf.length / 1024).toFixed(1)}KB`);
}
