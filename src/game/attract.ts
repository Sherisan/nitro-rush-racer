/* Attract mode: plays a scene on a canvas with made-up rounds, for lobby previews.
   No bets and no outcomes are involved; the crash points are decorative. */
import { CG } from '../engine/core.js';
import type { Scene, RouteKey, DualLane } from '../engine/core.js';
import { VH } from './controller';

export class Attract {
  private raf = 0;
  private running = false;
  private st: unknown;
  private W = 960;
  private scale = 1;
  private phase: 'betting' | 'running' | 'crashed' = 'running';
  private t0 = 0;
  private target = 3;
  private m = 1;
  private crashT = 0;
  private route: RouteKey = 'L';
  private dual: Record<RouteKey, DualLane> | null = null;
  private last = 0;
  private dualTargets = { L: 2, R: 4 };

  constructor(private canvas: HTMLCanvasElement, private scene: Scene) {
    this.size();
    this.st = scene.init(this.W, VH);
    this.reset(performance.now() / 1000);
  }
  private size() {
    const c = this.canvas;
    this.scale = c.height / VH; this.W = c.width / this.scale;
  }
  private reset(t: number) {
    this.phase = 'betting'; this.t0 = t; this.m = 1;
    this.target = 1.6 + Math.random() * 6;
    if (this.scene.fork) this.target = Math.max(this.target, this.scene.fork * 1.3);
    this.route = Math.random() < 0.5 ? 'L' : 'R';
    this.dualTargets = { L: 1.3 + Math.random() * 4, R: 1.3 + Math.random() * 4 };
    this.dual = this.scene.dual ? { L: { m: 1, dead: false, age: 0 }, R: { m: 1, dead: false, age: 0 } } : null;
    this.st = this.scene.init(this.W, VH);
  }
  /** Paint one representative still frame (used before any hover). */
  still() {
    const ctx = this.canvas.getContext('2d'); if (!ctx) return;
    const sc = this.scene, target = sc.fork ? sc.fork * 1.35 : 3.4;
    const dual = sc.dual ? { L: { m: 2.6, dead: false, age: 0 }, R: { m: 4.1, dead: false, age: 0 } } : null;
    for (let f = 0; f <= 40; f++) {
      const m = Math.exp(Math.log(target) * (f / 40));
      ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0); ctx.clearRect(0, 0, this.W, VH);
      try { sc.draw(ctx, this.W, VH, { phase: 'running', m, p: Math.log(m), t: Math.log(m) / CG.K, dt: 1 / 30, time: 10 + f / 30, countdown: 0, crashAge: 0, cashAt: null, route: 'L', routes: sc.routes, fork: sc.fork, forkPassed: !!sc.fork && m >= sc.fork, dual }, this.st); } catch (e) { console.error(sc.id, e); }
    }
  }
  start() {
    if (this.running) return;
    this.running = true; this.last = performance.now() / 1000;
    const loop = () => { if (!this.running) return; this.frame(); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  }
  stop() { this.running = false; cancelAnimationFrame(this.raf); }

  private frame() {
    const ctx = this.canvas.getContext('2d'); if (!ctx) return;
    const t = performance.now() / 1000, dt = Math.min(0.05, t - this.last); this.last = t;
    const sc = this.scene;
    if (this.phase === 'betting' && t - this.t0 > 1.2) { this.phase = 'running'; this.t0 = t; }
    if (this.phase === 'running') {
      // run faster than real rounds so previews reach the good parts
      this.m = Math.exp(CG.K * 2.4 * (t - this.t0));
      const end = sc.dual ? Math.max(this.dualTargets.L, this.dualTargets.R) : this.target;
      if (this.dual) (['L', 'R'] as RouteKey[]).forEach((k) => { const D = this.dual![k]; D.m = Math.min(this.m, this.dualTargets[k]); D.dead = this.m >= this.dualTargets[k]; });
      if (this.m >= end) { this.m = end; this.phase = 'crashed'; this.crashT = t; }
    } else if (this.phase === 'crashed' && t - this.crashT > 2.2) this.reset(t);
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0); ctx.clearRect(0, 0, this.W, VH);
    try {
      sc.draw(ctx, this.W, VH, {
        phase: this.phase, m: this.m, p: Math.log(this.m), t: Math.log(this.m) / CG.K, dt, time: t, countdown: 1,
        crashAge: this.phase === 'crashed' ? t - this.crashT : 0, cashAt: null, route: this.route, routes: sc.routes, fork: sc.fork,
        forkPassed: !!sc.fork && this.m >= sc.fork, dual: this.dual,
      }, this.st);
    } catch (e) { console.error(e); }
  }
}
