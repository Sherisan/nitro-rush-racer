/* NITRO RUSH: a hypercar run from a desert sunset through a neon city to a snowy night pass.
   The road is projected row by row; roadside props and rival cars are scaled sprites.
   Art lives in nitro-rush-car.js and nitro-rush-world.js. */
import { CG } from '../engine/core.js';
import '../engine/art.js';
import { CAR_W, CAR_WARM_UP, EXHAUST_X, EXHAUST_Y, blit, drawHero, heroWing, rivalCar } from './nitro-rush-car.js';
import { GANTRY_LAMPS, GROUND_U, GROUND_Z, ROAD_U, ROAD_Z, TILE, WARM_UP, ZONES, bloom, cityReflection, drawBackdrop, groundTile, mipFor, placeProps, roadTile, shadow, startGantry, zoneAt, zoneIndex } from './nitro-rush-world.js';

const U = CG.U;
const TAU = Math.PI * 2;

/* ---------- road geometry ---------- */
const HORIZON = 0.455, DIST = 2400, SPREAD = 2.6, FAR = 420, PROP_FAR = 330, LEAD = 0.0016, STEP = 5;
const CAR_LINE = 40; /* the car's ground line sits this far above the bottom of the view */
const GANTRY_Z = 70;
const BOOSTS = [1.5, 2, 3, 5, 10, 25, 50, 100];

const ease = (s) => U.smooth((s - 130) / 280);
const bendAt = (s) => ease(s) * (5.2 * Math.sin(s / 230) + 1.6 * Math.sin(s / 91 + 1.3));
const riseAt = (s) => ease(s) * (0.085 * Math.sin(s / 127 + 0.4) + 0.045 * Math.sin(s / 53 + 2.1));

function makeView(w, h, st, T, pp) {
  const k = U.clamp(w / 1040, 0.56, 1), F = DIST * SPREAD * k, s0 = st.travel;
  const bend0 = bendAt(s0), slope0 = bendAt(s0 + 1) - bend0, rise0 = riseAt(s0);
  const hz = h * HORIZON + (riseAt(s0 + 30) - rise0) * 70;
  const at = (z) => {
    const s = s0 + z, px = F / z;
    return { y: hz + (DIST * (1 - (riseAt(s) - rise0))) / z, px, cx: w / 2 + (bendAt(s) - bend0 - slope0 * z) * px };
  };
  /* surface rows, far to near; each knows its distance so textures land in true perspective */
  const rows = [];
  for (let y = hz + 0.6, prevZ = FAR * 3; y < h + 46;) {
    const d = y - hz, step = 1 + 2.1 * U.clamp(d / (h - hz), 0, 1);
    let z = DIST / d;
    for (let i = 0; i < 2; i++) z = (DIST * (1 - (riseAt(s0 + z) - rise0))) / d;
    const P = at(z);
    rows.push({ y, h: step, z, dz: Math.max(0.01, prevZ - z), px: P.px, cx: P.cx });
    prevZ = z; y += step;
  }
  return { w, h, hz, k, T, F, pp, travel: s0, scale: 1, pan: slope0 * F, curve: bendAt(s0 + 40) - bend0 - slope0 * 40, at, rows };
}

