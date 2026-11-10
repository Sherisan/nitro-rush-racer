/* Nitro Rush world art: the three zones of the drive (sunset desert, neon city, snowy night pass).
   Everything is painted with canvas calls once and cached, so a frame only stacks finished sprites. */
import { CG } from '../engine/core.js';
import '../engine/art.js';

const U = CG.U;
const TAU = Math.PI * 2;
const LAYER_W = 2048;
const RES = 1.5;

/* ---------- zone palettes ---------- */
export const ZONES = [
  {
    id: 'desert',
    sky: [[0, '#17215e'], [0.3, '#52307f'], [0.56, '#c2466f'], [0.78, '#fb8a52'], [0.93, '#ffc477'], [1, '#ffe2a4']],
    haze: '#ffc08a', far: '#e8ac72', roadFar: '#8a6a5c', curbA: '#e4352a', curbB: '#f7efe1', paint: '#f5f0e6', sheen: '#ffb078', dark: 0, wet: 0, under: '#22e6ff',
  },
  {
    id: 'city',
    sky: [[0, '#090322'], [0.38, '#23095c'], [0.66, '#7c1a98'], [0.87, '#f0389c'], [1, '#ff8cb8']],
    haze: '#d13fa8', far: '#2c1752', roadFar: '#3a2460', curbA: '#22e6ff', curbB: '#ff3fb4', paint: '#e8f6ff', sheen: '#ff4fbc', dark: 0.55, wet: 1, under: '#22e6ff',
  },
  {
    id: 'peak',
    sky: [[0, '#01030b'], [0.45, '#071230'], [0.8, '#12305c'], [1, '#2d5a8c']],
    haze: '#2f5688', far: '#1d3656', roadFar: '#223a58', curbA: '#9fb2c8', curbB: '#222a3a', paint: '#e4edf6', sheen: '#7fb2ea', dark: 0.9, wet: 0.25, under: '#6fd6ff',
  },
];
/* Multiplier thresholds, as ln(m), where one zone hands over to the next. */
const EDGES = [Math.log(2.2), Math.log(7)];
const WIDTH = 0.11;
/** [zone, nextZone, blend] for an effective progress value. */
export const zoneAt = (p) => {
  for (let i = 0; i < EDGES.length; i++) {
    if (p < EDGES[i] - WIDTH) return [i, i, 0];
    if (p < EDGES[i] + WIDTH) return [i, i + 1, U.smooth((p - EDGES[i] + WIDTH) / (WIDTH * 2))];
  }
  return [EDGES.length, EDGES.length, 0];
};
export const zoneIndex = (p) => { const [a, b, t] = zoneAt(p); return t > 0.5 ? b : a; };

/* ---------- small helpers ---------- */
const wrapI = (i, n) => ((i % n) + n) % n;
/* Value noise that repeats every `cells` steps, so strips and tiles join without a seam. */
const noise1 = (t, cells, seed) => {
  const c = t * cells, i = Math.floor(c), f = c - i, u = f * f * (3 - 2 * f);
  const a = U.hash(wrapI(i, cells), 3, seed), b = U.hash(wrapI(i + 1, cells), 3, seed);
  return a + (b - a) * u;
};
const fbm1 = (t, cells, seed, oct = 4) => { let v = 0, a = 0.5, n = 0; for (let i = 0; i < oct; i++) { v += a * noise1(t, cells << i, seed + i * 31); n += a; a *= 0.5; } return v / n; };
const noise2 = (x, y, cells, seed, cellsY = cells) => {
  const cx = x * cells, cy = y * cellsY, xi = Math.floor(cx), yi = Math.floor(cy), fx = cx - xi, fy = cy - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const h = (i, j) => U.hash(wrapI(i, cells), wrapI(j, cellsY), seed);
  const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};
const fbm2 = (x, y, cells, seed, oct = 4, cellsY = cells) => { let v = 0, a = 0.5, n = 0; for (let i = 0; i < oct; i++) { v += a * noise2(x, y, cells << i, seed + i * 17, cellsY === cells ? cells << i : cellsY); n += a; a *= 0.5; } return v / n; };
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

const strip = (key, H, paint) => U.sprite(key, LAYER_W * RES, H * RES, (g) => { g.scale(RES, RES); paint(g, LAYER_W, H); });
/** Tile a horizontal strip across the view with its top at y. */
const drawStrip = (ctx, img, w, off, y) => {
  const H = img.height / RES;
  for (let x = -U.wrap(off, LAYER_W) - LAYER_W; x < w + 40; x += LAYER_W) if (x + LAYER_W > -40) ctx.drawImage(img, x, y, LAYER_W + 0.6, H);
};
/* Draw something three times so it wraps across the seam of a repeating strip. */
const wrapped = (W, fn) => { fn(-W); fn(0); fn(W); };

/** Soft additive light from a cached sprite; cheaper than building a gradient per call. */
export const bloom = (ctx, x, y, rx, color, a = 1, ry = rx) => {
  const s = U.sprite('nr-bloom-' + color, 128, 128, (g, W) => {
    const R = W / 2;
    g.fillStyle = U.rad(g, R, R, 0, R, [[0, U.rgba(color, 1)], [0.18, U.rgba(color, 0.62)], [0.45, U.rgba(color, 0.18)], [1, U.rgba(color, 0)]]);
    g.fillRect(0, 0, W, W);
  });
  const prevA = ctx.globalAlpha, prevC = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = prevA * U.clamp(a, 0, 1);
  ctx.drawImage(s, x - rx, y - ry, rx * 2, ry * 2);
  ctx.globalAlpha = prevA; ctx.globalCompositeOperation = prevC;
};

/** Soft dark contact shadow. */
export const shadow = (ctx, x, y, rx, ry, a = 1) => {
  const s = U.sprite('nr-shadow', 128, 128, (g, W) => { const R = W / 2; g.fillStyle = U.rad(g, R, R, 0, R, [[0, 'rgba(0,0,0,0.95)'], [0.62, 'rgba(0,0,0,0.75)'], [1, 'rgba(0,0,0,0)']]); g.fillRect(0, 0, W, W); });
  const prev = ctx.globalAlpha; ctx.globalAlpha = prev * a; ctx.drawImage(s, x - rx, y - ry, rx * 2, ry * 2); ctx.globalAlpha = prev;
};

/* Sprites carrying lettering are repainted once the display font has arrived. */
const fontTag = () => { try { return document.fonts.check('900 20px "Big Shoulders Display"') ? 'f' : 'x'; } catch { return 'x'; } };
try { document.fonts.load('900 20px "Big Shoulders Display"'); } catch { /* fallback font is fine */ }
const DISPLAY = '"Big Shoulders Display", Impact, "Arial Narrow", sans-serif';

/* ---------- ground and road surfaces (mapped in perspective row by row) ---------- */
export const TILE = 512;
export const GROUND_U = 6, GROUND_Z = 90, ROAD_U = 1.24, ROAD_Z = 36;

const surface = (key, cook, after) => U.sprite(key, TILE, TILE, (g, W, H) => {
  const id = g.createImageData(W, H), d = id.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = cook(x / W, y / H, x, y), i = (y * W + x) * 4;
    d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = c[3] == null ? 255 : c[3];
  }
  g.putImageData(id, 0, 0);
  if (after) after(g, W, H);
});

