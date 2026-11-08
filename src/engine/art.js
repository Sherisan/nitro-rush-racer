/* Art toolkit shared by every scene: noise, cached sprites, textures, volumetric clouds,
   additive light, film grain, characters, fish and terrain. Extends CG.U. */
import { CG } from './core.js';

const U = CG.U;
const TAU = Math.PI * 2;

/* ---------- noise ---------- */
const hash = (x, y, s) => {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
};
U.hash = hash;
U.vnoise = (x, y, s = 0) => {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};
U.fbm = (x, y, s = 0, oct = 4) => {
  let t = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { t += a * U.vnoise(x * f, y * f, s + i * 17); n += a; a *= 0.5; f *= 2.03; }
  return t / n;
};

/* ---------- cached offscreen sprites ---------- */
const cache = new Map();
U.sprite = (key, w, h, paint) => {
  let c = cache.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
    paint(c.getContext('2d'), c.width, c.height);
    cache.set(key, c);
  }
  return c;
};
/** Per-pixel texture from fn(x, y) -> [r, g, b, a]. */
U.texture = (key, w, h, fn) => U.sprite(key, w, h, (g, W, H) => {
  const id = g.createImageData(W, H), d = id.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = fn(x, y), i = (y * W + x) * 4;
    d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = c[3] == null ? 255 : c[3];
  }
  g.putImageData(id, 0, 0);
});
/** Tileable fbm texture blended between two colours, with optional strata. */
U.rockTile = (key, size, dark, light, opt = {}) => {
  const A = U.hex(dark), B = U.hex(light), sc = opt.scale || 0.02, strata = opt.strata || 0, seed = opt.seed || 1;
  return U.texture(key, size, size, (x, y) => {
    // tileable: blend four samples
    const fx = x / size, fy = y / size;
    const n = (sx, sy) => U.fbm(sx * sc, sy * sc, seed, 5);
    let v = n(x, y) * (1 - fx) * (1 - fy) + n(x - size, y) * fx * (1 - fy) + n(x, y - size) * (1 - fx) * fy + n(x - size, y - size) * fx * fy;
    if (strata) { const bands = Math.max(1, Math.round((strata * size) / (Math.PI * 2))); v = v * 0.7 + 0.3 * (0.5 + 0.5 * Math.sin((y / size) * Math.PI * 2 * bands + v * 6)); }
    v = U.clamp((v - 0.3) * 1.8, 0, 1);
    return [A[0] + (B[0] - A[0]) * v, A[1] + (B[1] - A[1]) * v, A[2] + (B[2] - A[2]) * v, 255];
  });
};
U.pattern = (ctx, img, ox, oy) => {
  const p = ctx.createPattern(img, 'repeat');
  if (p && p.setTransform && typeof DOMMatrix !== 'undefined') p.setTransform(new DOMMatrix().translate(ox || 0, oy || 0));
  return p;
};