/* ---------- surfaces ---------- */
const MATRIX = typeof DOMMatrix !== 'undefined' ? new DOMMatrix() : null;
const texture = (ctx, pat, r, V, spanU, spanZ, x0, a) => {
  MATRIX.a = (r.px * spanU) / TILE;
  MATRIX.d = r.h / Math.max((r.dz / spanZ) * TILE, 0.25);
  MATRIX.e = x0;
  MATRIX.f = r.y - ((V.travel + r.z) / spanZ) * TILE * MATRIX.d;
  pat.setTransform(MATRIX);
  ctx.globalAlpha = a;
  ctx.fillStyle = pat;
};
function drawSurfaces(ctx, V, st) {
  const { w, rows } = V;
  st.pats = st.pats || { ground: [0, 1, 2].map((i) => ctx.createPattern(groundTile(i), 'repeat')), road: [0, 1, 2].map((i) => ctx.createPattern(roadTile(i), 'repeat')) };
  const m = ctx.getTransform(), snap = (y) => (Math.round(y * m.d + m.f) - m.f) / m.d;
  const paint = (z, r, alpha, detail, y0, rh) => {
    const Zn = ZONES[z];
    ctx.globalAlpha = alpha; ctx.fillStyle = Zn.far; ctx.fillRect(-40, y0, w + 80, rh);
    if (detail > 0) { texture(ctx, st.pats.ground[z], r, V, GROUND_U, GROUND_Z, r.cx, alpha * detail); ctx.fillRect(-40, y0, w + 80, rh); }
    const x0 = r.cx - ROAD_U * r.px, wid = 2 * ROAD_U * r.px;
    ctx.globalAlpha = alpha; ctx.fillStyle = Zn.roadFar; ctx.fillRect(r.cx - r.px, y0, r.px * 2, rh);
    if (detail > 0) { texture(ctx, st.pats.road[z], r, V, 2 * ROAD_U, ROAD_Z, x0, alpha * detail); ctx.fillRect(x0, y0, wid, rh); }
  };
  for (const r of rows) {
    const y0 = snap(r.y), rh = snap(r.y + r.h) - y0;
    if (rh <= 0) continue;
    const [a, b, t] = zoneAt(V.pp + r.z * LEAD), detail = 1 - U.smooth((r.z - 110) / 150);
    paint(a, r, 1, detail, y0, rh);
    if (t > 0) paint(b, r, t, detail, y0, rh);
  }
  ctx.globalAlpha = 1;
}
const roadPath = (V) => {
  const p = new Path2D(), { rows } = V;
  rows.forEach((r, i) => { if (i) p.lineTo(r.cx - r.px, r.y); else p.moveTo(r.cx - r.px, r.y); });
  for (let i = rows.length - 1; i >= 0; i--) p.lineTo(rows[i].cx + rows[i].px, rows[i].y);
  p.closePath();
  return p;
};
/** One lane-paint quad between two distances and two lateral positions. */
const quad = (p, A, B, u0, u1) => { p.moveTo(A.cx + u0 * A.px, A.y); p.lineTo(A.cx + u1 * A.px, A.y); p.lineTo(B.cx + u1 * B.px, B.y); p.lineTo(B.cx + u0 * B.px, B.y); p.closePath(); };
/** A long strip following the road, optionally lifted off the ground (h0/h1 in world units). */
function ribbon(p, V, u0, u1, z0, z1, h0 = 0, h1 = 0) {
  const L = [], R = [];
  for (let z = z0; ; z = Math.min(z1, z * 1.1)) {
    const P = V.at(z);
    L.push([P.cx + u0 * P.px, P.y - h0 * P.px]); R.push([P.cx + u1 * P.px, P.y - h1 * P.px]);
    if (z >= z1) break;
  }
  L.forEach((q, i) => (i ? p.lineTo(q[0], q[1]) : p.moveTo(q[0], q[1])));
  for (let i = R.length - 1; i >= 0; i--) p.lineTo(R[i][0], R[i][1]);
  p.closePath();
}
/* Stretches of road by zone, near to far: [zone, from, to]. */
function zoneSpans(V) {
  const spans = []; let cur = -1, z0 = 8;
  for (let z = 8; ; z = Math.min(FAR, z * 1.06)) {
    const n = zoneIndex(V.pp + z * LEAD);
    if (n !== cur) { if (cur >= 0) spans.push([cur, z0, z]); cur = n; z0 = z; }
    if (z >= FAR) { spans.push([cur, z0, FAR]); break; }
  }
  return spans;
}
function drawPaint(ctx, V, spans) {
  const white = new Path2D(), faint = new Path2D(), curbs = new Map();
  const add = (c) => { if (!curbs.has(c)) curbs.set(c, new Path2D()); return curbs.get(c); };
  /* dashed lane lines */
  const period = 9;
  for (let n = Math.floor((V.travel + 8) / period); n * period - V.travel < 230; n++) {
    const z0 = n * period - V.travel; if (z0 < 7) continue;
    const A = V.at(z0), B = V.at(z0 + 4.5), to = z0 < 120 ? white : faint;
    quad(to, A, B, -0.345, -0.325); quad(to, A, B, 0.325, 0.345);
  }
  /* solid edge lines */
  [-1, 1].forEach((s) => ribbon(white, V, s * 0.97, s * 0.94, 8, FAR));
  ctx.globalAlpha = 0.9; ctx.fillStyle = ZONES[zoneIndex(V.pp + 30 * LEAD)].paint; ctx.fill(white);
  ctx.globalAlpha = 0.42; ctx.fill(faint); ctx.globalAlpha = 1;
  /* start line */
  if (V.travel < 60) {
    const A = V.at(Math.max(4, 16 - V.travel)), B = V.at(Math.max(4.6, 19 - V.travel)), mid = V.at(Math.max(4.3, 17.5 - V.travel));
    const light = new Path2D(), n = 18;
    for (let i = 0; i < n; i++) {
      const u0 = -0.94 + (i / n) * 1.88, u1 = u0 + 1.88 / n;
      quad(light, i % 2 ? A : mid, i % 2 ? mid : B, u0, u1);
    }
    ctx.fillStyle = 'rgba(244,246,250,0.88)'; ctx.fill(light);
  }
  /* kerbs, by zone */
  spans.forEach(([z, z0, z1]) => {
    const Zn = ZONES[z], len = 5.5;
    for (let n = Math.floor((V.travel + z0) / len); n * len - V.travel < Math.min(z1, 190); n++) {
      const zz = n * len - V.travel; if (zz < z0) continue;
      const A = V.at(zz), B = V.at(zz + len), to = add(n % 2 ? Zn.curbA : Zn.curbB);
      [-1, 1].forEach((s) => quad(to, A, B, s * 1.0, s * 1.14));
    }
    if (z1 > 190) { const far = add(U.mixHex(Zn.curbA, Zn.curbB, 0.5)); [-1, 1].forEach((s) => ribbon(far, V, s * 1.0, s * 1.14, Math.max(190, z0), z1)); }
  });
  curbs.forEach((p, c) => { ctx.fillStyle = c; ctx.fill(p); });
  /* barriers: glowing strips through the city, steel rail on the pass */
  spans.forEach(([z, z0, z1]) => {
    if (z === 1) {
      const a = new Path2D(), b = new Path2D();
      [-1, 1].forEach((s) => { ribbon(a, V, s * 1.18, s * 1.18, z0, z1, 0.03, 0.11); ribbon(b, V, s * 1.18, s * 1.18, z0, z1, 0.15, 0.18); });
      ctx.fillStyle = 'rgba(12,8,34,0.95)'; ctx.fill(a);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = ZONES[1].curbA; ctx.fill(b);
      ctx.restore();
    } else if (z === 2) {
      const steel = new Path2D();
      [-1, 1].forEach((s) => ribbon(steel, V, s * 1.2, s * 1.2, z0, z1, 0.1, 0.2));
      ctx.fillStyle = U.lin(ctx, 0, V.hz, 0, V.h, [[0, '#16263f'], [1, '#3f5068']]); ctx.fill(steel);
    }
  });
}

