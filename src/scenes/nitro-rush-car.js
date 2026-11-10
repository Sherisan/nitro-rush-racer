/* Nitro Rush car art: an original rear-view hypercar painted once into cached sprites.
   Design units match virtual pixels at full size. The origin is the rear axle centre on the ground. */
import { CG } from '../engine/core.js';
import '../engine/art.js';

const U = CG.U;
const TAU = Math.PI * 2;
const BOX_W = 500, BOX_H = 290, OX = 250, OY = 262;
export const CAR_W = 404;

const PAINTS = {
  hero: { hi: '#b8fbff', a: '#2fdcff', b: '#0d96ee', c: '#0a52b8', d: '#05265e', stripe: '#f4fbff', trim: '#ffd23f' },
  red: { hi: '#ffc0b0', a: '#ff5240', b: '#d9202c', c: '#8c1022', d: '#470811', stripe: '#ffffff', trim: '#ffffff' },
  white: { hi: '#ffffff', a: '#eef2f8', b: '#c0cada', c: '#76829c', d: '#343c52', stripe: '#ff3b4e', trim: '#20c0ff' },
  violet: { hi: '#e6c8ff', a: '#a86bff', b: '#6d33d6', c: '#3f1a8c', d: '#1f0c4c', stripe: '#ffd23f', trim: '#ffd23f' },
  gold: { hi: '#fff0b8', a: '#ffc53d', b: '#d98a12', c: '#8a4f0a', d: '#452604', stripe: '#16181e', trim: '#16181e' },
};
const RIVAL_PAINTS = ['red', 'white', 'violet', 'gold'];

/* What the glossy upper surfaces reflect in each zone of the drive. */
const SKIES = [
  { top: '#5a3f94', mid: '#ff8d63', low: '#ffd49a', rim: '#ffb46a', glass: '#ff9a68' },
  { top: '#2c1470', mid: '#ff3fb4', low: '#39e8ff', rim: '#ff62cc', glass: '#d846c8' },
  { top: '#0c1a38', mid: '#3e6aa8', low: '#a9d2ff', rim: '#a6d0ff', glass: '#4a7cc0' },
];
const NEUTRAL = { top: '#55607c', mid: '#9fb0c8', low: '#e0e8f4', rim: '#ffffff', glass: '#6d7f9c' };

const both = (g, fn) => { [1, -1].forEach((s) => { g.save(); g.scale(s, 1); fn(s); g.restore(); }); };

/* Symmetric closed outline from its right half. Start at [x, y]; each entry is [x, y] (line) or [c1x, c1y, c2x, c2y, x, y] (curve). */
const mirrored = (start, segs) => {
  const p = new Path2D(); p.moveTo(start[0], start[1]);
  const ends = [start];
  segs.forEach((s) => { if (s.length === 2) p.lineTo(s[0], s[1]); else p.bezierCurveTo(s[0], s[1], s[2], s[3], s[4], s[5]); ends.push(s.slice(-2)); });
  for (let i = segs.length - 1; i >= 0; i--) {
    const s = segs[i], to = ends[i];
    if (s.length === 2) p.lineTo(-to[0], to[1]); else p.bezierCurveTo(-s[2], s[3], -s[0], s[1], -to[0], to[1]);
  }
  p.closePath();
  return p;
};

const SHELL = () => mirrored([0, -228], [
  [46, -228, 80, -226, 96, -215],
  [112, -203, 124, -178, 134, -158],
  [152, -162, 174, -158, 188, -138],
  [198, -126, 203, -108, 203, -92],
  [203, -76, 197, -62, 187, -58],
  [136, -58],
  [127, -58, 123, -52, 121, -44],
  [114, -26],
  [0, -26],
]);
const GLASS = () => mirrored([0, -219], [[40, -219, 74, -218, 86, -210], [100, -200, 112, -178, 120, -162], [0, -162]]);
const FASCIA = () => mirrored([0, -134], [
  [108, -134],
  [146, -139, 180, -138, 195, -115],
  [198, -106, 194, -100, 186, -97],
  [152, -89, 124, -82, 96, -80],
  [0, -80],
]);
const VALANCE = () => mirrored([0, -62], [[108, -62], [130, -58], [122, -44], [114, -24], [0, -24]]);