/* ---------- light ---------- */
U.light = (ctx, x, y, r, color, a) => {
  const prev = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  U.glow(ctx, x, y, r, color, a == null ? 0.5 : a);
  ctx.globalCompositeOperation = prev;
};
/** Soft light cone, e.g. a lamp beam or headlight. */
U.cone = (ctx, x, y, ang, len, spread, color, a) => {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.translate(x, y); ctx.rotate(ang);
  const g = ctx.createLinearGradient(0, 0, len, 0);
  g.addColorStop(0, U.rgba(color, a)); g.addColorStop(1, U.rgba(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(len, -len * spread); ctx.lineTo(len, len * spread); ctx.lineTo(0, 4); ctx.fill();
  ctx.restore();
};
U.flare = (ctx, x, y, w, h, a) => {
  const cx = w / 2, cy = h / 2;
  U.light(ctx, x, y, 160, '#fff3d0', 0.55 * a);
  [[0.35, 26, '#ffd9a0'], [0.6, 14, '#a0d8ff'], [0.9, 40, '#ffb0d0'], [1.3, 20, '#c0ffd0']].forEach(([t, r, c]) => {
    U.light(ctx, x + (cx - x) * t * 2, y + (cy - y) * t * 2, r, c, 0.18 * a);
  });
};
/** Diagonal god rays from above. */
U.rays = (ctx, w, h, x0, color, a, time, n = 6) => {
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    const x = x0 + i * (w / n) + Math.sin(time * 0.3 + i * 1.7) * 30, ww = 30 + 40 * U.hash(i, 3, 9);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, U.rgba(color, a * (0.6 + 0.4 * Math.sin(time * 0.7 + i)))); g.addColorStop(1, U.rgba(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(x, -20); ctx.lineTo(x + ww, -20); ctx.lineTo(x + ww + h * 0.45, h); ctx.lineTo(x + h * 0.35, h); ctx.fill();
  }
  ctx.restore();
};

/* ---------- film grain ---------- */
U.grain = (ctx, w, h, a) => {
  const n = U.sprite('grain', 160, 160, (g, W, H) => {
    const id = g.createImageData(W, H);
    for (let i = 0; i < id.data.length; i += 4) { const v = 90 + Math.random() * 80; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
    g.putImageData(id, 0, 0);
  });
  ctx.save();
  ctx.globalAlpha = a; ctx.globalCompositeOperation = 'overlay';
  ctx.fillStyle = U.pattern(ctx, n, Math.random() * 160, Math.random() * 160);
  ctx.fillRect(-40, -40, w + 80, h + 80);
  ctx.restore();
};

/* ---------- gradients ---------- */
U.lin = (ctx, x0, y0, x1, y1, stops) => {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  stops.forEach(([t, c]) => g.addColorStop(t, c));
  return g;
};
U.rad = (ctx, x, y, r0, r1, stops) => {
  const g = ctx.createRadialGradient(x, y, r0, x, y, r1);
  stops.forEach(([t, c]) => g.addColorStop(t, c));
  return g;
};

/* ---------- volumetric cloud sprite ---------- */
U.cloud = (key, w, h, lit, mid, shade, seed) => U.sprite(key, w, h, (g, W, H) => {
  const r = U.rng(seed || 1);
  const puffs = [];
  for (let i = 0; i < 26; i++) {
    const t = r();
    let x = W * (0.2 + 0.6 * r());
    let rr = Math.min((0.1 + 0.12 * r()) * W * (1 - Math.abs(x / W - 0.5) * 1.1), H * 0.36);
    rr = Math.max(rr, H * 0.12);
    x = U.clamp(x, rr + 2, W - rr - 2);
    const y = U.clamp(H * 0.7 - rr * (0.2 + t * 0.8), rr + 2, H - rr - 2);
    puffs.push([x, y, rr]);
  }
  puffs.sort((a, b) => b[1] - a[1]);
  for (const [x, y, rr] of puffs) {
    const gr = g.createRadialGradient(x - rr * 0.2, y - rr * 0.45, rr * 0.1, x, y, rr);
    gr.addColorStop(0, lit); gr.addColorStop(0.6, mid); gr.addColorStop(1, U.rgba(mid.startsWith('#') ? mid : '#888888', 0));
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, rr, 0, TAU); g.fill();
  }
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = U.lin(g, 0, H * 0.3, 0, H, [[0, 'rgba(0,0,0,0)'], [1, shade]]);
  g.fillRect(0, 0, W, H);
});

/* ---------- terrain ---------- */
/** Filled ridge line using fbm, scrolled by `off`. */
U.ridge = (ctx, w, h, base, amp, scale, off, seed, fill, step = 8) => {
  ctx.fillStyle = fill;
  ctx.beginPath(); ctx.moveTo(-40, h + 40);
  for (let x = -40; x <= w + 40; x += step) {
    const n = U.fbm((x + off) * scale, 0.5, seed, 5);
    ctx.lineTo(x, base - amp * n);
  }
  ctx.lineTo(w + 40, h + 40); ctx.closePath(); ctx.fill();
};
U.pine = (ctx, x, y, hgt, col) => {
  ctx.fillStyle = col; ctx.beginPath();
  ctx.moveTo(x, y - hgt);
  for (let k = 0; k < 4; k++) { const yy = y - hgt + (hgt * (k + 1)) / 4.4, ww = hgt * (0.14 + k * 0.07); ctx.lineTo(x + ww, yy); ctx.lineTo(x + ww * 0.4, yy - hgt * 0.04); }
  ctx.lineTo(x + hgt * 0.04, y); ctx.lineTo(x - hgt * 0.04, y);
  for (let k = 3; k >= 0; k--) { const yy = y - hgt + (hgt * (k + 1)) / 4.4, ww = hgt * (0.14 + k * 0.07); ctx.lineTo(x - ww * 0.4, yy - hgt * 0.04); ctx.lineTo(x - ww, yy); }
  ctx.closePath(); ctx.fill();
};

/* ---------- characters ---------- */
/** Explorer figure. Feet at (x, y). mode: run | climb | idle. */
U.person = (ctx, o) => {
  const s = o.s || 1, ph = o.phase || 0, mode = o.mode || 'run';
  const skin = o.skin || '#d9a37a', coat = o.coat || '#b8864a', coatD = o.coatDark || '#7a5428', pants = o.pants || '#3b3226', hat = o.hat || '#5a3b1e', pack = o.pack || '#4a3a22';
  ctx.save(); ctx.translate(o.x, o.y); ctx.scale(s * (o.facing || 1), s); ctx.rotate(o.lean || 0);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const hipY = -46, shY = -78, amp = mode === 'idle' ? 0.06 : mode === 'climb' ? 0.5 : 0.85;
  const bob = mode === 'run' ? Math.abs(Math.cos(ph)) * 3 : 0;
  ctx.translate(0, -bob);
  const leg = (p, col) => {
    const a = Math.sin(p) * amp, k = mode === 'idle' ? 0.1 : Math.max(0.1, Math.cos(p) * 1.25);
    const kx = Math.sin(a) * 22, ky = hipY + Math.cos(a) * 22, fa = a - k, fx = kx + Math.sin(fa) * 22, fy = ky + Math.cos(fa) * 22;
    ctx.strokeStyle = col; ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(0, hipY); ctx.lineTo(kx, ky); ctx.lineTo(fx, fy); ctx.stroke();
    ctx.fillStyle = '#20150c'; ctx.beginPath(); ctx.ellipse(fx + 5, fy + 2, 9, 5, fa * 0.3, 0, TAU); ctx.fill();
  };
  const arm = (p, col, front) => {
    let a = -Math.sin(p) * amp * 0.9, bend = 1.1;
    if (mode === 'climb') { a = 2.4 + Math.sin(p) * 0.4; bend = 0.4; }
    const ex = 4 + Math.sin(a) * 17, ey = shY + 4 + Math.cos(a) * 17, fa = a + bend, hx = ex + Math.sin(fa) * 16, hy = ey + Math.cos(fa) * 16;
    ctx.strokeStyle = col; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(4, shY + 4); ctx.lineTo(ex, ey); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(hx, hy, 4, 0, TAU); ctx.fill();
    if (front && o.torch) { U.light(ctx, hx + 4, hy - 14, 60, '#ffb347', 0.6); ctx.fillStyle = '#ffcf5a'; ctx.beginPath(); ctx.moveTo(hx, hy - 4); ctx.quadraticCurveTo(hx + 4, hy - 22, hx + 6, hy - 4); ctx.fill(); }
  };
  arm(ph + Math.PI, coatD, false);
  leg(ph + Math.PI, U.mixHex(pants, '#000000', 0.35));
  // backpack
  ctx.fillStyle = pack; U.rr(ctx, -20, shY + 2, 14, 30, 4); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(-20, shY + 20, 14, 4);
  ctx.strokeStyle = '#8a7a5a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-18, shY + 34); ctx.lineTo(-8, shY + 34); ctx.stroke();
  // torso
  ctx.fillStyle = U.lin(ctx, -10, 0, 14, 0, [[0, coatD], [0.55, coat], [1, U.mixHex(coat, '#ffffff', 0.15)]]);
  ctx.beginPath(); ctx.moveTo(-9, shY); ctx.lineTo(12, shY); ctx.lineTo(10, hipY + 6); ctx.lineTo(-8, hipY + 6); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#3a2614'; ctx.fillRect(-8, hipY - 2, 18, 5); ctx.fillStyle = '#c9a24a'; ctx.fillRect(0, hipY - 2, 4, 5);
  leg(ph, pants);
  arm(ph, coat, true);
  // head + hat
  ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(5, shY - 12, 9, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.arc(2, shY - 10, 9, Math.PI * 0.5, Math.PI * 1.3); ctx.fill();
  ctx.fillStyle = hat; ctx.beginPath(); ctx.ellipse(5, shY - 17, 16, 4, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-4, shY - 18); ctx.quadraticCurveTo(-3, shY - 32, 6, shY - 31); ctx.quadraticCurveTo(15, shY - 32, 14, shY - 18); ctx.fill();
  ctx.fillStyle = '#2a1a0c'; ctx.fillRect(-4, shY - 21, 18, 3);
  ctx.restore();
};

/** Shaded fish facing dir (1 right, -1 left). */
U.fish = (ctx, x, y, len, top, belly, dir, t, opt = {}) => {
  ctx.save(); ctx.translate(x, y); ctx.scale(dir, 1);
  const wag = Math.sin(t * (opt.speed || 8)) * 0.25, hgt = len * (opt.h || 0.36);
  ctx.fillStyle = U.lin(ctx, 0, -hgt, 0, hgt, [[0, top], [0.55, U.mixHex(top, belly, 0.6)], [1, belly]]);
  ctx.beginPath();
  ctx.moveTo(len * 0.55, 0);
  ctx.bezierCurveTo(len * 0.4, -hgt * 1.1, -len * 0.25, -hgt * 0.9, -len * 0.45, -hgt * 0.15);
  ctx.lineTo(-len * 0.45, hgt * 0.15);
  ctx.bezierCurveTo(-len * 0.25, hgt * 0.9, len * 0.4, hgt * 1.0, len * 0.55, 0);
  ctx.fill();
  ctx.save(); ctx.translate(-len * 0.43, 0); ctx.rotate(wag);
  ctx.fillStyle = top; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-len * 0.28, -hgt * 0.9); ctx.quadraticCurveTo(-len * 0.18, 0, -len * 0.28, hgt * 0.9); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.fillStyle = U.mixHex(top, '#000000', 0.2);
  ctx.beginPath(); ctx.moveTo(len * 0.05, -hgt * 0.85); ctx.lineTo(-len * 0.15, -hgt * 1.35 * (opt.fin || 1)); ctx.lineTo(-len * 0.22, -hgt * 0.7); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.beginPath(); ctx.ellipse(len * 0.1, -hgt * 0.35, len * 0.3, hgt * 0.18, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#f4f6f8'; ctx.beginPath(); ctx.arc(len * 0.36, -hgt * 0.18, Math.max(1.5, len * 0.055), 0, TAU); ctx.fill();
  ctx.fillStyle = '#0a0a0a'; ctx.beginPath(); ctx.arc(len * 0.37, -hgt * 0.18, Math.max(0.9, len * 0.03), 0, TAU); ctx.fill();
  ctx.restore();
};

/** Bevelled metal plate. */
U.plate = (ctx, x, y, w, h, r, base) => {
  ctx.fillStyle = U.lin(ctx, x, y, x, y + h, [[0, U.mixHex(base, '#ffffff', 0.25)], [0.5, base], [1, U.mixHex(base, '#000000', 0.45)]]);
  U.rr(ctx, x, y, w, h, r); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1; ctx.stroke();
};
U.rivets = (ctx, x0, x1, y, n, col) => {
  for (let i = 0; i < n; i++) {
    const x = x0 + ((x1 - x0) * i) / Math.max(1, n - 1);
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, 2.4, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.arc(x - 0.7, y - 0.7, 0.9, 0, TAU); ctx.fill();
  }
};
/** Gold nugget pile sprite. */
U.goldPile = (key, w, h, seed) => U.sprite(key, w, h, (g, W, H) => {
  const r = U.rng(seed);
  for (let i = 0; i < 70; i++) {
    const t = i / 70, x = W * (0.08 + 0.84 * r()), hump = Math.sin((x / W) * Math.PI);
    const y = H - 4 - hump * (H - 14) * (0.35 + 0.65 * r()) * (0.4 + 0.6 * (1 - t * 0.3));
    const rr = 4 + r() * 7;
    g.fillStyle = U.rad(g, x - rr * 0.35, y - rr * 0.4, 0, rr * 1.1, [[0, '#fff6c8'], [0.35, '#ffd24d'], [0.75, '#c48a12'], [1, '#6e4a08']]);
    g.beginPath(); g.ellipse(x, y, rr, rr * 0.8, r() * 3, 0, TAU); g.fill();
  }
});

/** Lightning bolt points. */
U.bolt = (x, y, ty, jag) => {
  const pts = []; let px = x, py = y;
  while (py < ty) { pts.push([px, py]); px += (Math.random() - 0.5) * jag; py += 14 + Math.random() * 26; }
  pts.push([px, ty]);
  return pts;
};
U.drawBolt = (ctx, pts, a, col) => {
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  [[10, 0.12], [4, 0.35], [1.6, 1]].forEach(([lw, al]) => {
    ctx.strokeStyle = U.rgba(col || '#cfe0ff', a * al); ctx.lineWidth = lw;
    ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke();
  });
  ctx.restore();
};

/** Text with a soft shadow, for in-world labels. */
U.label = (ctx, text, x, y, font, color, align) => {
  ctx.save(); ctx.font = font; ctx.textAlign = align || 'left';
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillText(text, x + 1, y + 2);
  ctx.fillStyle = color; ctx.fillText(text, x, y);
  ctx.restore();
};
/** Rounded instrument panel. */
U.panel = (ctx, x, y, w, h, accent) => {
  ctx.save();
  ctx.fillStyle = 'rgba(6,8,14,0.66)'; U.rr(ctx, x, y, w, h, 10); ctx.fill();
  ctx.strokeStyle = U.rgba(accent, 0.45); ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = U.rgba(accent, 0.9); ctx.fillRect(x + 12, y, 28, 2);
  ctx.restore();
};

export {};