/* ---------- roadside ---------- */
function collectProps(V, st) {
  const first = Math.floor((V.travel + 5) / STEP), last = Math.floor((V.travel + PROP_FAR) / STEP), out = [];
  for (let n = last; n >= first; n--) {
    let list = st.props.get(n);
    if (!list) { list = placeProps(n, zoneIndex(V.pp + (n * STEP - V.travel) * LEAD)); st.props.set(n, list); }
    const z = n * STEP - V.travel;
    if (z >= 5) list.forEach((p) => out.push({ z, p }));
  }
  if (st.props.size > 260) for (const key of st.props.keys()) if (key < first) st.props.delete(key);
  return out;
}
function drawItem(ctx, V, it, S) {
  const P = V.at(it.z), { p } = it;
  if (p.rival) { drawRival(ctx, V, it, P); return; }
  if (p.gantry) { drawGantry(ctx, V, it, P, S); return; }
  p.spr = p.spr || p.make(p.v);
  const hpx = p.spr.h * p.s * P.px, wpx = hpx * p.spr.ar, x = P.cx + p.u * P.px;
  if (x + wpx / 2 < -40 || x - wpx / 2 > V.w + 40) return;
  const fade = 1 - U.smooth((it.z - PROP_FAR + 70) / 70);
  ctx.globalAlpha = fade;
  ctx.drawImage(mipFor(p.spr.img, hpx * V.scale), x - wpx / 2, P.y - hpx, wpx, hpx);
  ctx.globalAlpha = 1;
  if (p.glow === 'lamp') {
    const arm = wpx * 0.357, top = P.y - hpx * 0.92, r = P.px * 0.2 + 3, far = it.z < 170 ? 0.62 : 0.2;
    bloom(ctx, x - arm, top, r, '#ffc98a', far * fade); bloom(ctx, x + arm, top, r, '#ffc98a', far * fade);
    if (it.z < 120) bloom(ctx, x, P.y + P.px * 0.02, P.px * 0.8, '#ff9ad8', 0.16 * fade, P.px * 0.13);
  } else if (p.glow === 'post' && it.z < 120) {
    bloom(ctx, x, P.y - hpx * 0.75, 12 + P.px * 0.08, '#ff3a48', 0.75 * fade);
  } else if (p.glow === 'arch') {
    bloom(ctx, x - wpx * 0.46, P.y - hpx * 0.5, P.px * 0.6, '#ff3fb4', 0.34 * fade, hpx * 0.7);
    bloom(ctx, x + wpx * 0.46, P.y - hpx * 0.5, P.px * 0.6, '#22e6ff', 0.34 * fade, hpx * 0.7);
    bloom(ctx, x, P.y + P.px * 0.02, P.px * 1.3, '#d05cff', 0.3 * fade, P.px * 0.18);
  }
}
function drawGantry(ctx, V, it, P, S) {
  const G = startGantry(), hpx = G.h * P.px, wpx = hpx * G.ar, x0 = P.cx - wpx / 2, y0 = P.y - hpx;
  /* gone before it can reach the multiplier; left out altogether where the view is too short to fit both */
  const cssHeight = (540 * V.scale) / Math.min(2, window.devicePixelRatio || 1), fade = U.smooth((it.z - 24) / 24);
  if (fade <= 0 || cssHeight < 380) return;
  ctx.globalAlpha = fade;
  ctx.drawImage(mipFor(G.img, hpx * V.scale), x0, y0, wpx, hpx);
  /* lamps count down to launch, then all go green */
  const lit = S.phase === 'betting' ? U.clamp(Math.ceil((4.5 - S.countdown) / 0.9), 0, 5) : 5, green = S.phase !== 'betting';
  GANTRY_LAMPS.forEach((f, i) => {
    const on = green || i < lit, x = x0 + f * wpx, y = y0 + 0.562 * hpx, r = wpx * 0.021;
    ctx.fillStyle = on ? (green ? '#62ffa6' : '#ff3048') : '#2b0a10';
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    if (on) bloom(ctx, x, y, r * 4.2, green ? '#3dff94' : '#ff2438', 0.85);
  });
  ctx.globalAlpha = 1;
}
function drawRival(ctx, V, it, P) {
  const s = (P.px * 0.62) / CAR_W, x = P.cx + it.p.u * P.px;
  if (x + 240 * s < -40 || x - 240 * s > V.w + 40) return;
  ctx.globalAlpha = (1 - U.smooth((it.z - 320) / 70)) * U.smooth((it.z - 6.4) / 1.2);
  shadow(ctx, x, P.y + 3 * s, 230 * s, 22 * s, 0.6);
  ctx.save(); ctx.translate(x, P.y); ctx.scale(s, s); blit(ctx, mipFor(rivalCar(it.p.paint), 290 * s * V.scale)); ctx.restore();
  const tail = -118 * s;
  bloom(ctx, x - 158 * s, P.y + tail, 30 * s + 2, '#ff2438', 0.55); bloom(ctx, x + 158 * s, P.y + tail, 30 * s + 2, '#ff2438', 0.55);
  ctx.globalAlpha = 1;
}
function updateRivals(V, st, S, dt) {
  const go = S.phase === 'running';
  st.rivals.forEach((r) => { r.v += ((go ? r.top : S.phase === 'crashed' ? r.top * 0.8 : 0) - r.v) * Math.min(1, dt * 1.4); r.s += r.v * dt; });
  if (go && V.travel + FAR > st.nextRival) {
    st.nextRival += 70 + Math.random() * 130;
    st.rivals.push({ s: V.travel + PROP_FAR + 40, u: Math.random() < 0.5 ? -0.64 : 0.64, v: 22, top: 20 + Math.random() * 10, paint: (Math.random() * 4) | 0 });
  }
  st.rivals = st.rivals.filter((r) => r.s - V.travel > 3.2);
}