const pat = (g, size, paint, scale) => {
  const c = document.createElement('canvas'); c.width = c.height = size;
  paint(c.getContext('2d'), size);
  const p = g.createPattern(c, 'repeat');
  if (p && p.setTransform) p.setTransform(new DOMMatrix().scale(scale));
  return p;
};
const carbon = (g) => pat(g, 8, (q) => {
  q.fillStyle = '#0a0b0f'; q.fillRect(0, 0, 8, 8);
  q.fillStyle = '#20232b'; q.fillRect(0, 0, 4, 4); q.fillRect(4, 4, 4, 4);
  q.fillStyle = '#15171d'; q.fillRect(4, 0, 4, 4); q.fillRect(0, 4, 4, 4);
}, 0.55);
const mesh = (g) => pat(g, 10, (q) => {
  q.fillStyle = '#050609'; q.fillRect(0, 0, 10, 10);
  q.strokeStyle = 'rgba(120,135,165,0.38)'; q.lineWidth = 0.9;
  q.beginPath(); q.moveTo(0, 2); q.lineTo(5, 0); q.lineTo(10, 2); q.moveTo(0, 2); q.lineTo(0, 6); q.lineTo(5, 8); q.lineTo(10, 6); q.lineTo(10, 2); q.moveTo(5, 8); q.lineTo(5, 10); q.stroke();
}, 0.42);

/* Tail-light signature: one hairline across the car, three raked slashes at each end. */
const bladeShapes = (g, line, slash, inset = 0) => {
  g.fillStyle = line; g.fillRect(-172, -123 + inset * 0.4, 344, 3.4 - inset * 0.8);
  both(g, () => {
    g.fillStyle = slash;
    for (let i = 0; i < 3; i++) {
      const x = 146 + i * 14.5, t = -131 + i * 1.5 + inset, b = -106 + i * 2.4 - inset;
      g.beginPath(); g.moveTo(x + inset, t); g.lineTo(x + 8.5 - inset, t - 1); g.lineTo(x + 1.5 - inset, b); g.lineTo(x - 7.5 + inset, b); g.closePath(); g.fill();
    }
  });
};

function paintTyres(g) {
  both(g, () => {
    const x = 128, w = 76, t = -106;
    g.fillStyle = U.lin(g, x, 0, x + w, 0, [[0, '#020203'], [0.09, '#141518'], [0.3, '#2a2c31'], [0.62, '#202226'], [0.9, '#0e0f12'], [1, '#020203']]);
    U.rr(g, x, t, w, -t, [22, 22, 20, 20]); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.7)';
    [0.26, 0.5, 0.74].forEach((k) => { U.rr(g, x + w * k - 1.6, t + 6, 3.2, -t - 8, 1.6); g.fill(); });
    g.fillStyle = U.lin(g, x, 0, x + w, 0, [[0, 'rgba(255,255,255,0)'], [0.4, 'rgba(255,255,255,0.1)'], [0.62, 'rgba(255,255,255,0)']]);
    U.rr(g, x + 4, t + 6, w - 8, -t - 12, 16); g.fill();
    g.fillStyle = U.lin(g, 0, -20, 0, 0, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.9)']]);
    U.rr(g, x, -20, w, 20, [0, 0, 20, 20]); g.fill();
  });
}