export const groundTile = (i) => surface('nr-ground-' + i, [
  (u, v, x) => { // wind-combed sand: furrows run towards the horizon
    const big = fbm2(u, v, 10, 11, 3, 3), warp = fbm2(u, v, 6, 19, 2, 2);
    const rip = Math.sin((u * 46 + warp * 8) * TAU) * 0.5 + 0.5;
    return mix3([164, 104, 60], [238, 182, 120], U.clamp(big * 0.84 + rip * 0.13 + U.hash(x, 9, 7) * 0.09 - 0.08, 0, 1));
  },
  (u, v, x) => { // night pavement, lit in pools
    const n = fbm2(u, v, 14, 31, 3, 3);
    let c = mix3([18, 14, 38], [52, 34, 92], U.clamp(n * 1.2 - 0.25 + U.hash(x, 5, 5) * 0.1, 0, 1));
    if (x % 64 < 2) c = mix3(c, [8, 6, 20], 0.65);
    return c;
  },
  (u, v, x) => { // packed snow over dark earth
    const n = fbm2(u, v, 18, 43, 4, 4), s = U.smooth((n - 0.4) / 0.12), speck = U.hash(x, 3, 3);
    return mix3(mix3([20, 30, 44], [34, 46, 62], speck), mix3([136, 164, 204], [196, 216, 240], n), s);
  },
][i]);

const ASPHALT = [
  { a: [62, 56, 56], b: [104, 94, 90], gravel: [146, 104, 72] },
  { a: [18, 18, 32], b: [46, 44, 68], gravel: [30, 22, 54] },
  { a: [26, 30, 40], b: [58, 64, 80], gravel: [104, 124, 152] },
];
export const roadTile = (i) => surface('nr-road-' + i, (u, v, x, y) => {
  const A = ASPHALT[i], lat = (u * 2 - 1) * ROAD_U, au = Math.abs(lat), speck = U.hash(x, 5, 13 + i);
  if (au > 1) {
    const edge = 1 - U.smooth((au - 1.05) / 0.19);
    const c = mix3(A.gravel, mix3(A.a, A.b, 0.8), speck * 0.5);
    return [c[0], c[1], c[2], 255 * edge];
  }
  const m = fbm2(u, v, 24, 53 + i, 3, 3);
  const wear = Math.max(...[0.17, 0.5, 0.83].map((k) => Math.exp(-(((au - k) / 0.07) ** 2))));
  let c = mix3(A.a, A.b, U.clamp(speck * 0.62 + m * 0.5 - 0.2, 0, 1));
  c = mix3(c, [c[0] * 0.72, c[1] * 0.72, c[2] * 0.74], wear * 0.6);
  return c;
}, (g, W, H) => {
  /* sealed cracks and old patches, kept off the wrap edge so the tile still repeats */
  const r = U.rng(77 + i);
  g.lineCap = 'round';
  for (let k = 0; k < 14; k++) {
    let x = W * (0.12 + r() * 0.76), y = H * (0.08 + r() * 0.7);
    g.strokeStyle = 'rgba(0,0,0,0.26)'; g.lineWidth = 0.8 + r() * 1.1;
    g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < 8; s++) { x += (r() - 0.5) * 26; y += 6 + r() * 14; g.lineTo(x, Math.min(y, H * 0.97)); }
    g.stroke();
  }
  for (let k = 0; k < 4; k++) {
    g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.13)' : 'rgba(255,255,255,0.035)';
    g.fillRect(W * (0.15 + r() * 0.5), H * (0.1 + r() * 0.6), 40 + r() * 90, 30 + r() * 80);
  }
});

/* ---------- desert backdrop ---------- */
const mesaProfile = (t, seed, amp) => {
  const site = fbm1(t, 6, seed, 2);
  const cliff = U.smooth((site - 0.5) / 0.035);
  const skirt = U.smooth((site - 0.42) / 0.16);
  const top = 0.62 + 0.38 * fbm1(t, 5, seed + 3, 1);
  const crag = (fbm1(t, 150, seed + 9, 3) - 0.5) * 0.05;
  return Math.max(cliff * top + crag * cliff, skirt * 0.3 * top + crag * skirt * 0.5 + 0.03) * amp;
};
function paintMesas(g, W, H, o) {
  const hAt = (x) => mesaProfile(x / W, o.seed, H * o.amp);
  const shape = new Path2D(); shape.moveTo(0, H);
  for (let x = 0; x <= W; x += 2) shape.lineTo(x, H - hAt(x));
  shape.lineTo(W, H); shape.closePath();
  g.fillStyle = U.lin(g, 0, H * (1 - o.amp), 0, H, [[0, o.top], [0.55, o.mid], [1, o.base]]);
  g.fill(shape);
  g.save(); g.clip(shape);
  const r = U.rng(o.seed + 1);
  for (let y = H * (1 - o.amp); y < H; y += 3 + r() * 6) {
    g.strokeStyle = r() < 0.5 ? U.rgba('#ffe0c0', 0.05 + r() * 0.1) : U.rgba('#200a14', 0.05 + r() * 0.12);
    g.lineWidth = 0.8 + r() * 2.6;
    const s = (y | 0) + o.seed;
    g.beginPath();
    for (let x = 0; x <= W; x += 12) { const yy = y + (noise1(x / W, 80, s) - 0.5) * 6; if (x) g.lineTo(x, yy); else g.moveTo(x, yy); }
    g.stroke();
  }
  for (let x = 0; x < W; x += 2 + r() * 5) {
    const ht = hAt(x); if (ht < 5) continue;
    g.fillStyle = U.rgba('#1c0812', 0.06 + r() * 0.14);
    g.fillRect(x, H - ht + r() * ht * 0.2, 1 + r() * 2.8, ht * (0.25 + r() * 0.6));
  }
  /* sunlit cap along each flat top */
  g.fillStyle = U.lin(g, 0, H * (1 - o.amp), 0, H * (1 - o.amp * 0.55), [[0, U.rgba(o.rim, 0.5)], [1, U.rgba(o.rim, 0)]]);
  g.fillRect(0, 0, W, H);
  g.restore();
  g.strokeStyle = o.rim; g.lineWidth = 1.5;
  g.beginPath();
  let pen = false;
  for (let x = 0; x <= W; x += 2) {
    const ht = hAt(x);
    if (ht > H * o.amp * 0.45) { if (pen) g.lineTo(x, H - ht); else g.moveTo(x, H - ht); pen = true; } else pen = false;
  }
  g.stroke();
}
const duskClouds = () => strip('nr-dusk-clouds', 240, (g, W) => {
  const r = U.rng(11);
  const puff = (x, y, rx, ry, c, a) => wrapped(W, (o) => {
    g.save(); g.translate(x + o, y); g.scale(rx, ry);
    g.fillStyle = U.rad(g, 0, 0, 0, 1, [[0, U.rgba(c, a)], [1, U.rgba(c, 0)]]); g.fillRect(-1, -1, 2, 2);
    g.restore();
  });
  for (let i = 0; i < 26; i++) {
    const cx = r() * W, cy = 26 + r() * 165, len = 160 + r() * 380, n = 8 + ((r() * 10) | 0);
    for (let j = 0; j < n; j++) {
      const px = cx + (r() - 0.5) * len, py = cy + (r() - 0.5) * 16, rx = 46 + r() * 130, ry = 5 + r() * 12;
      puff(px, py, rx, ry, '#5a3880', 0.26);
      puff(px, py + ry * 0.75, rx * 0.8, ry * 0.6, '#ff8a66', 0.34);
      puff(px - rx * 0.2, py + ry * 1.15, rx * 0.5, ry * 0.3, '#ffdca2', 0.4);
    }
  }
});
const mesaFar = () => strip('nr-mesa-far', 150, (g, W, H) => paintMesas(g, W, H, { seed: 201, amp: 0.8, top: '#c9708a', mid: '#b4618a', base: '#c87f8c', rim: '#ffd3a8' }));
const mesaMid = () => strip('nr-mesa-mid', 150, (g, W, H) => paintMesas(g, W, H, { seed: 317, amp: 0.74, top: '#a84a4a', mid: '#8a3648', base: '#a85a4c', rim: '#ffc48a' }));
const duneNear = () => strip('nr-dune-near', 90, (g, W, H) => {
  const hAt = (x) => (0.22 + 0.5 * fbm1(x / W, 9, 411, 3)) * H;
  g.fillStyle = U.lin(g, 0, 0, 0, H, [[0, '#6e3a34'], [0.6, '#9a5a40'], [1, '#d09060']]);
  g.beginPath(); g.moveTo(0, H);
  for (let x = 0; x <= W; x += 4) g.lineTo(x, H - hAt(x));
  g.lineTo(W, H); g.fill();
  const r = U.rng(9);
  for (let i = 0; i < 260; i++) {
    const x = r() * W, y = H - hAt(x) + 2 + r() * 8, s = 1 + r() * 2.6;
    g.fillStyle = U.rgba('#3a2028', 0.55); g.beginPath(); g.ellipse(x, y, s * 1.6, s, 0, 0, TAU); g.fill();
  }
});
function desert(ctx, V) {
  const { w, hz, pan, T } = V, sunX = w / 2 - pan, sunY = hz - 34;
  bloom(ctx, sunX, sunY, 620, '#ff9a55', 0.62, 330);
  drawStrip(ctx, duskClouds(), w, pan * 0.7 + T * 2.5, 6);
  bloom(ctx, sunX, sunY, 150, '#ffeeb0', 0.95);
  ctx.fillStyle = U.lin(ctx, 0, sunY - 74, 0, sunY + 74, [[0, '#fffbe2'], [0.6, '#ffe089'], [1, '#ff9c55']]);
  ctx.beginPath(); ctx.arc(sunX, sunY, 72, 0, TAU); ctx.fill();
  bloom(ctx, sunX, sunY, 760, '#ffd9a0', 0.42, 13);
  drawStrip(ctx, mesaFar(), w, pan * 0.8, hz - 146);
  drawStrip(ctx, mesaMid(), w, pan * 0.92 + 700, hz - 120);
  drawStrip(ctx, duneNear(), w, pan + 240, hz - 62);
}