/* ---------- effects ---------- */
function speedLines(ctx, V, power) {
  const vx = V.w / 2 - V.pan, vy = V.hz, n = Math.round(14 + power * 44);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = 'rgba(255,255,255,' + (0.1 + power * 0.16).toFixed(3) + ')'; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = U.hash(i, 1, 7) * TAU, ph = U.wrap(U.hash(i, 2, 7) + V.T * (0.9 + U.hash(i, 3, 7) * 1.5), 1), reach = Math.max(V.w * 0.72, 620);
    if (Math.sin(a) < -0.1) continue;
    const r0 = 150 + ph * ph * reach, len = 26 + ph * ph * 260;
    ctx.moveTo(vx + Math.cos(a) * r0, vy + Math.sin(a) * r0 * 0.74); ctx.lineTo(vx + Math.cos(a) * (r0 + len), vy + Math.sin(a) * (r0 + len) * 0.74);
  }
  ctx.stroke(); ctx.restore();
}
function exhaustFlames(ctx, x, y, s, power) {
  [-1, 1].forEach((side) => {
    const ex = x + side * EXHAUST_X * s, ey = y + EXHAUST_Y * s, flick = 0.78 + Math.random() * 0.44, r = 22 * s * power * flick;
    bloom(ctx, ex, ey + r * 0.3, r * 3.2, '#2f8dff', 0.8);
    bloom(ctx, ex, ey + r * 0.15, r * 1.7, '#a8e4ff', 0.95);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(ex, ey);
    for (let i = 0; i < 5; i++) {
      const a = Math.PI / 2 + (Math.random() - 0.5) * 1.1, len = r * (1.3 + Math.random() * 1.5), w2 = r * 0.34;
      ctx.rotate(a - Math.PI / 2);
      ctx.fillStyle = U.lin(ctx, 0, 0, 0, len, [[0, 'rgba(235,250,255,0.95)'], [0.45, 'rgba(80,170,255,0.6)'], [1, 'rgba(30,70,255,0)']]);
      ctx.beginPath(); ctx.moveTo(-w2, 0); ctx.quadraticCurveTo(-w2 * 0.5, len * 0.6, 0, len); ctx.quadraticCurveTo(w2 * 0.5, len * 0.6, w2, 0); ctx.fill();
      ctx.rotate(-(a - Math.PI / 2));
    }
    ctx.restore();
  });
}