function paintBody(g, P, R) {
  const body = SHELL(), glass = GLASS(), fascia = FASCIA(), valance = VALANCE();

  /* under-tray and wheel wells behind the shell */
  g.fillStyle = '#030406'; U.rr(g, -134, -84, 268, 62, 6); g.fill();

  /* base paint */
  g.fillStyle = U.lin(g, 0, -228, 0, -26, [[0, P.hi], [0.12, P.a], [0.4, P.b], [0.66, P.c], [1, P.d]]);
  g.fill(body);

  g.save(); g.clip(body);

  /* muscular hips: a pool of light on top of each rear fender */
  both(g, () => {
    g.fillStyle = U.rad(g, 160, -152, 4, 76, [[0, U.rgba(P.hi, 0.95)], [0.4, U.rgba(P.a, 0.55)], [1, U.rgba(P.a, 0)]]);
    g.fillRect(70, -228, 150, 152);
  });

  /* the shoulders keep their colour and carry a thin horizon glint */
  both(g, () => {
    const sh = new Path2D();
    sh.moveTo(124, -162); sh.bezierCurveTo(152, -168, 186, -162, 206, -128);
    sh.lineTo(206, -112); sh.bezierCurveTo(186, -130, 160, -142, 118, -141); sh.closePath();
    g.fillStyle = U.lin(g, 0, -162, 0, -112, [[0, U.rgba(R.top, 0.2)], [0.5, U.rgba(R.mid, 0.34)], [0.53, U.rgba(R.low, 0.85)], [0.6, U.rgba(R.mid, 0.3)], [1, U.rgba(R.mid, 0)]]);
    g.fill(sh);
  });

  /* lower body falls into shadow */
  g.fillStyle = U.lin(g, 0, -116, 0, -30, [[0, 'rgba(1,4,18,0)'], [1, 'rgba(1,4,18,0.78)']]);
  g.fillRect(-210, -116, 420, 92);

  /* flanks turn away from the light */
  g.fillStyle = U.lin(g, -204, 0, 204, 0, [[0, 'rgba(0,0,12,0.72)'], [0.09, 'rgba(0,0,12,0.08)'], [0.2, 'rgba(0,0,12,0)'], [0.8, 'rgba(0,0,12,0)'], [0.91, 'rgba(0,0,12,0.08)'], [1, 'rgba(0,0,12,0.72)']]);
  g.fillRect(-210, -232, 420, 212);
  g.restore();

  /* rear screen with the sky lying in it */
  g.fillStyle = U.lin(g, 0, -219, 0, -162, [[0, U.mixHex(R.glass, '#04060c', 0.25)], [0.38, U.mixHex(R.glass, '#04060c', 0.72)], [1, '#04060c']]);
  g.fill(glass);
  g.save(); g.clip(glass);
  g.fillStyle = 'rgba(255,255,255,0.16)';
  g.beginPath(); g.moveTo(-62, -222); g.lineTo(-28, -222); g.lineTo(-76, -160); g.lineTo(-110, -160); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.09)';
  g.beginPath(); g.moveTo(-16, -222); g.lineTo(-5, -222); g.lineTo(-52, -160); g.lineTo(-63, -160); g.fill();
  /* engine-bay louvres over the lower screen */
  for (let i = 0; i < 6; i++) {
    const y = -200 + i * 6.6, hw = 66 + i * 9.5;
    g.fillStyle = U.lin(g, 0, y, 0, y + 4, [[0, U.rgba(P.a, 0.95)], [0.4, P.b], [1, P.d]]);
    U.rr(g, -hw, y, hw * 2, 3.6, 1.6); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.75)'; g.fillRect(-hw, y + 3.6, hw * 2, 2);
  }
  g.restore();
  g.lineWidth = 1.4; g.strokeStyle = 'rgba(5,8,16,0.9)'; g.stroke(glass);

  /* spine and twin stripes run from the roof to the tail */
  g.fillStyle = U.lin(g, 0, -228, 0, -134, [[0, P.stripe], [1, U.mixHex(P.stripe, P.c, 0.3)]]);
  both(g, () => {
    g.beginPath(); g.moveTo(9, -228); g.lineTo(25, -228); g.lineTo(26, -219.5); g.lineTo(10, -219.5); g.fill();
    g.beginPath(); g.moveTo(12, -161); g.lineTo(32, -161); g.lineTo(39, -135); g.lineTo(14, -135); g.fill();
  });
  g.fillStyle = U.lin(g, -6, 0, 6, 0, [[0, P.d], [0.5, P.hi], [1, P.d]]);
  g.beginPath(); g.moveTo(-3, -219); g.lineTo(3, -219); g.lineTo(5, -161); g.lineTo(-5, -161); g.fill();

  /* roof gets a bright skin */
  g.save(); g.clip(body);
  g.fillStyle = U.lin(g, 0, -229, 0, -217, [[0, 'rgba(255,255,255,0.8)'], [1, 'rgba(255,255,255,0)']]);
  g.fillRect(-100, -230, 200, 14);
  g.restore();

  /* tail fascia: recessed honeycomb */
  g.fillStyle = mesh(g); g.fill(fascia);
  g.save(); g.clip(fascia);
  g.fillStyle = U.lin(g, 0, -134, 0, -80, [[0, 'rgba(0,0,0,0.72)'], [0.4, 'rgba(0,0,0,0.1)'], [1, 'rgba(0,0,0,0.5)']]);
  g.fillRect(-200, -140, 400, 62);
  g.restore();
  g.lineWidth = 1.5; g.strokeStyle = U.rgba(P.hi, 0.5); g.stroke(fascia);

  /* tail-light housing and the lit blade */
  g.fillStyle = 'rgba(30,0,4,0.9)'; U.rr(g, -176, -126, 352, 9, 3); g.fill();
  g.save();
  g.shadowColor = '#ff1a2c'; g.shadowBlur = 16;
  bladeShapes(g, '#ff2a3a', '#ff2a3a');
  g.restore();
  bladeShapes(g, '#ff4a56', '#ff2a3a');
  bladeShapes(g, '#ffd9d2', '#ff8f86', 2.4);

  /* wordmark, hand-spaced so it reads like fitted badging */
  g.font = '800 14px "Arial Narrow", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  'NITRO'.split('').forEach((c, i) => {
    const x = (i - 2) * 26;
    g.fillStyle = 'rgba(0,0,0,0.7)'; g.fillText(c, x, -103.4);
    g.fillStyle = U.lin(g, 0, -110, 0, -96, [[0, '#ffffff'], [1, '#9fb2c8']]); g.fillText(c, x, -104);
  });

  /* lower bumper and carbon diffuser */
  g.fillStyle = carbon(g); g.fill(valance);
  g.save(); g.clip(valance);
  g.fillStyle = U.lin(g, 0, -62, 0, -24, [[0, 'rgba(0,0,0,0.05)'], [1, 'rgba(0,0,0,0.75)']]);
  g.fillRect(-140, -64, 280, 42);
  for (const x of [-96, -74, -52, 52, 74, 96]) {
    const lean = x * 0.11;
    g.fillStyle = U.lin(g, x - 2.2, 0, x + 2.2, 0, [[0, '#050608'], [0.5, '#5b6478'], [1, '#050608']]);
    g.beginPath(); g.moveTo(x - 1.6, -50); g.lineTo(x + 1.6, -50); g.lineTo(x + 2.4 + lean, -22); g.lineTo(x - 2.4 + lean, -22); g.fill();
  }
  g.restore();
  g.lineWidth = 1.2; g.strokeStyle = 'rgba(255,255,255,0.13)'; g.stroke(valance);

  /* centre pod with rain light and twin exhausts */
  const pod = mirrored([0, -92], [[58, -92], [66, -80], [58, -44], [0, -42]]);
  g.fillStyle = carbon(g); g.fill(pod);
  g.lineWidth = 1.4; g.strokeStyle = U.rgba(P.hi, 0.42); g.stroke(pod);
  both(g, () => {
    const x = EXHAUST_X, y = EXHAUST_Y, r = 17;
    g.fillStyle = U.lin(g, x - r, y - r, x + r, y + r, [[0, '#f4f6ff'], [0.28, '#8691bc'], [0.5, '#c083ff'], [0.74, '#37bcff'], [1, '#262b3a']]);
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    g.fillStyle = '#020305'; g.beginPath(); g.arc(x, y, r - 3.2, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(160,175,205,0.45)'; g.lineWidth = 1.1;
    g.beginPath(); g.arc(x, y, r - 6.5, 0, TAU); g.stroke();
    g.fillStyle = U.rad(g, x, y, 0, r - 4, [[0, 'rgba(255,120,40,0.6)'], [0.65, 'rgba(120,30,10,0.18)'], [1, 'rgba(0,0,0,0)']]);
    g.beginPath(); g.arc(x, y, r - 4, 0, TAU); g.fill();
  });
  g.fillStyle = '#25030a'; U.rr(g, -9, -54, 18, 8, 2); g.fill();
  for (let i = 0; i < 4; i++) { g.fillStyle = '#ff3448'; g.fillRect(-7.4 + i * 4, -52.4, 2.8, 4.8); }

  /* haunch vents behind the rear wheels */
  both(g, () => {
    const v = new Path2D();
    v.moveTo(146, -95); v.lineTo(194, -100); v.bezierCurveTo(198, -88, 197, -74, 192, -66); v.lineTo(160, -64); v.closePath();
    g.fillStyle = mesh(g); g.fill(v);
    g.fillStyle = U.lin(g, 150, 0, 196, 0, [[0, 'rgba(0,0,0,0.35)'], [1, 'rgba(0,0,0,0.75)']]); g.fill(v);
    g.lineWidth = 1.3; g.strokeStyle = U.rgba(P.hi, 0.6); g.stroke(v);
    g.fillStyle = P.trim; g.beginPath(); g.moveTo(149, -94); g.lineTo(153.5, -94.5); g.lineTo(165, -64.6); g.lineTo(161, -64.6); g.fill();
  });

  /* creases: hard specular lines that sell the sheet metal */
  both(g, () => {
    g.lineCap = 'round';
    g.strokeStyle = U.lin(g, 130, 0, 196, 0, [[0, 'rgba(255,255,255,0)'], [0.45, 'rgba(255,255,255,0.95)'], [1, 'rgba(255,255,255,0.12)']]);
    g.lineWidth = 1.7;
    g.beginPath(); g.moveTo(134, -158); g.bezierCurveTo(152, -162, 174, -158, 188, -138); g.stroke();
    g.strokeStyle = U.lin(g, 96, 0, 200, 0, [[0, 'rgba(255,255,255,0)'], [0.6, U.rgba(R.rim, 0.75)], [1, U.rgba(R.rim, 0)]]);
    g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(100, -78); g.bezierCurveTo(140, -80, 172, -86, 199, -103); g.stroke();
    g.strokeStyle = U.rgba(R.rim, 0.85); g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(202.5, -112); g.bezierCurveTo(204, -96, 203, -78, 196, -64); g.stroke();
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(96, -215); g.bezierCurveTo(112, -203, 124, -178, 134, -158); g.stroke();
  });

  /* mirrors on stalks, seen from behind */
  both(g, () => {
    g.strokeStyle = P.d; g.lineWidth = 3.4; g.beginPath(); g.moveTo(112, -192); g.lineTo(130, -194); g.stroke();
    g.fillStyle = U.lin(g, 0, -208, 0, -184, [[0, P.a], [1, P.c]]);
    U.rr(g, 128, -208, 38, 22, [10, 11, 7, 7]); g.fill();
    g.fillStyle = U.lin(g, 0, -205, 0, -189, [[0, R.mid], [1, '#07090f']]);
    U.rr(g, 131.5, -205, 31, 15.5, [7, 8, 5, 5]); g.fill();
  });
}

