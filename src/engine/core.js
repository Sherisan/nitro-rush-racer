/* Shared crash engine: drawing utilities, particles and the scene registry.
   Crash points come from the GameEngineAPI server, never from this file. */
export const CG = {};
{
  CG.scenes = [];
  CG.register = (s) => CG.scenes.push(s);
  CG.K = 0.09; /* default growth for lobby previews; live rounds use the server's growth rate */

  const U = (CG.U = {});
  U.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.smooth = (t) => { t = U.clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  U.rng = (seed) => {
    let s = (Math.abs(Math.floor(seed)) % 2147483646) + 1;
    return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  };
  U.hex = (h) => {
    h = h.replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  U.mixArr = (a, b, t) => { const A = U.hex(a), B = U.hex(b); t = U.clamp(t, 0, 1); return A.map((v, i) => Math.round(v + (B[i] - v) * t)); };
  U.mix = (a, b, t) => 'rgb(' + U.mixArr(a, b, t).join(',') + ')';
  U.mixHex = (a, b, t) => '#' + U.mixArr(a, b, t).map((v) => v.toString(16).padStart(2, '0')).join('');
  U.rgba = (h, a) => { const A = U.hex(h); return 'rgba(' + A[0] + ',' + A[1] + ',' + A[2] + ',' + U.clamp(a, 0, 1) + ')'; };
  /* stops: [[t, '#hex'], ...] -> '#hex' */
  U.ramp = (stops, t) => {
    if (t <= stops[0][0]) return stops[0][1];
    for (let i = 1; i < stops.length; i++) {
      if (t <= stops[i][0]) { const [a, ca] = stops[i - 1], [b, cb] = stops[i]; return U.mixHex(ca, cb, (t - a) / (b - a)); }
    }
    return stops[stops.length - 1][1];
  };
  U.vgrad = (ctx, y0, y1, c0, c1) => { const g = ctx.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, c0); g.addColorStop(1, c1); return g; };
  U.glow = (ctx, x, y, r, color, a) => {
    if (r <= 0) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, U.rgba(color, a == null ? 1 : a)); g.addColorStop(1, U.rgba(color, 0));
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  };
  U.rr = (ctx, x, y, w, h, r) => {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
  };
  U.wrap = (v, m) => ((v % m) + m) % m;
  U.shake = (ctx, st, dt) => {
    if (st.shake > 0) {
      ctx.translate((Math.random() - 0.5) * st.shake, (Math.random() - 0.5) * st.shake);
      st.shake = Math.max(0, st.shake - dt * 28);
    }
  };
  U.vignette = (ctx, w, h, a) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,' + a + ')');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  };
  U.burst = (parts, x, y, colors, n, opt) => {
    opt = opt || {};
    for (let i = 0; i < n; i++) {
      const a = (opt.angle != null ? opt.angle : -Math.PI / 2) + (Math.random() - 0.5) * (opt.spread || Math.PI * 1.4);
      const v = (opt.speed || 260) * (0.4 + Math.random() * 0.8);
      parts.add({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: opt.g == null ? 520 : opt.g, life: (opt.life || 1.4) * (0.6 + Math.random() * 0.6),
        size: (opt.size || 4) * (0.6 + Math.random() * 0.8), color: colors[i % colors.length], shape: opt.shape || 'circle', vr: (Math.random() - 0.5) * 12, drag: opt.drag || 0, grow: opt.grow || 0 });
    }
  };

  U.Particles = class {
    constructor() { this.list = []; }
    add(p) { this.list.push(Object.assign({ x: 0, y: 0, vx: 0, vy: 0, g: 0, life: 1, age: 0, size: 3, color: '#ffffff', drag: 0, shape: 'circle', rot: 0, vr: 0, grow: 0, h: 1 }, p)); }
    update(dt) {
      for (const p of this.list) {
        p.age += dt; p.vy += p.g * dt;
        if (p.drag) { const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vy *= k; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      }
      if (this.list.length > 900) this.list.splice(0, this.list.length - 900);
      this.list = this.list.filter((p) => p.age < p.life);
    }
    draw(ctx) {
      for (const p of this.list) {
        const a = 1 - p.age / p.life;
        ctx.globalAlpha = p.fade === false ? 1 : Math.max(0, Math.min(1, a * (p.alpha || 1)));
        ctx.fillStyle = p.color;
        const s = p.size * (1 + p.age * p.grow);
        if (p.shape === 'rect') {
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-s / 2, -s * p.h / 2, s, s * p.h); ctx.restore();
        } else if (p.shape === 'line') {
          ctx.strokeStyle = p.color; ctx.lineWidth = p.size; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); ctx.stroke();
        } else if (p.grow > 0 && p.shape === 'circle') {
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, Math.max(0.1, s));
          g.addColorStop(0, p.color); g.addColorStop(0.55, p.color); g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.1, s), 0, Math.PI * 2); ctx.fill();
        } else {
          ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.1, s), 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }
  };
}