/* ---------- city backdrop ---------- */
const WINDOWS = ['#ffd27a', '#7fe9ff', '#ff8fd6', '#ffffff'];
function paintSkyline(g, W, H, o) {
  const r = U.rng(o.seed);
  const list = [];
  for (let x = 0; x < W;) { let b = o.minW + r() * (o.maxW - o.minW); if (W - (x + b) < o.minW) b = W - x; list.push([x, b]); x += b; }
  list.forEach(([x, b]) => {
    const bh = H * (o.minH + Math.pow(r(), 1.5) * (o.maxH - o.minH)), top = H - bh;
    g.fillStyle = U.lin(g, 0, top, 0, H, [[0, o.top], [1, o.base]]);
    g.fillRect(x, top, b + 0.5, bh);
    const kind = r();
    if (kind < 0.25) { g.beginPath(); g.moveTo(x, top); g.lineTo(x + b, top); g.lineTo(x + b * 0.6, top - 16 - r() * 20); g.lineTo(x + b * 0.4, top - 16); g.fill(); }
    else if (kind < 0.5) { g.fillRect(x + b * 0.25, top - 14 - r() * 18, b * 0.5, 40); }
    if (kind > 0.6) {
      g.fillRect(x + b * 0.48, top - 34 - r() * 36, 1.6, 44);
      wrapped(W, (of) => { g.fillStyle = '#ff4056'; g.beginPath(); g.arc(x + b * 0.48 + of, top - 34, 1.7, 0, TAU); g.fill(); });
    }
    const cw = o.cell, ch = o.cell * 1.5;
    for (let wy = top + 7; wy < H - 6; wy += ch) for (let wx = x + 4; wx < x + b - cw; wx += cw) {
      if (r() > o.lit) continue;
      g.fillStyle = U.rgba(WINDOWS[(r() * WINDOWS.length) | 0], 0.28 + r() * 0.62);
      g.fillRect(wx, wy, cw * 0.56, ch * 0.5);
    }
    if (o.neon && r() < o.neon) {
      const c = ['#22e6ff', '#ff3fb4', '#ffd23f', '#9b5cff'][(r() * 4) | 0], side = r() < 0.5 ? x + 3 : x + b - 7, len = bh * (0.3 + r() * 0.4);
      g.save(); g.shadowColor = c; g.shadowBlur = 14; g.fillStyle = c; g.fillRect(side, top + 8, 3.4, len); g.restore();
    }
  });
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = U.lin(g, 0, H * 0.35, 0, H, [[0, 'rgba(255,60,170,0)'], [1, U.rgba(o.glow, 0.55)]]);
  g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'source-over';
}
const cityStars = () => strip('nr-city-stars', 200, (g, W, H) => {
  const r = U.rng(5);
  for (let i = 0; i < 260; i++) { g.fillStyle = U.rgba('#ffffff', 0.15 + r() * 0.65); const s = 0.6 + r() * 1.1; g.fillRect(r() * W, r() * H, s, s); }
});
const skyFar = () => strip('nr-city-far', 230, (g, W, H) => paintSkyline(g, W, H, { seed: 61, minW: 26, maxW: 66, minH: 0.2, maxH: 0.92, top: '#5a1f8c', base: '#a02c9c', cell: 5, lit: 0.22, glow: '#ff55c0' }));
const skyMid = () => strip('nr-city-mid', 240, (g, W, H) => paintSkyline(g, W, H, { seed: 83, minW: 40, maxW: 104, minH: 0.14, maxH: 0.8, top: '#2a0f5c', base: '#561a80', cell: 7, lit: 0.36, neon: 0.5, glow: '#ff3fb4' }));
const skyNear = () => strip('nr-city-near', 200, (g, W, H) => paintSkyline(g, W, H, { seed: 97, minW: 60, maxW: 150, minH: 0.12, maxH: 0.66, top: '#120832', base: '#2a1050', cell: 9, lit: 0.42, neon: 0.8, glow: '#b02cb0' }));
const synthSun = () => U.sprite('nr-synth-sun', 520, 520, (g, W, H) => {
  const R = W / 2;
  g.fillStyle = U.lin(g, 0, 0, 0, H, [[0, '#fff27a'], [0.42, '#ffb03d'], [0.72, '#ff3f8e'], [1, '#c41ea0']]);
  g.beginPath(); g.arc(R, R, R - 2, 0, TAU); g.fill();
  g.globalCompositeOperation = 'destination-out';
  for (let k = 0; k < 8; k++) { const t = k / 8, y = H * (0.5 + t * 0.5), h = 3 + t * 18; g.fillRect(0, y, W, h); }
  g.globalCompositeOperation = 'source-over';
});
function city(ctx, V) {
  const { w, hz, pan, T } = V, sx = w / 2 - pan, a = ctx.globalAlpha;
  drawStrip(ctx, cityStars(), w, pan * 0.3, 0);
  bloom(ctx, sx, hz - 80, 520, '#ff3fb4', 0.55);
  ctx.drawImage(synthSun(), sx - 130, hz - 228, 260, 260);
  drawStrip(ctx, skyFar(), w, pan * 0.75, hz - 226);
  /* searchlights sweeping over the skyline */
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  [[0.18, 0.9, '#7fe9ff'], [0.42, 1.3, '#ff8fd6'], [0.71, 0.7, '#7fe9ff'], [0.9, 1.1, '#c8a0ff']].forEach(([f, sp, c], i) => {
    const bx = U.wrap(w * f - pan, w + 200) - 100, ang = Math.sin(T * sp * 0.34 + i * 2) * 0.55 - Math.PI / 2, len = 420;
    ctx.fillStyle = U.lin(ctx, bx, hz - 30, bx + Math.cos(ang) * len, hz - 30 + Math.sin(ang) * len, [[0, U.rgba(c, 0.22)], [1, U.rgba(c, 0)]]);
    ctx.beginPath(); ctx.moveTo(bx - 3, hz - 30); ctx.lineTo(bx + Math.cos(ang - 0.05) * len, hz - 30 + Math.sin(ang - 0.05) * len); ctx.lineTo(bx + Math.cos(ang + 0.05) * len, hz - 30 + Math.sin(ang + 0.05) * len); ctx.lineTo(bx + 3, hz - 30); ctx.fill();
  });
  ctx.restore();
  ctx.globalAlpha = a;
  drawStrip(ctx, skyMid(), w, pan * 0.9 + 500, hz - 238);
  drawStrip(ctx, skyNear(), w, pan + 1100, hz - 196);
}
const wetStrip = () => U.sprite('nr-wet-strip', 256, 48, (g, W, H) => {
  g.imageSmoothingQuality = 'high';
  g.drawImage(skyFar(), 0, 0, W, H); g.drawImage(skyMid(), 0, 0, W, H); g.drawImage(skyNear(), 0, H * 0.14, W, H * 0.86);
});
/** The neon skyline mirrored on the wet road. Call with the road clipped. */
export function cityReflection(ctx, V, a) {
  const { w, hz, pan } = V, H = 300;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a;
  ctx.translate(0, hz); ctx.scale(1, -1);
  for (let x = -U.wrap(pan, LAYER_W) - LAYER_W; x < w + 40; x += LAYER_W) ctx.drawImage(wetStrip(), x, -H, LAYER_W + 1, H);
  ctx.restore();
}