function paintWing(g, P) {
  both(g, () => {
    /* swan-neck pylons */
    g.fillStyle = U.lin(g, 44, 0, 62, 0, [[0, '#07080c'], [0.5, '#39404f'], [1, '#07080c']]);
    g.beginPath(); g.moveTo(44, -153); g.lineTo(60, -153); g.bezierCurveTo(57, -163, 57, -170, 62, -180); g.lineTo(52, -180); g.bezierCurveTo(46, -170, 44, -163, 44, -153); g.fill();
    /* endplates */
    g.fillStyle = U.lin(g, 0, -204, 0, -148, [[0, P.a], [0.5, P.b], [1, P.d]]);
    g.beginPath(); g.moveTo(162, -198); g.lineTo(176, -202); g.lineTo(180, -156); g.lineTo(164, -148); g.closePath(); g.fill();
    g.strokeStyle = U.rgba(P.hi, 0.75); g.lineWidth = 1.2; g.beginPath(); g.moveTo(176, -202); g.lineTo(180, -156); g.stroke();
    g.fillStyle = P.trim; g.beginPath(); g.moveTo(166, -190); g.lineTo(175, -193); g.lineTo(176.5, -181); g.lineTo(167, -178); g.fill();
  });
  const blade = mirrored([0, -195], [[96, -195], [142, -195, 166, -196, 170, -194], [170, -180], [114, -176, 56, -174, 0, -174]]);
  g.fillStyle = U.lin(g, 0, -195, 0, -174, [[0, '#2b3242'], [0.18, '#0e1118'], [0.6, '#05060a'], [1, '#14171f']]);
  g.fill(blade);
  g.save(); g.clip(blade);
  g.fillStyle = carbon(g); g.globalAlpha = 0.65; g.fillRect(-172, -195, 344, 22); g.globalAlpha = 1;
  g.fillStyle = U.lin(g, 0, -195, 0, -186, [[0, U.rgba(P.hi, 0.62)], [1, 'rgba(255,255,255,0)']]);
  g.fillRect(-172, -196, 344, 10);
  g.restore();
  g.fillStyle = P.a; g.fillRect(-168, -178.6, 336, 1.6);
}

