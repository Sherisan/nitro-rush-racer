/* Round controller: one instance per open game. Runs the round lifecycle, settles two
   independent bet slots, drives the simulated players, draws the scene with camera and
   post effects, and emits events for sound and on-screen popups.
   React reads it through subscribe/getSnapshot (useSyncExternalStore). */
import { CG } from '../engine/core.js';
import type { Outcome, Phase, RouteKey, Scene, SceneState, DualLane } from '../engine/core.js';
import { r2, type Wallet } from './wallet';

export const BET_TIME = 6;
export const END_TIME = 4;
export const VH = 540;

export const x2 = (m: number) => m.toFixed(2) + '×';
export const money = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export type SlotStatus = 'none' | 'placed' | 'active' | 'cashed' | 'lost';
export interface Slot { status: SlotStatus; amount: number; at?: number; pay?: number; queued: boolean; }
export interface SlotSettings { bet: number; autoOn: boolean; autoAt: number; autoBet: boolean; }
export interface Bot { name: string; bet: number; target: number; route: RouteKey; status: 'in' | 'cashed' | 'lost'; at: number; when?: number; }
export interface TopWin { name: string; bet: number; at: number; win: number; round: number; you: boolean; }
export interface Round { nonce: number; seed: string; client: string; hash: string | null; out: Outcome | null; ready: boolean; }
export interface HistoryEntry { v: number; dot: string | null; detail: string; }
export interface MyBet { id: number; game: string; round: number; slot: number; amount: number; at: number | null; pay: number; result: number; time: number; }

export type GameEvent =
  | { type: 'tick'; last: boolean }
  | { type: 'bet'; slot: number }
  | { type: 'launch' }
  | { type: 'cashout'; slot: number; at: number; pay: number }
  | { type: 'crash'; m: number }
  | { type: 'milestone'; m: number }
  | { type: 'autostop'; slot: number };

export interface Snapshot {
  phase: Phase;
  m: number;
  countdown: number;
  route: RouteKey;
  routeLocked: boolean;
  forkPassed: boolean;
  slots: [Slot, Slot];
  bots: Bot[];
  history: HistoryEntry[];
  round: { nonce: number; hash: string | null; client: string };
  prev: Round | null;
  myBets: MyBet[];
  topWins: TopWin[];
  hud: { label: string; mult: string; sub: string };
  players: number;
  wagered: number;
}

const NAMES = ['Thabo', 'Lerato', 'Sipho', 'Naledi', 'Mpho', 'Ayanda', 'Zola', 'Kagiso', 'Lindiwe', 'Tumi', 'Bongani', 'Nomsa', 'Jabu', 'Refilwe', 'Kabelo', 'Zanele', 'Dineo', 'Themba', 'Pieter', 'Annika', 'Ravi', 'Priya', 'Marco', 'Chen', 'Yusuf', 'Amara', 'Kofi', 'Elena', 'Tariq', 'Mei', 'Lwazi', 'Karabo', 'Nandi', 'Sizwe'];
const MILESTONES = [2, 5, 10, 25, 50, 100];

/* session state shared across games */
const histories: Record<string, HistoryEntry[]> = {};
const topWins: Record<string, TopWin[]> = {};
let myBets: MyBet[] = [];
let betId = 0;

function readSeed(): string {
  try { const v = localStorage.getItem('cg.client'); if (v) return JSON.parse(v); } catch { /* ignore */ }
  const s = CG.fair.randomSeed(8);
  try { localStorage.setItem('cg.client', JSON.stringify(s)); } catch { /* ignore */ }
  return s;
}
let clientSeed = readSeed();
let nonce = (() => { try { return Number(JSON.parse(localStorage.getItem('cg.nonce') || '0')) || 0; } catch { return 0; } })();

export function getClientSeed() { return clientSeed; }
export function setClientSeed(v: string) {
  clientSeed = v;
  try { localStorage.setItem('cg.client', JSON.stringify(v)); } catch { /* ignore */ }
}
export function getHistory(id: string) { return histories[id] || []; }
let showGraph = (() => { try { return localStorage.getItem('cg.graph') !== '0'; } catch { return true; } })();
export function getGraph() { return showGraph; }
export function setGraph(v: boolean) { showGraph = v; try { localStorage.setItem('cg.graph', v ? '1' : '0'); } catch { /* ignore */ } }

const emptySlot = (queued = false): Slot => ({ status: 'none', amount: 0, queued });