/* ---------- night pass backdrop ---------- */
const nightStars = () => strip('nr-night-stars', 262, (g, W, H) => {
  const r = U.rng(21);
  /* the milky way: a dusty band of faint stars */
  for (let i = 0; i < 1500; i++) {
    const t = r(), x = t * W, band = H * (0.38 + 0.3 * Math.sin(t * TAU)) + (r() + r() + r() - 1.5) * 62;
    g.fillStyle = U.rgba('#cfe0ff', 0.08 + r() * 0.34); const s = 0.5 + r() * 0.7; g.fillRect(x, band, s, s);
  }
  for (let i = 0; i < 360; i++) {
    const x = r() * W, y = r() * H, s = 0.7 + r() * 1.4;
    g.fillStyle = U.rgba(r() < 0.2 ? '#ffe2c0' : '#ffffff', 0.25 + r() * 0.75); g.fillRect(x, y, s, s);
  }
});
const aurora = (n) => strip('nr-aurora-' + n, 250, (g, W, H) => {
  for (let x = 0; x < W; x += 2) {
    const t = x / W, pathY = H * (0.32 + 0.22 * fbm1(t, 3 + n, 71 + n, 2) + 0.1 * Math.sin(t * TAU * (2 + n)));
    const power = Math.pow(fbm1(t, 26, 91 + n, 3), 2.2) * 1.7, len = 60 + 130 * fbm1(t, 18, 111 + n, 2);
    g.fillStyle = U.lin(g, 0, pathY - len, 0, pathY + 40, [[0, 'rgba(150,60,255,0)'], [0.42, U.rgba('#7a5cff', 0.32 * power)], [0.78, U.rgba('#3cffb0', 0.72 * power)], [1, 'rgba(60,255,176,0)']]);
    g.fillRect(x, pathY - len, 2.4, len + 40);
  }
});
const moonDisc = () => U.texture('nr-moon', 220, 220, (x, y) => {
  const R = 110, dx = x - R, dy = y - R, d = Math.hypot(dx, dy);
  if (d > R) return [0, 0, 0, 0];
  const n = U.fbm(x * 0.022, y * 0.022, 5, 5), mare = U.smooth((n - 0.46) / 0.14), edge = 1 - Math.pow(d / R, 5) * 0.4;
  const v = (232 - mare * 70) * edge;
  return [v * 0.97, v * 0.99, v + 8, 255 * U.clamp(R - d, 0, 1)];
});
function paintRange(g, W, H, o) {
  const r = U.rng(o.seed);
  const peaks = [];
  for (let i = 0; i < o.n; i++) peaks.push({ x: r() * W, h: H * (o.minH + r() * (o.maxH - o.minH)), hw: o.hw * (0.75 + r() * 0.7) });
  peaks.sort((a, b) => b.h - a.h);
  peaks.forEach((p) => {
    const apex = H - p.h, L = [], R = [], ridge = [], snowL = [], snowR = [], N = 16;
    let rx = 0;
    for (let i = 0; i <= N; i++) {
      const t = i / N, y = apex + (H - apex) * t;
      L.push([-p.hw * t * (0.82 + r() * 0.36), y]);
      R.push([p.hw * t * (0.82 + r() * 0.36), y]);
      ridge.push([rx, y]);
      rx += (r() - 0.42) * p.hw * 0.12;
    }
    const snowEnd = Math.round(N * o.snow);
    wrapped(W, (of) => {
      g.save(); g.translate(p.x + of, 0);
      const poly = (a, b) => { g.beginPath(); g.moveTo(a[0][0], a[0][1]); a.forEach((q) => g.lineTo(q[0], q[1])); [...b].reverse().forEach((q) => g.lineTo(q[0], q[1])); g.closePath(); };
      poly(L, ridge); g.fillStyle = U.lin(g, 0, apex, 0, H, [[0, o.lit], [1, o.base]]); g.fill();
      poly(R, ridge); g.fillStyle = U.lin(g, 0, apex, 0, H, [[0, o.shade], [1, o.base]]); g.fill();
      const jag = (side, list) => { list.length = 0; for (let i = 0; i <= snowEnd; i++) { const q = side[i]; list.push(q); } };
      jag(L, snowL); jag(R, snowR);
      const q = U.rng(o.seed + Math.round(p.x));
      const lowEdge = (from, to) => { const pts = []; const n = 9; const [ax, ay] = from, [bx, by] = to; for (let i = 0; i <= n; i++) { const t = i / n; pts.push([ax + (bx - ax) * t, ay + (by - ay) * t + (i % 2 ? -1 : 1) * (6 + q() * (H - apex) * 0.11)]); } return pts; };
      const rid = ridge.slice(0, snowEnd + 1);
      poly(snowL, rid); g.fillStyle = U.lin(g, 0, apex, 0, ridge[snowEnd][1], [[0, o.snowLit], [1, U.rgba(o.snowLit, 0.55)]]); g.fill();
      poly(snowR, rid); g.fillStyle = U.lin(g, 0, apex, 0, ridge[snowEnd][1], [[0, o.snowShade], [1, U.rgba(o.snowShade, 0.5)]]); g.fill();
      /* ragged snow line */
      const tear = lowEdge(snowL[snowEnd], ridge[snowEnd]);
      g.fillStyle = o.lit; g.beginPath(); g.moveTo(tear[0][0], tear[0][1]); tear.forEach((v) => g.lineTo(v[0], v[1])); g.lineTo(ridge[snowEnd][0], ridge[snowEnd][1] + 30); g.lineTo(snowL[snowEnd][0], snowL[snowEnd][1] + 30); g.fill();
      const tearR = lowEdge(ridge[snowEnd], snowR[snowEnd]);
      g.fillStyle = o.shade; g.beginPath(); g.moveTo(tearR[0][0], tearR[0][1]); tearR.forEach((v) => g.lineTo(v[0], v[1])); g.lineTo(snowR[snowEnd][0], snowR[snowEnd][1] + 30); g.lineTo(ridge[snowEnd][0], ridge[snowEnd][1] + 30); g.fill();
      g.restore();
    });
  });
}
const rangeFar = () => strip('nr-range-far', 220, (g, W, H) => paintRange(g, W, H, { seed: 501, n: 16, minH: 0.42, maxH: 0.98, hw: 210, snow: 0.5, lit: '#3d5f90', shade: '#1b3160', base: '#2a4a78', snowLit: '#dcebff', snowShade: '#7fa2d4' }));
const rangeMid = () => strip('nr-range-mid', 170, (g, W, H) => paintRange(g, W, H, { seed: 607, n: 22, minH: 0.34, maxH: 0.86, hw: 150, snow: 0.3, lit: '#1f3558', shade: '#0d1a36', base: '#16294a', snowLit: '#a9c6ec', snowShade: '#4f74a8' }));
const treeline = () => strip('nr-treeline', 96, (g, W, H) => {
  const r = U.rng(33);
  const base = (x) => H - 8 - 16 * fbm1(x / W, 8, 703, 2);
  for (let layer = 0; layer < 2; layer++) {
    const c = layer ? '#050d1c' : '#0b1a30';
    for (let x = 0; x < W; x += 5 + r() * 9) { const h = (layer ? 44 : 34) + r() * 40; wrapped(W, (o) => U.pine(g, x + o, base(x) + 2, h, c)); }
  }
  g.fillStyle = '#050d1c'; g.beginPath(); g.moveTo(0, H);
  for (let x = 0; x <= W; x += 8) g.lineTo(x, base(x)); g.lineTo(W, H); g.fill();
});
function peak(ctx, V) {
  const { w, hz, pan, T } = V, a = ctx.globalAlpha, mx = w / 2 - pan + Math.min(w * 0.26, 300), my = hz - 176;
  drawStrip(ctx, nightStars(), w, pan * 0.5, 0);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = a * (0.62 + 0.25 * Math.sin(T * 0.5)); drawStrip(ctx, aurora(0), w, pan * 0.6 + T * 7, 0);
  ctx.globalAlpha = a * (0.5 + 0.3 * Math.sin(T * 0.37 + 2)); drawStrip(ctx, aurora(1), w, pan * 0.6 - T * 5 + 800, 18);
  ctx.restore(); ctx.globalAlpha = a;
  bloom(ctx, mx, my, 240, '#9cc8ff', 0.55);
  ctx.drawImage(moonDisc(), mx - 46, my - 46, 92, 92);
  drawStrip(ctx, rangeFar(), w, pan * 0.8, hz - 216);
  drawStrip(ctx, rangeMid(), w, pan * 0.92 + 300, hz - 166);
  drawStrip(ctx, treeline(), w, pan + 900, hz - 90);
}