/* Additive overlay for the brake and launch glow. */
function paintGlow(g) {
  g.save();
  g.shadowColor = '#ff2438'; g.shadowBlur = 54;
  for (let i = 0; i < 3; i++) bladeShapes(g, '#ff2438', '#ff2438');
  g.restore();
  bladeShapes(g, '#ffffff', '#ffffff');
}

const make = (key, res, paint) => U.sprite(key, BOX_W * res, BOX_H * res, (g) => { g.scale(res, res); g.translate(OX, OY); paint(g); });

export const EXHAUST_X = 31, EXHAUST_Y = -67;
export const heroTyres = () => make('nr-car-tyres', 3, paintTyres);
export const heroBody = (zone) => make('nr-car-body-' + zone, 3, (g) => paintBody(g, PAINTS.hero, SKIES[zone]));
export const heroWing = () => make('nr-car-wing', 3, (g) => paintWing(g, PAINTS.hero));
export const heroGlow = () => make('nr-car-glow', 2, paintGlow);
export const rivalCar = (i) => {
  const name = RIVAL_PAINTS[i % RIVAL_PAINTS.length];
  return make('nr-rival-' + name, 1.6, (g) => { paintTyres(g); paintBody(g, PAINTS[name], NEUTRAL); paintWing(g, PAINTS[name]); });
};
export const blit = (ctx, img) => ctx.drawImage(img, -OX, -OY, BOX_W, BOX_H);
export const CAR_WARM_UP = [heroTyres, () => heroBody(0), heroWing, heroGlow, () => heroBody(1), () => heroBody(2), () => rivalCar(0), () => rivalCar(1), () => rivalCar(2), () => rivalCar(3)];