/* Soft smoke, dust and spray: sprites that swell and fade. */
const puffImg = (color) => U.sprite('nr-puff-' + color, 96, 96, (g, W) => {
  const R = W / 2;
  g.fillStyle = U.rad(g, R, R, 0, R, [[0, U.rgba(color, 0.72)], [0.5, U.rgba(color, 0.34)], [1, U.rgba(color, 0)]]);
  g.fillRect(0, 0, W, W);
});
const addPuff = (st, p) => { if (st.puffs.length < 140) st.puffs.push({ age: 0, drag: 0.6, grow: 2, alpha: 0.6, ...p }); };
function drawPuffs(ctx, st, dt) {
  st.puffs = st.puffs.filter((p) => (p.age += dt) < p.life);
  for (const p of st.puffs) {
    const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vy *= k; p.x += p.vx * dt; p.y += p.vy * dt;
    const t = p.age / p.life, r = p.size * (1 + t * p.grow);
    ctx.globalAlpha = p.alpha * Math.min(1, t * 7) * (1 - t);
    ctx.drawImage(puffImg(p.color), p.x - r, p.y - r, r * 2, r * 2);
  }
  ctx.globalAlpha = 1;
}
function drawGauge(ctx, w, h, spd, boost, k) {
  const r = U.clamp((w / 2 - (CAR_W / 2) * k - 12) / 2, 30, 70), cx = w - r - 8 - 18 * U.clamp((r - 30) / 40, 0, 1), cy = h - r - 12, a0 = Math.PI * 0.75, sweep = Math.PI * 1.5, t = U.clamp(spd / 620, 0, 1);
  ctx.save();
  ctx.fillStyle = 'rgba(6,10,20,0.9)'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 1.5; ctx.stroke();
  /* tick ring */
  for (let i = 0; i <= 30; i++) {
    const f = i / 30, a = a0 + f * sweep, major = i % 5 === 0, on = f <= t + 0.001;
    ctx.strokeStyle = on ? (f > 0.8 ? '#ff4a58' : f > 0.55 ? '#ff5ac8' : '#22e6ff') : 'rgba(255,255,255,0.2)';
    ctx.lineWidth = major ? 2.8 : 1.8;
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r * (major ? 0.74 : 0.8), cy + Math.sin(a) * r * (major ? 0.74 : 0.8)); ctx.lineTo(cx + Math.cos(a) * r * 0.9, cy + Math.sin(a) * r * 0.9); ctx.stroke();
  }
  const na = a0 + t * sweep;
  bloom(ctx, cx + Math.cos(na) * r * 0.85, cy + Math.sin(na) * r * 0.85, r * 0.3, t > 0.8 ? '#ff4a58' : '#22e6ff', 0.75);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#ffffff';
  ctx.font = '900 ' + Math.round(r * 0.56) + 'px "Big Shoulders Display", Impact, sans-serif'; ctx.fillText(String(spd), cx, cy - r * 0.06);
  ctx.font = '700 ' + Math.max(8, Math.round(r * 0.14)) + 'px "Sora", sans-serif'; ctx.fillStyle = 'rgba(200,235,255,0.78)'; ctx.fillText('KM/H', cx, cy + r * 0.3);
  if (boost > 0.02 && r > 44) {
    ctx.font = '900 ' + Math.max(9, Math.round(r * 0.2)) + 'px "Big Shoulders Display", Impact, sans-serif'; ctx.fillStyle = U.rgba('#ffd23f', Math.min(1, boost * 2)); ctx.fillText('NITRO', cx, cy + r * 0.56);
  }
  ctx.restore();
}

/* The incoming zone is flattened first, so its layers cannot ghost through each other during a crossfade. */
let skyBuffer = null;
function fadeInBackdrop(ctx, V, zone, alpha) {
  const s = ctx.getTransform().a * 0.8, W = Math.ceil((V.w + 80) * s), H = Math.ceil((V.hz + 52) * s);
  if (!skyBuffer) skyBuffer = document.createElement('canvas');
  if (skyBuffer.width !== W || skyBuffer.height !== H) { skyBuffer.width = W; skyBuffer.height = H; }
  const g = skyBuffer.getContext('2d');
  g.setTransform(s, 0, 0, s, 40 * s, 40 * s);
  g.clearRect(-40, -40, V.w + 80, V.hz + 52);
  drawBackdrop(g, V, zone, 1);
  ctx.globalAlpha = alpha; ctx.drawImage(skyBuffer, -40, -40, V.w + 80, V.hz + 52); ctx.globalAlpha = 1;
}

/* ---------- scene ---------- */
const warmUps = [...CAR_WARM_UP, ...WARM_UP];