export class GameController {
  readonly scene: Scene;
  private wallet: Wallet;
  private settings: () => [SlotSettings, SlotSettings];
  private toast: (msg: string) => void;
  private onEvent: (e: GameEvent) => void;

  private phase: Phase = 'betting';
  private phaseStart = 0;
  private runStart = 0;
  private crashTime = 0;
  private m = 1;
  private t = 0;
  private countdown = BET_TIME;
  private lastTick = -1;
  private nextMilestone = 0;
  private route: RouteKey = 'L';
  private forkPassed = false;
  private round!: Round;
  private prev: Round | null = null;
  private slots: [Slot, Slot] = [emptySlot(), emptySlot()];
  private bots: Bot[] = [];
  private cashAt: number | null = null;
  private dual: Record<RouteKey, DualLane> | null = null;
  private st: unknown = null;
  private punch = 0;

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private VW = 960;
  private scale = 1;
  private raf = 0;
  private last = 0;
  private snap!: Snapshot;
  private listeners = new Set<() => void>();
  private disposed = false;

  constructor(scene: Scene, wallet: Wallet, settings: () => [SlotSettings, SlotSettings], toast: (msg: string) => void, onEvent: (e: GameEvent) => void) {
    this.scene = scene; this.wallet = wallet; this.settings = settings; this.toast = toast; this.onEvent = onEvent;
    histories[scene.id] = histories[scene.id] || [];
    topWins[scene.id] = topWins[scene.id] || [];
    this.newRound();
  }

  /* ---------- React store ---------- */
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getSnapshot = () => this.snap;

  /* ---------- canvas lifecycle ---------- */
  attach(canvas: HTMLCanvasElement) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d');
    this.resize();
    this.last = performance.now() / 1000;
    const loop = () => { if (this.disposed) return; this.frame(); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  }
  resize() {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    this.scale = this.canvas.height / VH; this.VW = this.canvas.width / this.scale;
    if (this.phase === 'betting') this.st = this.scene.init(this.VW, VH);
  }
  /** Leaving the game: open bets are cashed out at the current multiplier, pending ones refunded. */
  dispose() {
    if (this.disposed) return;
    this.slots.forEach((s, i) => {
      if (s.status === 'active' && this.phase === 'running') this.cashOut(i, r2(this.m), true);
      else if (s.status === 'placed') this.wallet.refund(s.amount);
    });
    this.disposed = true; cancelAnimationFrame(this.raf); this.listeners.clear();
  }

  /* ---------- outcomes ---------- */
  private crashFor(route: RouteKey): number {
    const o = this.round.out!, sc = this.scene;
    if (sc.dual) return o[route] as number;
    if (!sc.fork) return o.trunk as number;
    return (o.trunk as number) < sc.fork ? (o.trunk as number) : (o[route] as number);
  }
  private endPoint(): number {
    const o = this.round.out!;
    if (this.scene.dual) return Math.max(o.L as number, o.R as number);
    return this.crashFor(this.route);
  }
  isRouteLocked(): boolean {
    const sc = this.scene;
    if (!sc.routes) return true;
    if (sc.dual) return this.phase !== 'betting';
    return this.phase === 'crashed' || this.forkPassed;
  }

  /* ---------- round lifecycle ---------- */
  private makeBots(): Bot[] {
    const n = 9 + Math.floor(Math.random() * 10), pool = NAMES.slice().sort(() => Math.random() - 0.5), bets = [5, 10, 10, 20, 25, 50, 50, 100, 200, 250, 500, 1000];
    return pool.slice(0, n).map((name) => {
      let target = 1.05 - Math.log(1 - Math.random()) * 1.5;
      if (Math.random() < 0.12) target *= 3;
      return { name, bet: bets[Math.floor(Math.random() * bets.length)], target: Math.max(1.01, r2(target)), route: (Math.random() < 0.5 ? 'L' : 'R') as RouteKey, status: 'in' as const, at: 0 };
    });
  }