const PAINTERS = [desert, city, peak];
/** Sky and distant scenery for one zone at the current alpha. */
export function drawBackdrop(ctx, V, i, alpha) {
  const Z = ZONES[i];
  ctx.save(); ctx.globalAlpha = alpha;
  ctx.fillStyle = U.lin(ctx, 0, -40, 0, V.hz + 12, Z.sky); ctx.fillRect(-40, -40, V.w + 80, V.hz + 60);
  PAINTERS[i](ctx, V);
  ctx.restore();
}

/* Halved copies of each sprite, built once. Distant props use the closest size, so they stay smooth
   without asking the GPU for high-quality scaling on every draw, which is far too slow on integrated graphics. */
const mipCache = new Map();
export const mipsOf = (img) => {
  let list = mipCache.get(img);
  if (!list) {
    list = [img];
    for (let c = img; Math.min(c.width, c.height) > 24 && list.length < 6;) {
      const d = document.createElement('canvas');
      d.width = Math.max(1, c.width >> 1); d.height = Math.max(1, c.height >> 1);
      const g = d.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(c, 0, 0, d.width, d.height);
      list.push(d); c = d;
    }
    mipCache.set(img, list);
  }
  return list;
};
/** The smallest copy that is still at least `px` device pixels tall. */
export const mipFor = (img, px) => {
  const list = mipsOf(img);
  let i = 0;
  while (i < list.length - 1 && list[i + 1].height >= px) i++;
  return list[i];
};

/* ---------- roadside props: { img, h (world height), ar (width / height) } ---------- */
const prop = (key, W, H, worldH, paint, res = 2) => { const img = U.sprite(key, W * res, H * res, (g) => { g.scale(res, res); paint(g, W, H); }); return { img, h: worldH, ar: W / H }; };