CG.register({
  id: 'nitro-rush', name: 'Nitro Rush', sub: 'Racing Crash', accent: '#22e6ff', bg: '#0a0614', tags: ['classic'], graph: false,
  blurb: 'A supercar floors it from the desert through a neon city to a night mountain road. Brake before it spins out.',
  mech: 'Classic sprint', crashWord: 'Wrecked', cashWord: 'Pitted', coin: '#22e6ff',
  crashLines: ['Into the barrier at full nitro', 'Lost it on the apex', 'Blew the turbo', 'Spun out and rolled', 'Total write-off', 'Clipped a rival and flipped'],
  sound: { wave: 'sawtooth', base: 82, color: 1 },
  gauge: (m) => Math.round(90 + Math.log(m) * 115) + ' km/h',
  init() {
    return {
      parts: new U.Particles(), puffs: [], travel: 0, speed: 0, steer: 0, shake: 0, props: new Map(), pats: null, boost: 0, boostI: 0, flash: 0, launched: false, crashed: false, cashed: false,
      dir: Math.random() < 0.5 ? -1 : 1, debris: [], nextRival: 180, tread: 0,
      rivals: [{ s: 15, u: -0.64, v: 0, top: 27, paint: 0 }, { s: 20, u: 0.64, v: 0, top: 25, paint: 1 }],
    };
  },
  draw(ctx, w, h, S, st) {
    if (warmUps.length) warmUps.shift()();
    const dt = S.dt, T = S.time, run = S.phase !== 'betting', pp = run ? S.p : 0, going = S.phase === 'running';

    /* drive model */
    const target = going ? 34 + 26 * Math.min(pp, 3.6) : 0;
    st.speed += (target - st.speed) * Math.min(1, dt * (S.phase === 'crashed' ? 1.5 : 2.4));
    st.travel += st.speed * dt;
    const V = makeView(w, h, st, T, pp), fast = U.clamp(st.speed / 110, 0, 1);
    V.scale = ctx.getTransform().a;
    st.steer += (U.clamp(V.curve * 0.5, -1, 1) - st.steer) * Math.min(1, dt * 3.5);
    if (going && st.boostI < BOOSTS.length && S.m >= BOOSTS[st.boostI]) { st.boostI++; st.boost = 1; st.shake = Math.max(st.shake, 7); }
    st.boost = Math.max(0, st.boost - dt * 0.85);
    st.flash = Math.max(0, st.flash - dt * 2.4);
    updateRivals(V, st, S, dt);

    ctx.save();
    if (going) st.shake = Math.max(st.shake, fast * 1.4 + st.boost * 2.5);
    U.shake(ctx, st, dt);

    /* backdrop */
    const [skyA, skyB, skyT] = zoneAt(pp + 0.3);
    drawBackdrop(ctx, V, skyA, 1);
    if (skyT > 0) fadeInBackdrop(ctx, V, skyB, skyT);

    /* ground, road and paint */
    drawSurfaces(ctx, V, st);
    const road = roadPath(V), spans = zoneSpans(V);
    const zCar = DIST / (h - CAR_LINE - V.hz), zc = V.at(zCar), [za, zb, zt] = zoneAt(pp + zCar * LEAD);
    const wet = U.lerp(ZONES[za].wet, ZONES[zb].wet, zt), dark = U.lerp(ZONES[za].dark, ZONES[zb].dark, zt);
    ctx.save(); ctx.clip(road);
    const sheen = U.mixHex(ZONES[skyA].sheen, ZONES[skyB].sheen, skyT);
    bloom(ctx, w / 2 - V.pan, V.hz + 10, 520, sheen, 0.6, 180);
    if (wet > 0.02) cityReflection(ctx, V, 0.55 * wet);
    ctx.restore();
    drawPaint(ctx, V, spans);

    /* haze where the land meets the sky */
    const haze = U.mixHex(ZONES[skyA].haze, ZONES[skyB].haze, skyT);
    ctx.fillStyle = U.lin(ctx, 0, V.hz - 26, 0, V.hz + 110, [[0, U.rgba(haze, 0)], [0.2, U.rgba(haze, 0.78)], [1, U.rgba(haze, 0)]]);
    ctx.fillRect(-40, V.hz - 26, w + 80, 136);

    /* roadside and traffic, far to near */
    const items = collectProps(V, st);
    st.rivals.forEach((r) => { const z = r.s - V.travel; if (z > 6.4 && z < PROP_FAR) items.push({ z, p: { rival: true, u: r.u, paint: r.paint } }); });
    if (V.travel < 66) items.push({ z: Math.max(3, GANTRY_Z - V.travel), p: { gantry: true } });
    items.sort((a, b) => b.z - a.z);
    items.forEach((it) => { if (it.z >= zCar) drawItem(ctx, V, it, S); });

    /* headlights rake the road once it gets dark */
    if (dark > 0.05 && S.phase !== 'crashed') {
      const near = V.at(zCar + 2), far = V.at(zCar + 70), mid = V.at(zCar + 12);
      bloom(ctx, (near.cx + far.cx) / 2, (near.y + far.y) / 2, mid.px * 0.56, '#bcd8ff', dark * 0.55, (near.y - far.y) * 0.62);
    }

    /* the car */
    const k = V.k;
    let x = zc.cx + Math.sin(T * 0.9) * 7 * fast * k - st.steer * 22 * k, y = h - CAR_LINE, rot = -st.steer * 0.022, scale = k, air = 0;
    const idle = S.phase === 'betting';
    if (S.phase === 'crashed') {
      if (!st.crashed) {
        st.crashed = true; st.shake = 26; st.flash = 1;
        U.burst(st.parts, x, y - 90 * k, ['#ffd86b', '#ff8a3d', '#22e6ff', '#cfd6e0', '#ffffff'], 90, { speed: 560, spread: TAU, size: 4.5, shape: 'rect', g: 620 });
        st.debris = [
          { wing: true, x: 0, y: -190, vx: st.dir * -240, vy: -520, rot: 0, vr: st.dir * -7 },
          { x: 165, y: -40, vx: 300 * st.dir, vy: -300, rot: 0, vr: 11 }, { x: -165, y: -40, vx: -260 * st.dir, vy: -420, rot: 0, vr: -14 },
        ];
      }
      const t2 = S.crashAge, flight = 0.92;
      air = t2 < flight ? 150 * 4 * (t2 / flight) * (1 - t2 / flight) : t2 < 1.34 ? 30 * 4 * ((t2 - flight) / 0.42) * (1 - (t2 - flight) / 0.42) : 0;
      rot = st.dir * Math.PI * 3 * (1 - Math.exp(-t2 * 3.4));
      x += st.dir * 210 * k * (1 - Math.exp(-t2 * 1.5));
      scale = k * (1 - 0.16 * U.clamp(t2 / 1.2, 0, 1));
    }
    y -= air * k;

    const wingLift = going ? 3 + fast * 6 : 0, jolt = going ? Math.sin(T * 41) * (0.5 + fast * 0.9) : idle ? Math.sin(T * 31) * 0.55 : 0;
    const launchSquat = going && S.t < 0.5 ? (1 - S.t / 0.5) * 7 : 0;
    const brake = idle ? 0.7 : st.flash;

    /* lights and shadow on the ground */
    shadow(ctx, x, h - CAR_LINE + 5, 250 * scale, 30 * scale, S.phase === 'crashed' ? Math.max(0.2, 0.85 - air / 200) : 0.85);
    bloom(ctx, x, h - CAR_LINE - 3, CAR_W * 0.68 * k, ZONES[za].under, (0.16 + dark * 0.42) * (S.phase === 'crashed' ? Math.max(0, 1 - S.crashAge * 2) : 1), 36 * k);
    if (dark > 0.05 || idle) bloom(ctx, x, h - CAR_LINE + 18 * k, 240 * k, '#ff2438', (idle ? 0.3 : 0.1) + dark * 0.2, 42 * k);

    /* mirror image on wet road */
    if (wet > 0.05 && S.phase !== 'crashed') {
      ctx.save(); ctx.translate(x, h - CAR_LINE + 2 * k); ctx.scale(scale, -scale * 0.52); ctx.globalAlpha = 0.22 * wet;
      drawHero(ctx, { zone: za, next: zb, blend: zt, spin: -1, bob: 0, wing: 0, brake: 0, skew: 0 });
      ctx.restore();
    }

    st.tread += st.speed * dt * 16;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rot); ctx.scale(scale, scale);
    drawHero(ctx, { zone: za, next: zb, blend: zt, spin: run && going ? st.tread : -1, sweep: going ? T * (0.55 + fast * 0.8) : -1, bob: jolt + launchSquat, wing: wingLift - st.boost * 4, brake, skew: S.phase === 'crashed' ? 0 : st.steer * 0.05, noWing: S.phase === 'crashed' });
    ctx.restore();

    /* nitro flames */
    if (going) exhaustFlames(ctx, x, y + (jolt + launchSquat) * k, k, 0.55 + Math.min(1.1, pp * 0.42) + st.boost * 0.9 + (S.t < 0.6 ? 0.6 : 0));
    else if (idle && Math.random() < 0.08) bloom(ctx, x + (Math.random() < 0.5 ? -1 : 1) * EXHAUST_X * k, y + EXHAUST_Y * k, 26 * k, '#ff9a4a', 0.5);

    /* traffic that has dropped behind us passes in front of the car */
    items.forEach((it) => { if (it.z < zCar) drawItem(ctx, V, it, S); });

    /* particles: launch smoke, road spray, sparks, burning wreck */
    const P = st.parts, spray = [['#f0c896', 0.32], ['#9fe8ff', 0.3], ['#e4eefb', 0.42]][za];
    if (idle && S.countdown < 1.8 && Math.random() < 0.6) {
      const sd = Math.random() < 0.5 ? -1 : 1;
      addPuff(st, { x: x + sd * (150 + Math.random() * 44) * k, y: h - CAR_LINE - 8, vx: sd * 34 * Math.random(), vy: -20 - Math.random() * 30, life: 1.5, size: 34 * k, grow: 1.6, color: '#e6e8f0', alpha: 0.32 });
    }
    if (going && S.t < 0.35 && !st.launched) {
      st.launched = true; st.shake = 12;
      for (let i = 0; i < 26; i++) { const sd = i % 2 ? -1 : 1; addPuff(st, { x: x + sd * (140 + Math.random() * 60) * k, y: h - CAR_LINE - 10, vx: sd * (70 + Math.random() * 190), vy: -24 - Math.random() * 80, life: 1.1 + Math.random() * 0.4, size: 40 * k, grow: 2, color: '#e6e8f0', alpha: 0.38, drag: 1.2 }); }
    }
    if (going && Math.random() < 0.3 + fast * 0.5) {
      const sd = Math.random() < 0.5 ? -1 : 1;
      addPuff(st, { x: x + sd * (140 + Math.random() * 56) * k, y: h - CAR_LINE - 4, vx: sd * (30 + Math.random() * 90), vy: 26 + Math.random() * 60, life: 0.5, size: 22 * k, grow: 2.4, color: spray[0], alpha: spray[1] });
    }
    if (S.cashAt && !st.cashed) {
      st.cashed = true; st.flash = 1;
      U.burst(P, x, y - 130 * k, ['#22e6ff', '#ffffff', '#ffd23f'], 54, { speed: 380, size: 4.2, shape: 'rect', spread: TAU, g: 420, life: 1.1 });
    }
    if (S.phase === 'crashed') {
      const age = S.crashAge;
      if (age > 0.1 && Math.random() < 0.9) addPuff(st, { x: x + (Math.random() - 0.5) * 110 * k, y: y - (40 + Math.random() * 50) * k, vx: (Math.random() - 0.5) * 40, vy: -80 - Math.random() * 70, life: 2.4, size: 56 * k, grow: 2, color: '#26262e', alpha: 0.8, drag: 0.25 });
      if (age > 0.9 && age < 2.1) for (let i = 0; i < 3; i++) P.add({ x: x + (Math.random() - 0.5) * 220 * k, y: h - CAR_LINE, vx: -st.dir * (120 + Math.random() * 300), vy: -60 - Math.random() * 160, g: 700, life: 0.5, size: 2, color: '#ffd27a', shape: 'line' });
      const fire = 44 * k * (0.8 + Math.random() * 0.5);
      bloom(ctx, x, y - 40 * k, fire * 3, '#ff5a1f', 0.6 + Math.random() * 0.2); bloom(ctx, x, y - 54 * k, fire * 1.6, '#ffd27a', 0.8);
      if (age < 0.55) { const e = 1 - age / 0.55; bloom(ctx, x, y - 90 * k, 520 * k * (1.3 - e * 0.3), '#ff9a3a', 0.95 * e); bloom(ctx, x, y - 90 * k, 260 * k, '#fff4d0', e); }
      st.debris.forEach((d) => {
        d.vy += 980 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.rot += d.vr * dt;
        const ground = -24; if (d.y > ground) { d.y = ground; d.vy *= -0.42; d.vx *= 0.7; d.vr *= 0.7; }
        ctx.save(); ctx.translate(x + d.x * k, h - CAR_LINE + d.y * k); ctx.rotate(d.rot); ctx.scale(k, k);
        if (d.wing) { ctx.translate(0, 186); blit(ctx, heroWing()); }
        else { ctx.fillStyle = '#0c0d10'; ctx.beginPath(); ctx.arc(0, 0, 27, 0, TAU); ctx.fill(); ctx.strokeStyle = '#4a5364'; ctx.lineWidth = 3.4; ctx.beginPath(); ctx.arc(0, 0, 16, 0, TAU); ctx.stroke(); for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 15, Math.sin(a) * 15); ctx.stroke(); } }
        ctx.restore();
      });
    }
    drawPuffs(ctx, st, dt);
    P.update(dt); P.draw(ctx);

    /* speed, boost and grade */
    if (going && fast > 0.28) speedLines(ctx, V, U.clamp((fast - 0.28) * 1.2 + st.boost * 0.7, 0, 1));
    if (st.boost > 0.02) bloom(ctx, x, y + EXHAUST_Y * k, 420 * k, '#4db8ff', st.boost * 0.34, 170 * k);
    if (S.phase === 'crashed' && S.crashAge < 0.25) { ctx.fillStyle = U.rgba('#ffffff', 0.72 * (1 - S.crashAge * 4)); ctx.fillRect(-40, -40, w + 80, h + 80); }
    drawGauge(ctx, w, h, going ? Math.round(90 + pp * 115) : 0, st.boost, k);
    U.vignette(ctx, w, h, 0.42);
    ctx.restore();
  },
});