  private async newRound() {
    const sc = this.scene;
    this.phase = 'betting'; this.phaseStart = performance.now() / 1000; this.st = sc.init(this.VW, VH);
    this.cashAt = null; this.forkPassed = false; this.m = 1; this.t = 0; this.countdown = BET_TIME; this.lastTick = -1; this.nextMilestone = 0;
    this.dual = sc.dual ? { L: { m: 1, dead: false, age: 0 }, R: { m: 1, dead: false, age: 0 } } : null;
    nonce++;
    try { localStorage.setItem('cg.nonce', JSON.stringify(nonce)); } catch { /* ignore */ }
    const r: Round = { nonce, seed: CG.fair.randomSeed(), client: clientSeed, hash: null, out: null, ready: false };
    this.round = r;
    const queued = this.slots.map((s) => s.queued);
    this.slots = [emptySlot(), emptySlot()];
    this.bots = this.makeBots();
    const set = this.settings();
    queued.forEach((q, i) => {
      if (!q && !set[i].autoBet) return;
      if (!this.placeBet(i, set[i].autoBet && !q) && set[i].autoBet) this.onEvent({ type: 'autostop', slot: i });
    });
    this.emit();
    try {
      r.hash = await CG.fair.sha256(r.seed);
      r.out = await CG.fair.outcome(sc, r.seed, r.client, r.nonce);
      r.ready = true;
    } catch {
      this.toast('This browser blocked the secure random functions the game needs.');
    }
  }

  private startRun() {
    this.phase = 'running'; this.runStart = performance.now() / 1000;
    this.slots = this.slots.map((s) => (s.status === 'placed' ? { ...s, status: 'active' as const } : s)) as [Slot, Slot];
    this.onEvent({ type: 'launch' });
  }

  private addTop(w: TopWin) {
    const list = topWins[this.scene.id];
    list.push(w); list.sort((a, b) => b.win - a.win);
    topWins[this.scene.id] = list.slice(0, 12);
  }
  private logBet(i: number, s: Slot, at: number | null, pay: number) {
    myBets = [{ id: ++betId, game: this.scene.name, round: this.round.nonce, slot: i + 1, amount: s.amount, at, pay, result: 0, time: Date.now() }, ...myBets].slice(0, 60);
  }

  private finishRound(end: number) {
    const sc = this.scene, o = this.round.out!;
    this.phase = 'crashed'; this.crashTime = performance.now() / 1000; this.m = end; this.punch = 1;
    this.slots = this.slots.map((s, i) => {
      if (s.status !== 'active') return s;
      this.wallet.lose(s.amount); this.logBet(i, s, null, 0);
      return { ...s, status: 'lost' as const };
    }) as [Slot, Slot];
    myBets = myBets.map((b) => (b.round === this.round.nonce && b.result === 0 ? { ...b, result: sc.dual ? (o[this.route] as number) : end } : b));
    this.bots = this.bots.map((b) => {
      if (b.status !== 'in') return b;
      return b.target <= this.crashFor(b.route) ? { ...b, status: 'cashed', at: b.target } : { ...b, status: 'lost' };
    });
    let v: number, detail: string, dot: string | null = null;
    if (sc.routes && (sc.dual || (o.trunk as number) >= (sc.fork as number))) {
      v = o[this.route] as number; dot = sc.routes[this.route].color;
      detail = sc.routes.L.name + ' ' + x2(o.L as number) + ' · ' + sc.routes.R.name + ' ' + x2(o.R as number);
    } else {
      v = o.trunk as number; detail = sc.fork ? 'Crashed before the split at ' + x2(o.trunk as number) : 'Crashed at ' + x2(o.trunk as number);
    }
    const h = histories[sc.id];
    h.unshift({ v, dot, detail }); if (h.length > 40) h.pop();
    histories[sc.id] = h.slice();
    this.prev = this.round;
    this.onEvent({ type: 'crash', m: end });
  }

  /* ---------- player actions ---------- */
  setRoute(k: RouteKey) { if (!this.isRouteLocked()) { this.route = k; this.emit(); } }

  private placeBet(i: number, auto = false): boolean {
    const a = r2(this.settings()[i].bet);
    if (!(a >= 1)) { this.toast('The minimum bet is 1.00 credit.'); return false; }
    if (!this.wallet.stake(a)) { this.toast(auto ? 'Auto bet ' + (i + 1) + ' stopped: not enough credits.' : 'Not enough credits for that bet. Lower it or reset your demo credits.'); return false; }
    this.slots[i] = { status: 'placed', amount: a, queued: false };
    this.onEvent({ type: 'bet', slot: i });
    return true;
  }
  private cashOut(i: number, at: number, quiet = false) {
    const s = this.slots[i];
    if (s.status !== 'active') return;
    const pay = r2(s.amount * at);
    this.wallet.win(s.amount, pay);
    this.slots[i] = { ...s, status: 'cashed', at, pay };
    this.logBet(i, s, at, pay);
    this.addTop({ name: 'You', bet: s.amount, at, win: pay, round: this.round.nonce, you: true });
    this.cashAt = at;
    if (quiet) this.toast('Cashed out at ' + x2(at) + ' when you left the game: +' + money(pay));
    else this.onEvent({ type: 'cashout', slot: i, at, pay });
  }
  /** The main button of a slot: place, cancel, cash out, or queue for the next round. */
  action(i: number) {
    const s = this.slots[i];
    if (this.phase === 'betting') {
      if (s.status === 'none') this.placeBet(i);
      else if (s.status === 'placed') { this.wallet.refund(s.amount); this.slots[i] = emptySlot(); }
    } else if (this.phase === 'running' && s.status === 'active') this.cashOut(i, r2(this.m));
    else this.slots[i] = { ...s, queued: !s.queued };
    this.emit();
  }

