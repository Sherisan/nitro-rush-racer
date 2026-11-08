/* NITRO RUSH: supercar sprint */
import { CG } from '../engine/core.js';
import '../engine/art.js';

const U = CG.U;
const TAU = Math.PI * 2;

/* ============================================================
   8. NITRO RUSH: supercar sprint
   ============================================================ */
const ENVS = [
  { sky0: '#ffb46b', sky1: '#ff7a4a', ground: '#c98a4e', rumbleA: '#d63a2a', rumbleB: '#f2e6d0', road: '#4a4440', sun: '#fff0b0', hz: '#8a4a2a', obj: 'cactus' },
  { sky0: '#140832', sky1: '#ff3fb4', ground: '#0e0820', rumbleA: '#22e6ff', rumbleB: '#ff3fb4', road: '#16122a', sun: '#ffd23f', hz: '#0c0618', obj: 'lamp' },
  { sky0: '#03050d', sky1: '#1a2a4a', ground: '#0a1610', rumbleA: '#e8e8e8', rumbleB: '#5a5a62', road: '#1c1e22', sun: '#e8f0ff', hz: '#08100e', obj: 'pine' },
];
const carRear = () => U.sprite('nr-car', 260, 120, (g) => {
  g.translate(130, 70);
  g.fillStyle = '#08080a'; U.rr(g, -122, 4, 50, 40, 6); g.fill(); U.rr(g, 72, 4, 50, 40, 6); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(-118, 8, 4, 30); g.fillRect(114, 8, 4, 30);
  g.fillStyle = U.lin(g, 0, -60, 0, 30, [[0, '#56708e'], [0.25, '#2a3a52'], [0.7, '#141c2a'], [1, '#07090e']]);
  g.beginPath(); g.moveTo(-124, 22); g.lineTo(-118, -8); g.quadraticCurveTo(-96, -26, -70, -50); g.lineTo(70, -50); g.quadraticCurveTo(96, -26, 118, -8); g.lineTo(124, 22); g.closePath(); g.fill();
  g.fillStyle = U.lin(g, 0, -48, 0, -20, [[0, '#4a7aa8'], [0.3, '#0e1a2a'], [1, '#05080e']]);
  g.beginPath(); g.moveTo(-60, -46); g.lineTo(60, -46); g.lineTo(80, -20); g.lineTo(-80, -20); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.2)'; g.beginPath(); g.moveTo(-40, -44); g.lineTo(-10, -44); g.lineTo(-30, -22); g.lineTo(-56, -22); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(-110, -10, 220, 2);
  g.fillStyle = '#0a0a0c'; g.fillRect(-90, 8, 180, 18);
  for (let k = 0; k < 9; k++) { g.fillStyle = '#18181c'; g.fillRect(-80 + k * 20, 10, 10, 14); }
  [-52, -36, 36, 52].forEach((x) => { g.fillStyle = U.rad(g, x, 20, 1, 7, [[0, '#1a1a1a'], [0.7, '#5a5e66'], [1, '#2a2c30']]); g.beginPath(); g.arc(x, 20, 7, 0, TAU); g.fill(); g.fillStyle = '#050505'; g.beginPath(); g.arc(x, 20, 4, 0, TAU); g.fill(); });
  g.fillStyle = '#0c0c0e'; g.fillRect(-100, -64, 200, 7); g.fillRect(-76, -58, 6, 10); g.fillRect(70, -58, 6, 10);
  g.fillStyle = '#e8eaee'; g.font = '800 9px sans-serif'; g.textAlign = 'center'; g.fillText('NITRO', 0, 2);
});
CG.register({
  id: 'nitro-rush', name: 'Nitro Rush', sub: 'Racing Crash', accent: '#22e6ff', bg: '#0a0614', tags: ['classic'],
  blurb: 'A supercar floors it from the desert through a neon city to a night mountain road. Brake before it spins out.',
  mech: 'Classic sprint', crashWord: 'Wrecked', cashWord: 'Pitted', coin: '#22e6ff',
  sound: { wave: 'sawtooth', base: 82, color: 1 },
  gauge: (m) => Math.round(90 + Math.log(m) * 115) + ' km/h',
  init() { return { parts: new U.Particles(), crashed: false, cashed: false, travel: 0, spin: 0, slide: 0, speed: 0 }; },
  draw(ctx, w, h, S, st) {
    const dt = S.dt, p = S.p, T = S.time, run = S.phase !== 'betting', pp = run ? p : 0;
    const tgt = S.phase === 'running' ? 0.8 + pp * 1.3 : 0;
    st.speed += (tgt - st.speed) * Math.min(1, dt * (S.phase === 'crashed' ? 2 : 1.5)); st.travel += st.speed * dt * 10;
    const ei = pp < 1.2 ? 0 : pp < 2.6 ? 1 : 2, eb = ei === 0 ? U.clamp((pp - 1.0) / 0.2, 0, 1) : ei === 1 ? U.clamp((pp - 2.4) / 0.2, 0, 1) : 0;
    const E = ENVS[ei], N = ENVS[Math.min(2, ei + 1)], c = (k) => U.mixHex(E[k], N[k], eb);
    const hz = h * 0.45;
    ctx.save(); U.shake(ctx, st, dt);
    ctx.fillStyle = U.lin(ctx, 0, 0, 0, hz, [[0, c('sky0')], [1, c('sky1')]]); ctx.fillRect(-40, -40, w + 80, hz + 40);
    if (ei === 2) { const r = U.rng(9); for (let i = 0; i < 80; i++) { ctx.fillStyle = U.rgba('#ffffff', r() * 0.8); ctx.fillRect(r() * w, r() * hz * 0.8, 1.3, 1.3); } }
    const sunC = c('sun'); U.light(ctx, w * 0.5, hz - 50, 220, sunC, 0.35);
    ctx.fillStyle = U.lin(ctx, 0, hz - 110, 0, hz, [[0, sunC], [1, U.mixHex(sunC, c('sky1'), 0.5)]]); ctx.beginPath(); ctx.arc(w * 0.5, hz - 30, 74, Math.PI, TAU); ctx.fill();
    if (ei === 1) { ctx.fillStyle = c('sky1'); for (let k = 0; k < 6; k++) ctx.fillRect(w * 0.5 - 80, hz - 64 + k * 9, 160, 2 + k * 0.6); }
    const sc = st.travel * 0.4;
    if (ei === 1) { for (let i = -2; i < 30; i++) { const x = U.wrap(i * 42 - sc * 0.05, w + 120) - 60, r = U.rng(i + 400), bh = 30 + r() * 110; ctx.fillStyle = c('hz'); ctx.fillRect(x, hz - bh, 36, bh); for (let k = 0; k < 9; k++) if (r() < 0.5) { ctx.fillStyle = U.rgba(['#ffd23f', '#22e6ff', '#ff3fb4'][k % 3], 0.6); ctx.fillRect(x + 5 + (k % 3) * 10, hz - bh + 8 + Math.floor(k / 3) * 14, 4, 6); } } }
    else U.ridge(ctx, w, h, hz, ei === 0 ? 60 : 110, ei === 0 ? 0.004 : 0.006, sc * 0.05, 61 + ei, c('hz'), 6);
    ctx.fillStyle = c('ground'); ctx.fillRect(-40, hz, w + 80, h - hz + 40);
    const curve = Math.sin(st.travel * 0.004) * 0.8;
    const roadAt = (d) => ({ cx: w / 2 + curve * 130 * (1 - d) * (1 - d), rw: w * 0.035 + d * w * 0.62 });
    for (let y = hz; y < h + 2; y += 2) {
      const d = (y - hz) / (h - hz), z = 1 / Math.max(0.02, d), R = roadAt(d);
      const stripe = Math.floor(z * 3 + st.travel * 0.25) % 2 === 0;
      ctx.fillStyle = stripe ? U.mixHex(c('ground'), '#000000', 0.05) : c('ground'); ctx.fillRect(-40, y, w + 80, 2.6);
      ctx.fillStyle = stripe ? c('rumbleA') : c('rumbleB'); ctx.fillRect(R.cx - R.rw * 1.09, y, R.rw * 2.18, 2.6);
      ctx.fillStyle = c('road'); ctx.fillRect(R.cx - R.rw, y, R.rw * 2, 2.6);
      if (stripe) { ctx.fillStyle = 'rgba(240,240,240,0.85)'; ctx.fillRect(R.cx - R.rw * 0.012, y, R.rw * 0.024, 2.6); ctx.fillRect(R.cx - R.rw * 0.5, y, R.rw * 0.012, 2.6); ctx.fillRect(R.cx + R.rw * 0.49, y, R.rw * 0.012, 2.6); }
    }
    // wet reflections in the city
    if (ei === 1) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; for (let k = 0; k < 6; k++) { const x = w * 0.2 + k * w * 0.12; ctx.fillStyle = U.lin(ctx, 0, hz, 0, h, [[0, U.rgba(['#ff3fb4', '#22e6ff'][k % 2], 0.25)], [1, 'rgba(0,0,0,0)']]); ctx.fillRect(x, hz, 6, h - hz); } ctx.restore(); }
    // roadside objects, far to near
    const objs = [];
    const base = Math.floor(st.travel * 0.25 / 6) * 6;
    for (let u = base; u < base + 200; u += 6) { const z = (u - st.travel * 0.25) / 3; if (z < 0.9 || z > 40) continue; objs.push(z); }
    objs.sort((a, b) => b - a);
    for (const z of objs) {
      const d = 1 / z, y = hz + d * (h - hz), R = roadAt(d), s = d * 1.6;
      [-1, 1].forEach((side) => {
        const x = R.cx + side * R.rw * 1.35;
        ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
        if (E.obj === 'cactus' && eb < 0.5) { ctx.fillStyle = '#3a6a2a'; U.rr(ctx, -7, -70, 14, 70, 7); ctx.fill(); U.rr(ctx, -22, -50, 10, 26, 5); ctx.fill(); ctx.fillRect(-16, -28, 12, 7); U.rr(ctx, 12, -60, 10, 30, 5); ctx.fill(); ctx.fillRect(4, -34, 12, 7); }
        else if ((E.obj === 'lamp' && eb < 0.5) || (E.obj === 'cactus' && eb >= 0.5)) { ctx.fillStyle = '#1a1a24'; ctx.fillRect(-2, -110, 4, 110); ctx.fillRect(-2 * side - (side > 0 ? 30 : 0), -110, 32, 4); ctx.restore(); U.light(ctx, x - side * 26 * s, y - 106 * s, 70 * s, '#ffe0a0', 0.5); ctx.save(); ctx.translate(x, y); ctx.scale(s, s); }
        else { ctx.fillStyle = '#0c1a12'; U.pine(ctx, 0, 0, 90, '#0c1a12'); ctx.fillStyle = '#c8ccd0'; ctx.fillRect(-side * 30 - 20, -14, 40, 4); }
        ctx.restore();
      });
    }
    // speed lines
    const sl = U.clamp(pp - 0.8, 0, 3);
    if (S.phase === 'running' && sl > 0) { ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1.5; for (let k = 0; k < sl * 16; k++) { const a = Math.random() * TAU, r0 = 240 + Math.random() * 220; ctx.beginPath(); ctx.moveTo(w / 2 + Math.cos(a) * r0, hz + Math.sin(a) * r0); ctx.lineTo(w / 2 + Math.cos(a) * (r0 + 90), hz + Math.sin(a) * (r0 + 90)); ctx.stroke(); } }
    // car
    let cx = w / 2 + Math.sin(T * 1.3) * 10 - curve * 34, cy = h * 0.84, ang = 0;
    if (S.phase === 'crashed') { st.spin += dt * (8 - Math.min(7, S.crashAge * 4)); st.slide += dt * 260 * Math.max(0, 1 - S.crashAge * 0.6); ang = st.spin; cx += st.slide; cy -= Math.min(40, S.crashAge * 30); }
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang);
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.beginPath(); ctx.ellipse(0, 40, 140, 14, 0, 0, TAU); ctx.fill();
    ctx.drawImage(carRear(), -130, -70);
    const brake = !!S.cashAt || S.phase === 'crashed' || !run;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = U.lin(ctx, -110, 0, 110, 0, [[0, U.rgba('#ff2a3a', brake ? 1 : 0.75)], [0.5, U.rgba('#ff2a3a', brake ? 0.9 : 0.35)], [1, U.rgba('#ff2a3a', brake ? 1 : 0.75)]]);
    ctx.fillRect(-106, -14, 212, 4);
    ctx.restore();
    U.light(ctx, -96, -12, brake ? 60 : 34, '#ff2a3a', brake ? 0.8 : 0.45); U.light(ctx, 96, -12, brake ? 60 : 34, '#ff2a3a', brake ? 0.8 : 0.45);
    if (S.phase === 'running' && pp > 0.8) { [-44, 44].forEach((x) => { const fl = 12 + Math.random() * 16 * Math.min(2, pp); U.light(ctx, x, 22, fl * 1.4, '#5ab4ff', 0.9); ctx.fillStyle = 'rgba(220,240,255,0.9)'; ctx.beginPath(); ctx.ellipse(x, 22 + fl * 0.3, 4, fl * 0.4, 0, 0, TAU); ctx.fill(); }); }
    ctx.restore();
    if (ei === 1 || ei === 2) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = U.lin(ctx, 0, cy + 30, 0, h, [[0, U.rgba('#ff2a3a', 0.3)], [1, 'rgba(0,0,0,0)']]); ctx.fillRect(cx - 110, cy + 30, 30, h - cy); ctx.fillRect(cx + 80, cy + 30, 30, h - cy); ctx.restore(); }
    if (S.phase === 'crashed' && !st.crashed) { st.crashed = true; st.shake = 24; U.burst(st.parts, cx, cy - 20, ['#ffd86b', '#ff8a3d', '#22e6ff', '#cfd6e0'], 80, { speed: 440, spread: TAU, size: 5, shape: 'rect', g: 500 }); }
    if (S.phase === 'crashed' && Math.random() < 0.7) st.parts.add({ x: cx, y: cy, vx: (Math.random() - 0.5) * 60, vy: -60, life: 2, size: 14, grow: 2, color: '#34343a', alpha: 0.6 });
    if (S.phase === 'running' && pp > 1.5 && Math.random() < 0.3) st.parts.add({ x: cx + (Math.random() - 0.5) * 200, y: cy + 36, vx: (Math.random() - 0.5) * 100, vy: 60, life: 0.4, size: 1.5, color: '#ffd86b', shape: 'line' });
    if (S.cashAt && !st.cashed) { st.cashed = true; U.burst(st.parts, cx, cy - 60, ['#22e6ff', '#ffffff', '#ffd23f'], 50, { speed: 320, size: 5 }); }
    st.parts.update(dt); st.parts.draw(ctx);
    if (S.phase === 'crashed' && S.crashAge < 0.25) { ctx.fillStyle = U.rgba('#ffffff', 0.7 * (1 - S.crashAge * 4)); ctx.fillRect(-40, -40, w + 80, h + 80); }
    // speedometer
    const gx = w - 92, gy = 150, spd = run ? Math.round(90 + pp * 115) : 0;
    ctx.fillStyle = U.rad(ctx, gx, gy, 10, 70, [[0, 'rgba(10,8,24,0.9)'], [1, 'rgba(4,3,10,0.85)']]); ctx.beginPath(); ctx.arc(gx, gy, 66, Math.PI * 0.85, Math.PI * 2.15); ctx.lineTo(gx, gy); ctx.fill();
    for (let k = 0; k <= 14; k++) { const a = Math.PI * 0.85 + (k / 14) * Math.PI * 1.3; ctx.strokeStyle = k > 11 ? '#ff3b30' : 'rgba(200,240,255,0.6)'; ctx.lineWidth = k % 2 ? 1 : 2; ctx.beginPath(); ctx.moveTo(gx + Math.cos(a) * 52, gy + Math.sin(a) * 52); ctx.lineTo(gx + Math.cos(a) * 60, gy + Math.sin(a) * 60); ctx.stroke(); }
    const sa = Math.PI * 0.85 + U.clamp(spd / 700, 0, 1) * Math.PI * 1.3;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = '#22e6ff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(gx, gy, 46, Math.PI * 0.85, sa); ctx.stroke(); ctx.restore();
    ctx.strokeStyle = '#ff3fb4'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + Math.cos(sa) * 50, gy + Math.sin(sa) * 50); ctx.stroke();
    U.label(ctx, String(spd), gx, gy + 6, '800 26px "Big Shoulders Display", sans-serif', '#eafcff', 'center');
    U.label(ctx, 'KM/H', gx, gy + 20, '600 9px "JetBrains Mono", monospace', '#9adfff', 'center');
    U.vignette(ctx, w, h, 0.5);
    ctx.restore();
  },
});