const saguaro = (v) => prop('nr-saguaro-' + v, 150, 280, 0.72, (g, W, H) => {
  const r = U.rng(40 + v), cx = W / 2, body = U.lin(g, cx - 22, 0, cx + 22, 0, [[0, '#ffbe72'], [0.2, '#5f8a3a'], [0.62, '#2f5a2c'], [1, '#183a24']]);
  const limb = (x, y, w2, h2) => { g.fillStyle = body; U.rr(g, x, y, w2, h2, w2 / 2); g.fill(); g.strokeStyle = 'rgba(10,30,16,0.42)'; g.lineWidth = 1; for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(x + (w2 * k) / 4, y + 6); g.lineTo(x + (w2 * k) / 4, y + h2 - 4); g.stroke(); } };
  const tall = 200 + r() * 50;
  limb(cx - 18, H - tall, 36, tall);
  const arm = (dir, y, reach, up) => { const ax = dir > 0 ? cx + 10 : cx - 10 - reach; g.fillStyle = body; U.rr(g, ax, y, reach + 8, 20, 10); g.fill(); limb(dir > 0 ? cx + reach - 4 : cx - reach - 16, y - up, 24, up + 20); };
  arm(-1, H - tall * (0.5 + r() * 0.1), 40, 60 + r() * 40);
  if (v !== 1) arm(1, H - tall * (0.62 + r() * 0.1), 38, 44 + r() * 40);
});
const boulder = (v) => prop('nr-boulder-' + v, 240, 150, 0.34, (g, W, H) => {
  const r = U.rng(60 + v), pts = [];
  for (let i = 0; i <= 11; i++) { const a = Math.PI + (i / 11) * Math.PI, R = 0.74 + r() * 0.26; pts.push([W / 2 + Math.cos(a) * (W * 0.48) * R, H - 4 + Math.sin(a) * (H - 12) * R]); }
  g.fillStyle = U.lin(g, 0, 0, W, 0, [[0, '#f0a874'], [0.4, '#9a5a42'], [1, '#43242a']]);
  g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(30,12,18,0.45)'; g.lineWidth = 2;
  for (let i = 2; i < 10; i += 2) { g.beginPath(); g.moveTo(pts[i][0], pts[i][1]); g.lineTo(pts[i][0] + (r() - 0.3) * 50, H - 8 - r() * 36); g.stroke(); }
  g.fillStyle = 'rgba(20,8,12,0.4)'; g.fillRect(0, H - 8, W, 8);
});
const scrub = () => prop('nr-scrub', 180, 100, 0.2, (g, W, H) => {
  const r = U.rng(81); g.lineCap = 'round';
  for (let i = 0; i < 90; i++) {
    const a = -Math.PI * (0.08 + r() * 0.84), l = 30 + r() * 62;
    g.strokeStyle = ['#a8783e', '#6a5a30', '#d6a258', '#4e3d24'][i % 4]; g.lineWidth = 1 + r() * 1.4;
    g.beginPath(); g.moveTo(W / 2 + (r() - 0.5) * 18, H - 2); g.quadraticCurveTo(W / 2 + Math.cos(a) * l * 0.5, H + Math.sin(a) * l * 0.7, W / 2 + Math.cos(a) * l, H + Math.sin(a) * l); g.stroke();
  }
});
const pole = () => prop('nr-pole', 150, 520, 1.5, (g, W, H) => {
  const cx = W / 2;
  g.fillStyle = U.lin(g, cx - 6, 0, cx + 6, 0, [[0, '#d08a55'], [0.4, '#6a4028'], [1, '#2c1a18']]); g.fillRect(cx - 5, 8, 10, H - 8);
  g.fillStyle = '#4a2c20'; g.fillRect(cx - 62, 34, 124, 8); g.fillRect(cx - 46, 74, 92, 7);
  g.fillStyle = '#e8e2d0'; [-54, -26, 26, 54].forEach((x) => g.fillRect(cx + x - 2.5, 24, 5, 11)); [-38, 38].forEach((x) => g.fillRect(cx + x - 2.5, 64, 5, 11));
});
const billboard = (v) => prop('nr-board-' + v + fontTag(), 520, 340, 1.05, (g, W, H) => {
  [[80, 20], [W - 100, 20]].forEach(([x, w2]) => { g.fillStyle = U.lin(g, x, 0, x + w2, 0, [[0, '#a87040'], [1, '#34201a']]); g.fillRect(x, 150, w2, H - 150); });
  const panel = v ? ['#0e6aa8', '#22e6ff', '#032430'] : ['#c02a2a', '#ffb33d', '#fff5dd'];
  g.fillStyle = U.lin(g, 0, 10, 0, 210, [[0, panel[0]], [1, U.mixHex(panel[0], '#000000', 0.45)]]); U.rr(g, 10, 10, W - 20, 200, 8); g.fill();
  g.strokeStyle = panel[1]; g.lineWidth = 8; U.rr(g, 22, 22, W - 44, 176, 6); g.stroke();
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = v ? '#ffffff' : panel[2];
  g.font = '900 104px ' + DISPLAY; g.fillText(v ? 'BOOST' : 'FUEL', W / 2, 100);
  g.font = '800 34px ' + DISPLAY; g.fillStyle = panel[1]; g.fillText(v ? 'NEXT 3 KM · FULL THROTTLE' : 'LAST STOP FOR NITRO', W / 2, 168);
});
const chevron = () => prop('nr-chevron', 240, 240, 0.5, (g, W, H) => {
  g.fillStyle = '#3a3a3a'; g.fillRect(W / 2 - 7, 110, 14, H - 110);
  g.fillStyle = '#12141a'; U.rr(g, 8, 8, W - 16, 130, 8); g.fill();
  g.fillStyle = '#ffd23f'; for (let i = 0; i < 3; i++) { const x = 30 + i * 62; g.beginPath(); g.moveTo(x, 22); g.lineTo(x + 28, 22); g.lineTo(x + 62, 73); g.lineTo(x + 28, 124); g.lineTo(x, 124); g.lineTo(x + 34, 73); g.fill(); }
});