  /* ---------- frame ---------- */
  private frame() {
    const t = performance.now() / 1000, dt = Math.min(0.05, t - this.last); this.last = t;
    const sc = this.scene;
    if (this.phase === 'betting') {
      this.countdown = Math.max(0, BET_TIME - (t - this.phaseStart));
      const sec = Math.ceil(this.countdown);
      if (sec !== this.lastTick && sec <= 3 && sec >= 1) this.onEvent({ type: 'tick', last: sec === 1 });
      this.lastTick = sec;
      if (this.countdown <= 0 && this.round.ready) this.startRun();
    } else if (this.phase === 'running') {
      this.t = t - this.runStart;
      let m = Math.exp(CG.K * this.t);
      const o = this.round.out!;
      if (sc.fork && !this.forkPassed && m >= sc.fork && (o.trunk as number) >= sc.fork) this.forkPassed = true;
      const end = this.endPoint();
      const set = this.settings();
      this.slots.forEach((s, i) => {
        if (s.status !== 'active') return;
        const pc = this.crashFor(this.route), auto = set[i].autoOn ? r2(set[i].autoAt) : 0;
        if (auto >= 1.01 && m >= auto && auto <= pc) this.cashOut(i, auto);
        else if (sc.dual && m >= pc) { this.wallet.lose(s.amount); this.logBet(i, s, null, 0); this.slots[i] = { ...s, status: 'lost' }; }
      });
      let changed = false;
      const bots = this.bots.map((b) => {
        if (b.status !== 'in') return b;
        const bc = this.crashFor(b.route);
        if (m >= b.target && b.target <= bc) { changed = true; this.addTop({ name: b.name, bet: b.bet, at: b.target, win: r2(b.bet * b.target), round: this.round.nonce, you: false }); return { ...b, status: 'cashed' as const, at: b.target, when: performance.now() / 1000 }; }
        if (sc.dual && m >= bc) { changed = true; return { ...b, status: 'lost' as const }; }
        return b;
      });
      if (changed) this.bots = bots;
      if (this.dual) (['L', 'R'] as RouteKey[]).forEach((k) => {
        const D = this.dual![k], c = o[k] as number;
        D.m = Math.min(m, c);
        if (!D.dead && m >= c) { D.dead = true; D.t0 = t; }
        D.age = D.dead ? t - (D.t0 as number) : 0;
      });
      if (m >= end) { m = end; this.m = m; this.finishRound(end); }
      else {
        this.m = m;
        if (this.nextMilestone < MILESTONES.length && m >= MILESTONES[this.nextMilestone]) { this.onEvent({ type: 'milestone', m: MILESTONES[this.nextMilestone] }); this.nextMilestone++; }
      }
    } else if (t - this.crashTime > END_TIME) {
      this.newRound();
    }
    this.draw(dt, t);
    this.emit();
  }

  private draw(dt: number, t: number) {
    const ctx = this.ctx; if (!ctx) return;
    const W = this.VW;
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    ctx.clearRect(0, 0, W, VH);
    // camera: slow push-in while the multiplier climbs, punch on the crash
    const push = this.phase === 'betting' ? 0 : Math.min(0.05, Math.log(this.m) * 0.018);
    this.punch = Math.max(0, this.punch - dt * 2.2);
    const z = 1 + push + this.punch * 0.035;
    ctx.translate(W / 2, VH / 2); ctx.scale(z, z); ctx.translate(-W / 2, -VH / 2);
    const S: SceneState = {
      phase: this.phase, m: this.m, p: Math.log(this.m), t: this.t, dt, time: t, countdown: this.countdown,
      crashAge: this.phase === 'crashed' ? t - this.crashTime : 0, cashAt: this.cashAt, route: this.route,
      routes: this.scene.routes, fork: this.scene.fork, forkPassed: this.forkPassed, dual: this.dual,
    };
    try { this.scene.draw(ctx, W, VH, S, this.st); } catch (e) { console.error(e); }
    // post: film grain, crash graph, crash flash
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    CG.U.grain(ctx, W, VH, 0.06);
    if (showGraph && this.scene.graph !== false) this.drawGraph(ctx, W, t);
    if (this.punch > 0) {
      ctx.save(); ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = 'rgba(255,60,40,' + (this.punch * 0.35).toFixed(3) + ')'; ctx.fillRect(0, 0, W, VH);
      ctx.restore();
    }
  }