let shellPath = null;
/* The hero at its current attitude. ctx is already at the car's ground point and scale. */
export function drawHero(ctx, o) {
  const { zone, next, blend, spin, bob, wing, brake, skew } = o;
  ctx.save();
  if (skew) ctx.transform(1, 0, skew, 1, 0, 0);
  blit(ctx, heroTyres());
  /* tread blocks rolling past */
  if (spin >= 0) {
    both(ctx, () => {
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      for (let i = 0; i < 6; i++) { const y = -100 + U.wrap(i * 16 + spin, 96); ctx.fillRect(132, y, 68, 2); }
    });
  }
  ctx.translate(0, bob);
  blit(ctx, heroBody(zone));
  if (blend > 0) { const a = ctx.globalAlpha; ctx.globalAlpha = a * blend; blit(ctx, heroBody(next)); ctx.globalAlpha = a; }
  /* a band of light rolls over the bodywork as the world streams past */
  if (o.sweep >= 0) {
    shellPath = shellPath || SHELL();
    const p = U.wrap(o.sweep, 1) * 900 - 450;
    ctx.save(); ctx.clip(shellPath); ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = U.lin(ctx, p - 70, 0, p + 70, -40, [[0, 'rgba(255,255,255,0)'], [0.5, 'rgba(255,255,255,0.26)'], [1, 'rgba(255,255,255,0)']]);
    ctx.fillRect(-210, -232, 420, 150);
    ctx.restore();
  }
  if (!o.noWing) { ctx.save(); ctx.translate(0, -wing); blit(ctx, heroWing()); ctx.restore(); }
  if (brake > 0) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, brake);
    blit(ctx, heroGlow());
    ctx.restore();
  }
  ctx.restore();
}