const NEON = ['#22e6ff', '#ff3fb4', '#ffd23f', '#9b5cff', '#4dffa6'];
const SIGNS = ['HOTEL', 'ARCADE', 'NOODLES', '24H', 'CLUB', 'RACE'];
const tower = (v) => prop('nr-tower-' + v + fontTag(), 300, 720, 2.6, (g, W, H) => {
  const r = U.rng(900 + v), inset = 18 + r() * 34, roof = 30 + r() * 60;
  const c = NEON[v % NEON.length], c2 = NEON[(v + 2) % NEON.length];
  g.fillStyle = U.lin(g, 0, roof, 0, H, [[0, '#1b1046'], [0.65, '#150a38'], [1, '#2a124e']]);
  g.fillRect(inset, roof, W - inset * 2, H - roof);
  g.fillStyle = U.lin(g, inset, 0, W - inset, 0, [[0, 'rgba(255,90,190,0.22)'], [0.3, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.42)']]);
  g.fillRect(inset, roof, W - inset * 2, H - roof);
  if (v % 2) { g.fillStyle = '#1b1046'; g.fillRect(W / 2 - 38, roof - 26, 76, 28); g.fillRect(W / 2 - 2, roof - 66, 4, 42); }
  else { g.fillStyle = '#1b1046'; g.beginPath(); g.moveTo(inset, roof); g.lineTo(W - inset, roof); g.lineTo(W / 2, roof - 40); g.fill(); }
  const cw = 15, ch = 20;
  for (let y = roof + 16; y < H - 30; y += ch) for (let x = inset + 10; x < W - inset - cw; x += cw) {
    if (r() > 0.46) { g.fillStyle = 'rgba(0,0,10,0.5)'; g.fillRect(x, y, cw * 0.62, ch * 0.62); continue; }
    g.fillStyle = U.rgba(WINDOWS[(r() * WINDOWS.length) | 0], 0.42 + r() * 0.55); g.fillRect(x, y, cw * 0.62, ch * 0.62);
  }
  /* neon: roof line, vertical sign and a shopfront band */
  g.save(); g.shadowColor = c; g.shadowBlur = 22; g.strokeStyle = c; g.lineWidth = 3.4;
  g.strokeRect(inset + 3, roof + 3, W - inset * 2 - 6, H - roof - 6);
  g.restore();
  const word = SIGNS[v % SIGNS.length], px = v % 3 === 0 ? W - inset - 54 : inset + 8;
  g.fillStyle = '#080416'; U.rr(g, px, roof + 40, 46, word.length * 44 + 18, 7); g.fill();
  g.save(); g.shadowColor = c2; g.shadowBlur = 16; g.fillStyle = c2; g.font = '900 42px ' + DISPLAY; g.textAlign = 'center'; g.textBaseline = 'middle';
  word.split('').forEach((ch2, i) => g.fillText(ch2, px + 23, roof + 72 + i * 44));
  g.restore();
  g.save(); g.shadowColor = c; g.shadowBlur = 24; g.fillStyle = U.mixHex(c, '#ffffff', 0.35); g.fillRect(inset + 6, H - 62, W - inset * 2 - 12, 12); g.restore();
  g.fillStyle = U.lin(g, 0, H - 50, 0, H, [[0, '#2a1a5c'], [1, '#0a0620']]); g.fillRect(inset, H - 50, W - inset * 2, 50);
});
const lamp = () => prop('nr-lamp', 280, 480, 1.05, (g, W, H) => {
  const cx = W / 2;
  g.fillStyle = U.lin(g, cx - 5, 0, cx + 5, 0, [[0, '#454a60'], [1, '#12131e']]); g.fillRect(cx - 4, 30, 8, H - 30);
  g.fillStyle = '#20222e'; g.fillRect(cx - 100, 30, 200, 7);
  g.fillStyle = '#20222e'; U.rr(g, cx - 12, H - 44, 24, 44, 4); g.fill();
  [-1, 1].forEach((s) => { g.fillStyle = '#fff3cf'; U.rr(g, cx + s * 100 - 26, 36, 52, 7, 3); g.fill(); });
});
const palm = (v) => prop('nr-palm-' + v, 300, 480, 1.3, (g, W, H) => {
  const r = U.rng(120 + v), cx = W / 2 + 8;
  g.strokeStyle = U.lin(g, cx - 8, 0, cx + 8, 0, [[0, '#ff5ac8'], [0.3, '#2a1650'], [1, '#100830']]); g.lineWidth = 11; g.lineCap = 'round';
  g.beginPath(); g.moveTo(cx - 10, H); g.quadraticCurveTo(cx + 18, H * 0.55, cx, 92); g.stroke();
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI * (i / 8) * 1.1 + 0.15, len = 104 + r() * 36, ex = cx + Math.cos(a) * len, ey = 92 + Math.sin(a) * len * 0.62 + 34;
    g.fillStyle = i % 2 ? '#2b1a62' : '#1a1048';
    g.beginPath(); g.moveTo(cx, 92); g.quadraticCurveTo((cx + ex) / 2 + 2, 92 + Math.sin(a) * len * 0.62 - 24, ex, ey); g.quadraticCurveTo((cx + ex) / 2, 92 + Math.sin(a) * len * 0.62 - 2, cx, 96); g.fill();
    g.strokeStyle = 'rgba(255,90,200,0.75)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(cx, 92); g.quadraticCurveTo((cx + ex) / 2 + 2, 92 + Math.sin(a) * len * 0.62 - 24, ex, ey); g.stroke();
  }
});
const archGate = () => prop('nr-arch', 900, 560, 1.95, (g, W, H) => {
  const glow = (c, blur, width) => { g.shadowColor = c; g.shadowBlur = blur; g.strokeStyle = c; g.lineWidth = width; };
  const curve = (ins) => { g.beginPath(); g.moveTo(ins, H); g.lineTo(ins, 150); g.quadraticCurveTo(ins, ins * 0.6 + 12, 150, ins * 0.6 + 12); g.lineTo(W - 150, ins * 0.6 + 12); g.quadraticCurveTo(W - ins, ins * 0.6 + 12, W - ins, 150); g.lineTo(W - ins, H); };
  g.lineCap = 'round';
  g.strokeStyle = '#0e0726'; g.lineWidth = 34; curve(24); g.stroke();
  g.save(); glow('#ff3fb4', 30, 7); curve(12); g.stroke(); g.restore();
  g.save(); glow('#22e6ff', 30, 7); curve(36); g.stroke(); g.restore();
});
const pine = (v) => prop('nr-pine-' + v, 240, 440, 1.5, (g, W, H) => {
  const r = U.rng(200 + v), cx = W / 2;
  g.fillStyle = '#20170f'; g.fillRect(cx - 7, H - 46, 14, 46);
  const tiers = 7 + (v % 2);
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1), y = 12 + t * (H - 90), hw = 18 + t * 92, drop = 58 + t * 20;
    g.fillStyle = U.lin(g, cx - hw, 0, cx + hw, 0, [[0, '#1f4260'], [0.42, '#0b2234'], [1, '#040f1a']]);
    g.beginPath(); g.moveTo(cx, y);
    for (let k = 0; k <= 8; k++) { const a = k / 8, x = cx + hw * (a * 2 - 1); g.lineTo(x, y + drop * (0.72 + Math.sin(a * Math.PI) * 0.28) + (k % 2 ? -7 : 2) + r() * 4); }
    g.closePath(); g.fill();
    g.fillStyle = U.lin(g, cx - hw, 0, cx + hw * 0.6, 0, [[0, 'rgba(196,220,250,0.92)'], [1, 'rgba(100,140,190,0.5)']]);
    g.beginPath(); g.moveTo(cx, y + 2);
    for (let k = 0; k <= 6; k++) { const a = k / 6, x = cx + hw * 0.56 * (a * 2 - 1) - hw * 0.16; g.lineTo(x, y + drop * 0.2 * (0.5 + Math.sin(a * Math.PI) * 0.5) + (k % 2 ? 5 : -1) + 3); }
    g.closePath(); g.fill();
  }
});
const snowRock = (v) => prop('nr-snowrock-' + v, 240, 140, 0.34, (g, W, H) => {
  const r = U.rng(300 + v), pts = [];
  for (let i = 0; i <= 11; i++) { const a = Math.PI + (i / 11) * Math.PI, R = 0.7 + r() * 0.3; pts.push([W / 2 + Math.cos(a) * W * 0.48 * R, H - 2 + Math.sin(a) * (H - 8) * R]); }
  const path = () => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); };
  g.fillStyle = U.lin(g, 0, 0, W, 0, [[0, '#5b7596'], [1, '#141f30']]); path(); g.fill();
  g.save(); path(); g.clip();
  g.fillStyle = '#d8e8fa';
  g.beginPath(); g.moveTo(0, 0); g.lineTo(W, 0); g.lineTo(W, H * 0.34);
  for (let x = W; x >= 0; x -= W / 10) g.lineTo(x, H * (0.3 + r() * 0.26));
  g.closePath(); g.fill();
  g.restore();
});
const post = () => prop('nr-post', 40, 150, 0.32, (g, W, H) => {
  g.fillStyle = U.lin(g, 8, 0, 32, 0, [[0, '#f4f8ff'], [1, '#7f8ca4']]); U.rr(g, 11, 2, 18, H - 2, 4); g.fill();
  g.fillStyle = '#16181f'; g.fillRect(11, 20, 18, 34);
  g.fillStyle = '#ff3a48'; U.rr(g, 15, 25, 10, 24, 2); g.fill();
});
const roadSign = () => prop('nr-summit' + fontTag(), 280, 300, 0.74, (g, W, H) => {
  g.fillStyle = '#39414f'; g.fillRect(W / 2 - 7, 140, 14, H - 140);
  g.fillStyle = '#f2c733'; g.beginPath(); g.moveTo(W / 2, 4); g.lineTo(W - 12, 104); g.lineTo(W / 2, 204); g.lineTo(12, 104); g.fill();
  g.strokeStyle = '#14161c'; g.lineWidth = 7; g.beginPath(); g.moveTo(W / 2, 20); g.lineTo(W - 28, 104); g.lineTo(W / 2, 188); g.lineTo(28, 104); g.closePath(); g.stroke();
  g.fillStyle = '#14161c'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '900 42px ' + DISPLAY; g.fillText('SUMMIT', W / 2, 92); g.font = '800 26px ' + DISPLAY; g.fillText('ICE AHEAD', W / 2, 128);
});