  /* ---------- crash curve overlay ---------- */
  private drawGraph(ctx: CanvasRenderingContext2D, W: number, now: number) {
    const narrow = W < 800;
    const x0 = narrow ? 40 : 52, x1 = W - 26, y0 = VH - 30, y1 = VH * (narrow ? 0.42 : 0.36);
    const run = this.phase !== 'betting';
    const tNow = run ? this.t : 0;
    const tMax = Math.max(8, tNow * 1.12), mMax = Math.max(2, this.m * 1.15);
    const X = (tt: number) => x0 + (tt / tMax) * (x1 - x0);
    const Y = (mm: number) => y0 - ((mm - 1) / (mMax - 1)) * (y0 - y1);
    const nice = (span: number, n: number, steps: number[]) => steps.find((s) => span / s <= n) || steps[steps.length - 1];
    const mStep = nice(mMax - 1, 4, [0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000]);
    const tStep = nice(tMax, 6, [1, 2, 5, 10, 15, 20, 30, 60, 120]);
    const fmt = (v: number) => (mStep < 1 ? v.toFixed(1) : v.toFixed(0)) + '×';
    ctx.save();
    ctx.font = '600 11px "JetBrains Mono", monospace';
    ctx.lineWidth = 1;
    ctx.textAlign = 'right';
    for (let v = 1; v <= mMax + 1e-6; v += mStep) {
      const y = Y(v);
      ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.setLineDash([4, 6]); ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillText(fmt(v), x0 - 7, y + 5);
      ctx.fillStyle = 'rgba(255,255,255,0.66)'; ctx.fillText(fmt(v), x0 - 8, y + 4);
    }
    ctx.textAlign = 'center';
    for (let s = tStep; s <= tMax; s += tStep) {
      const x = X(s);
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillText(s + 's', x + 1, y0 + 20);
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillText(s + 's', x, y0 + 19);
      ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y0 + 5); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath(); ctx.moveTo(x0, y1 - 10); ctx.lineTo(x0, y0); ctx.lineTo(x1, y0); ctx.stroke();
    if (run && tNow > 0) {
      const crashed = this.phase === 'crashed';
      const lanes: Array<{ col: string; cap: number }> = this.dual && this.scene.routes
        ? (['L', 'R'] as RouteKey[]).map((k) => ({ col: this.scene.routes![k].color, cap: this.dual![k].m }))
        : [{ col: crashed ? '#ff4d5e' : this.scene.accent, cap: this.m }];
      for (const lane of lanes) {
        const tEnd = Math.log(lane.cap) / CG.K, pts: Array<[number, number]> = [];
        for (let k = 0; k <= 70; k++) { const tt = (tEnd * k) / 70; pts.push([X(tt), Y(Math.exp(CG.K * tt))]); }
        const grad = ctx.createLinearGradient(0, y1, 0, y0);
        grad.addColorStop(0, CG.U.rgba(lane.col, 0.3)); grad.addColorStop(1, CG.U.rgba(lane.col, 0.02));
        ctx.fillStyle = grad; ctx.beginPath(); ctx.moveTo(pts[0][0], y0); pts.forEach((q) => ctx.lineTo(q[0], q[1])); ctx.lineTo(pts[pts.length - 1][0], y0); ctx.closePath(); ctx.fill();
        ctx.shadowColor = lane.col; ctx.shadowBlur = 14; ctx.strokeStyle = lane.col; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.stroke();
        ctx.shadowBlur = 0;
        const e = pts[pts.length - 1];
        CG.U.light(ctx, e[0], e[1], 28, lane.col, 0.9);
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(e[0], e[1], 5, 0, Math.PI * 2); ctx.fill();
      }
      // other players cashing out along the curve
      ctx.font = '600 11px "Sora", sans-serif'; ctx.textAlign = 'left';
      for (const b of this.bots) {
        if (b.status !== 'cashed' || !b.when) continue;
        const age = now - b.when; if (age > 2.4) continue;
        const x = X(Math.log(b.at) / CG.K), y = Y(b.at), a = Math.max(0, 1 - age / 2.4), rise = age * 14;
        const label = b.name + ' ' + b.at.toFixed(2) + '×', w = ctx.measureText(label).width + 14;
        ctx.globalAlpha = a;
        ctx.fillStyle = 'rgba(8,12,20,0.85)'; CG.U.rr(ctx, x - 4, y - 30 - rise, w, 20, 10); ctx.fill();
        ctx.strokeStyle = 'rgba(80,220,140,0.7)'; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = '#7dffb2'; ctx.fillText(label, x + 3, y - 16 - rise);
        ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
      // your cash-out markers
      this.slots.forEach((s, i) => {
        if (s.status !== 'cashed' || !s.at) return;
        const x = X(Math.log(s.at) / CG.K), y = Y(s.at);
        ctx.fillStyle = '#ffd34d'; ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#1a1206'; ctx.lineWidth = 2; ctx.stroke();
        ctx.font = '800 12px "Sora", sans-serif'; ctx.fillStyle = '#ffd34d'; ctx.fillText('You · ' + (i + 1), x + 10, y + 18);
      });
    }
    ctx.restore();
  }

  /* ---------- HUD text ---------- */
  private resultText(): string {
    const sc = this.scene, o = this.round.out!;
    if (sc.dual && sc.routes) return sc.routes.L.name + ' collapsed at ' + x2(o.L as number) + ' · ' + sc.routes.R.name + ' at ' + x2(o.R as number);
    if (sc.fork && sc.routes) {
      if ((o.trunk as number) < sc.fork) return 'Collapsed at ' + x2(o.trunk as number) + ', before the split at ' + x2(sc.fork);
      const me = this.route, other: RouteKey = me === 'L' ? 'R' : 'L';
      return sc.routes[me].name + ' at ' + x2(o[me] as number) + ' · ' + sc.routes[other].name + ' would have reached ' + x2(o[other] as number);
    }
    return 'Round ' + this.round.nonce + ' crashed';
  }

  private emit() {
    const sc = this.scene;
    const routeName = sc.routes ? sc.routes[this.route].name : '';
    let label: string, mult: string, sub: string;
    if (this.phase === 'betting') {
      label = 'Next round in'; mult = this.countdown.toFixed(1) + 's';
      sub = sc.dual ? 'Backing ' + routeName : sc.fork ? 'Switch at ' + x2(sc.fork) + ' · Riding ' + routeName : 'Place your bets';
    } else if (this.phase === 'running') {
      label = sc.gauge(this.m); mult = x2(this.m);
      if (sc.dual) sub = 'Backing ' + routeName;
      else if (sc.fork) sub = this.forkPassed ? 'On the ' + routeName : 'Switch at ' + x2(sc.fork) + ' · Riding ' + routeName;
      else sub = this.bots.filter((b) => b.status === 'in').length + this.slots.filter((s) => s.status === 'active').length + ' players still in';
    } else { label = sc.crashWord; mult = x2(this.m); sub = this.resultText(); }
    const mine = this.slots.reduce((s, x) => s + x.amount, 0);
    this.snap = {
      phase: this.phase, m: this.m, countdown: this.countdown, route: this.route, routeLocked: this.isRouteLocked(), forkPassed: this.forkPassed,
      slots: [this.slots[0], this.slots[1]], bots: this.bots, history: histories[sc.id],
      round: { nonce: this.round.nonce, hash: this.round.hash, client: this.round.client }, prev: this.prev, myBets, topWins: topWins[sc.id],
      hud: { label, mult, sub },
      players: this.bots.length + this.slots.filter((s) => s.status !== 'none').length,
      wagered: this.bots.reduce((s, b) => s + b.bet, 0) + mine,
    };
    this.listeners.forEach((l) => l());
  }
}

/** Re-derive a finished round from its revealed seed and compare with what was published. */
export async function verifyRound(scene: Scene, r: Round): Promise<boolean> {
  const h = await CG.fair.sha256(r.seed);
  const o = await CG.fair.outcome(scene, r.seed, r.client, r.nonce);
  return h === r.hash && JSON.stringify(o) === JSON.stringify(r.out);
}