/** Start gantry with lettering; its lamps are drawn live over it. */
export const startGantry = () => prop('nr-gantry' + fontTag(), 1000, 310, 0.9, (g, W, H) => {
  const leg = (x) => {
    g.fillStyle = U.lin(g, x, 0, x + 44, 0, [[0, '#5a6480'], [0.45, '#262c3e'], [1, '#0c0f18']]); g.fillRect(x, 80, 44, H - 80);
    g.fillStyle = 'rgba(255,255,255,0.1)'; for (let y = 160; y < H - 12; y += 34) g.fillRect(x + 7, y, 30, 3);
  };
  leg(16); leg(W - 60);
  g.fillStyle = U.lin(g, 0, 8, 0, 146, [[0, '#1b2438'], [1, '#090d18']]); U.rr(g, 6, 8, W - 12, 138, 12); g.fill();
  g.strokeStyle = '#22e6ff'; g.lineWidth = 4; U.rr(g, 14, 16, W - 28, 122, 8); g.stroke();
  const check = (x0) => { for (let i = 0; i < 6; i++) for (let j = 0; j < 7; j++) { g.fillStyle = (i + j) % 2 ? '#f4f6fa' : '#0b0d14'; g.fillRect(x0 + i * 15, 24 + j * 15, 15, 15); } };
  check(26); check(W - 116);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.save(); g.shadowColor = '#22e6ff'; g.shadowBlur = 16; g.fillStyle = '#ffffff'; g.font = '900 86px ' + DISPLAY; g.fillText('NITRO RUSH', W / 2, 82); g.restore();
  /* lamp housing under the banner */
  g.fillStyle = '#0a0d16'; U.rr(g, W / 2 - 196, 146, 392, 56, 12); g.fill();
  g.strokeStyle = '#2a3247'; g.lineWidth = 3; U.rr(g, W / 2 - 196, 146, 392, 56, 12); g.stroke();
});
export const GANTRY_LAMPS = [-2, -1, 0, 1, 2].map((i) => 0.5 + i * 0.078);

/* ---------- zone-specific prop placement (world step = 5 units) ---------- */
const VARIANT_COUNTS = { saguaro: 3, boulder: 3, tower: 6, palm: 2, pine: 3, snowRock: 2 };
const G = {
  saguaro: (v) => saguaro(v % VARIANT_COUNTS.saguaro), boulder: (v) => boulder(v % VARIANT_COUNTS.boulder), scrub, pole, billboard: (v) => billboard(v % 2), chevron,
  tower: (v) => tower(v % VARIANT_COUNTS.tower), lamp, palm: (v) => palm(v % VARIANT_COUNTS.palm),
  pine: (v) => pine(v % VARIANT_COUNTS.pine), snowRock: (v) => snowRock(v % VARIANT_COUNTS.snowRock), post, roadSign,
};
/** Build every cached sprite in small steps, so no frame in a round has to pay for one. */
export const WARM_UP = [
  () => groundTile(0), () => roadTile(0), duskClouds, mesaFar, mesaMid, duneNear, startGantry, archGate,
  () => groundTile(1), () => roadTile(1), cityStars, synthSun, skyFar, skyMid, skyNear, wetStrip,
  () => groundTile(2), () => roadTile(2), nightStars, () => aurora(0), () => aurora(1), moonDisc, rangeFar, rangeMid, treeline,
  ...Object.entries(VARIANT_COUNTS).flatMap(([k, n]) => Array.from({ length: n }, (_, v) => () => mipsOf(G[k](v).img))),
  ...[scrub, pole, () => billboard(0), () => billboard(1), chevron, lamp, post, roadSign, archGate, startGantry].map((make) => () => mipsOf(make().img)),
];

export function placeProps(n, zone) {
  const r = U.rng(n * 7919 + 13), list = [];
  const add = (make, u, s = 1, extra) => list.push(Object.assign({ make, v: (r() * 12) | 0, u, s }, extra));
  [1, -1].forEach((side) => {
    if (zone === 0) {
      const roll = r();
      if (roll < 0.3) add(G.saguaro, side * (1.75 + r() * 1.5), 0.8 + r() * 0.55);
      else if (roll < 0.46) add(G.boulder, side * (1.5 + r() * 1.8), 0.7 + r() * 1.1);
      else if (roll < 0.66) add(G.scrub, side * (1.42 + r() * 2.4), 0.7 + r() * 0.8);
      if (r() < 0.55) add(r() < 0.5 ? G.saguaro : G.boulder, side * (3.6 + r() * 6), 0.9 + r() * 0.8);
      if (n % 9 === 0 && side > 0) add(G.pole, side * 1.62);
      if (n > 16 && n % 23 === (side > 0 ? 0 : 11)) add(G.billboard, side * 2.15, 1, { v: n });
      if (n % 31 === 5 && n > 20 && side < 0) add(G.chevron, side * 1.36);
    } else if (zone === 1) {
      if (n % 2 === 0) add(G.tower, side * (2.45 + r() * 0.5), 0.5 + r() * 0.4, { v: n * 3 + (side > 0 ? 1 : 4) });
      else if (r() < 0.7) add(G.tower, side * (4.1 + r() * 1.4), 0.66 + r() * 0.46, { v: n + 2 });
      if (n % 3 === 0) add(G.lamp, side * 1.3, 1, { glow: 'lamp' });
      else if (n % 3 === 1 && r() < 0.8) add(G.palm, side * (1.52 + r() * 0.2), 0.9 + r() * 0.3);
    } else {
      if (r() < 0.8) add(G.pine, side * (2 + r() * 0.9), 0.55 + r() * 0.42);
      if (r() < 0.85) add(G.pine, side * (3.2 + r() * 2.2), 0.66 + r() * 0.5);
      if (r() < 0.75) add(G.pine, side * (5.8 + r() * 5), 0.8 + r() * 0.6);
      if (r() < 0.2) add(G.snowRock, side * (1.32 + r() * 0.6), 0.7 + r() * 0.9);
      if (n % 2 === 0) add(G.post, side * 1.28, 1, { glow: 'post' });
      if (n % 29 === 7 && side > 0) add(G.roadSign, side * 1.5);
    }
  });
  if (zone === 1 && n % 14 === 7) list.push({ make: archGate, v: 0, u: 0, s: 1, glow: 'arch' });
  return list;
}
