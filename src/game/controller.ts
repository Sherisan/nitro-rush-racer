/* Round controller: one instance per open game.
   The GameEngineAPI runs the rounds. It draws every crash point before betting opens, runs the
   clock, takes the bets, pays the cash-outs and keeps the wallet. This class follows its rounds over
   SignalR (/livecrashhub), animates the multiplier between server ticks, draws the scene and sends
   the player's bets, cancels and cash-outs to the server.
   The other players in the bets list and the route picker are only for show.
   React reads it through subscribe/getSnapshot (useSyncExternalStore). */
import { CG } from '../engine/core.js';
import type { Phase, RouteKey, Scene, SceneState } from '../engine/core.js';
import { LiveCrashClient } from '../api/liveCrash';
import type { LiveConfig, LiveRound, LiveSnapshot, MyBet as ServerBet } from '../api/liveCrash';
import { balanceStore } from './balance';

export const VH = 540;

export const x2 = (m: number) => m.toFixed(2) + '×';
export const money = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const r2 = (v: number) => Math.floor(v * 100 + 1e-7) / 100;

export type SlotStatus = 'none' | 'placed' | 'active' | 'cashed' | 'lost';
export interface Slot { status: SlotStatus; amount: number; at?: number; pay?: number; queued: boolean; busy: boolean; }
export interface SlotSettings { bet: number; autoOn: boolean; autoAt: number; autoBet: boolean; }
export interface Bot { name: string; bet: number; target: number; route: RouteKey; status: 'in' | 'cashed' | 'lost'; at: number; when?: number; }
export interface TopWin { name: string; bet: number; at: number; win: number; round: number; you: boolean; }
export interface HistoryEntry { v: number; dot: string | null; detail: string; }
export interface MyBet { id: string; round: number; slot: number; amount: number; at: number | null; pay: number; }
export type Connection = 'connecting' | 'online' | 'reconnecting' | 'offline';
export interface Fairness { hash: string; previous: { seed: string; hash: string } | null; }

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
  betTime: number;
  route: RouteKey;
  routeLocked: boolean;
  slots: [Slot, Slot];
  bots: Bot[];
  history: HistoryEntry[];
  round: { id: number; nonce: number };
  fairness: Fairness;
  myBets: MyBet[];
  topWins: TopWin[];
  hud: { label: string; mult: string; sub: string };
  players: number;
  wagered: number;
  connection: Connection;
  minBet: number;
  maxBet: number;
}

const NAMES = ['Thabo', 'Lerato', 'Sipho', 'Naledi', 'Mpho', 'Ayanda', 'Zola', 'Kagiso', 'Lindiwe', 'Tumi', 'Bongani', 'Nomsa', 'Jabu', 'Refilwe', 'Kabelo', 'Zanele', 'Dineo', 'Themba', 'Pieter', 'Annika', 'Ravi', 'Priya', 'Marco', 'Chen', 'Yusuf', 'Amara', 'Kofi', 'Elena', 'Tariq', 'Mei', 'Lwazi', 'Karabo', 'Nandi', 'Sizwe'];
const MILESTONES = [2, 5, 10, 25, 50, 100];
const SLOT_NAMES = ['A', 'B'];

/* session lists shared across games */
const histories: Record<string, HistoryEntry[]> = {};
const topWins: Record<string, TopWin[]> = {};
let myBets: MyBet[] = [];

export function getHistory(id: string) { return histories[id] || []; }

const emptySlot = (queued = false): Slot => ({ status: 'none', amount: 0, queued, busy: false });
const errorText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

export class GameController {
  readonly scene: Scene;
  private settings: () => [SlotSettings, SlotSettings];
  private toast: (msg: string) => void;
  private onEvent: (e: GameEvent) => void;
  private client: LiveCrashClient;

  private cfg: LiveConfig | null = null;
  private growth = CG.K;
  private betTime = 6;
  private round: LiveRound | null = null;
  private connection: Connection = 'connecting';
  private fairness: Fairness = { hash: '', previous: null };

  private phase: Phase = 'betting';
  private betEnd = 0;
  private runStart = 0;
  private crashTime = 0;
  private m = 1;
  private t = 0;
  private countdown = 0;
  private lastTick = -1;
  private nextMilestone = 0;
  private route: RouteKey = 'L';
  private slots: [Slot, Slot] = [emptySlot(), emptySlot()];
  private bots: Bot[] = [];
  private cashAt: number | null = null;
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

  constructor(scene: Scene, settings: () => [SlotSettings, SlotSettings], toast: (msg: string) => void, onEvent: (e: GameEvent) => void) {
    this.scene = scene; this.settings = settings; this.toast = toast; this.onEvent = onEvent;
    histories[scene.id] = histories[scene.id] || [];
    topWins[scene.id] = topWins[scene.id] || [];
    this.st = scene.init(this.VW, VH);
    this.emit();
    this.client = new LiveCrashClient(scene.id);
    this.client.handlers = {
      round: (r) => this.onRound(r),
      tick: (m, serverMs) => this.onTick(m, serverMs),
      myBet: (b, bal) => this.onMyBet(b, bal),
      resync: (s) => this.applySnapshot(s),
      status: (s, msg) => {
        if (this.disposed) return;
        this.connection = s;
        if (msg && s !== 'online') this.toast(msg);
        this.emit();
      },
    };
    this.client.connect().then((s) => this.applySnapshot(s)).catch((e) => {
      if (this.disposed) return;
      this.connection = 'offline';
      this.toast(errorText(e, "Can't reach the game server."));
      this.emit();
    });
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
  /** Leaving the game. Bets stay on the server: auto cash-outs still pay, the rest settle with the round. */
  dispose() {
    if (this.disposed) return;
    this.disposed = true; cancelAnimationFrame(this.raf); this.listeners.clear();
    void this.client.disconnect();
  }

  /* ---------- server state ---------- */
  private applySnapshot(s: LiveSnapshot) {
    if (this.disposed) return;
    this.cfg = s.config;
    this.growth = s.config.growthRate || CG.K;
    this.betTime = s.config.bettingMs / 1000;
    balanceStore.set(s.balance, s.player.currency);
    histories[this.scene.id] = s.state.history.map((h) => ({ v: h.crashPoint, dot: null, detail: 'Round ' + h.roundId + ' crashed at ' + x2(h.crashPoint) }));
    const prev = s.state.fairness.previousServerSeed;
    this.fairness = { hash: s.state.fairness.currentServerSeedHash, previous: prev && prev.serverSeed && prev.hash ? { seed: prev.serverSeed, hash: prev.hash } : null };
    const r = s.state.round;
    this.round = null;
    this.onRound(r, true);
    if (r.status === 'FLYING' && s.state.multiplier) this.onTick(s.state.multiplier, s.state.serverTime);
    this.slots = [0, 1].map((i) => {
      const b = s.state.myBets.find((x) => x.roundId === r.id && x.slot === i);
      return b ? this.slotFromServer(b, this.slots[i]) : emptySlot(this.slots[i].queued);
    }) as [Slot, Slot];
    this.emit();
  }

  private slotFromServer(b: ServerBet, old: Slot): Slot {
    const base = { amount: b.amount, queued: false, busy: false };
    switch (b.status) {
      case 'Pending': return { ...base, status: 'placed' };
      /* the server calls a bet Active as soon as it is in the round, before launch too */
      case 'Active': return { ...base, status: this.phase === 'running' ? 'active' : 'placed' };
      case 'CashedOut': return { ...base, status: 'cashed', at: b.cashedOutAt ?? undefined, pay: b.win ?? 0 };
      case 'Lost': return { ...base, status: 'lost' };
      default: return emptySlot(old.queued);
    }
  }

  private onRound(r: LiveRound, restore = false) {
    if (this.disposed) return;
    const prev = this.round;
    this.round = r;
    if (r.serverSeedHash) this.fairness = { ...this.fairness, hash: r.serverSeedHash };
    if (r.status === 'BETTING') {
      this.betEnd = this.client.toLocal(r.phaseEndsAt) / 1000;
      if (!prev || prev.id !== r.id || this.phase !== 'betting') this.newRound(restore);
    } else if (r.status === 'FLYING') {
      this.runStart = this.client.toLocal(r.startedAt) / 1000;
      if (this.phase !== 'running') this.startRun(restore);
    } else if (r.status === 'CRASHED') {
      if (this.phase !== 'crashed') this.finishRound(r, restore);
    }
    this.emit();
  }

  private onTick(m: number, serverMs: number) {
    if (this.disposed || this.phase !== 'running') return;
    this.runStart = this.client.toLocal(serverMs) / 1000 - Math.log(Math.max(1, m)) / this.growth;
  }

  private onMyBet(b: ServerBet, bal: number | null) {
    if (this.disposed) return;
    balanceStore.set(bal);
    if (!this.round || b.roundId !== this.round.id || b.slot < 0 || b.slot > 1) return;
    const i = b.slot, s = this.slots[i];
    if (b.status === 'CashedOut') this.markCashed(i, b.amount, b.cashedOutAt ?? this.m, b.win ?? 0, b.winPending);
    else if (b.status === 'Lost' && s.status !== 'lost') { this.slots[i] = { ...s, status: 'lost', amount: b.amount, busy: false }; this.logBet(i, b.amount, null, 0); }
    else if (b.status === 'Cancelled') this.slots[i] = emptySlot(s.queued);
    else if (b.status === 'Pending' && s.status !== 'placed') this.slots[i] = { ...s, status: 'placed', amount: b.amount, busy: false };
    else if (b.status === 'Active') this.slots[i] = { ...s, status: this.phase === 'running' ? 'active' : 'placed', amount: b.amount, busy: false };
    this.emit();
  }

  /* ---------- round lifecycle (following the server) ---------- */
  private makeBots(): Bot[] {
    const n = 9 + Math.floor(Math.random() * 10), pool = NAMES.slice().sort(() => Math.random() - 0.5), bets = [5, 10, 10, 20, 25, 50, 50, 100, 200, 250, 500, 1000];
    return pool.slice(0, n).map((name) => {
      let target = 1.05 - Math.log(1 - Math.random()) * 1.5;
      if (Math.random() < 0.12) target *= 3;
      return { name, bet: bets[Math.floor(Math.random() * bets.length)], target: Math.max(1.01, r2(target)), route: (Math.random() < 0.5 ? 'L' : 'R') as RouteKey, status: 'in' as const, at: 0 };
    });
  }

  private newRound(restore: boolean) {
    this.phase = 'betting'; this.st = this.scene.init(this.VW, VH);
    this.cashAt = null; this.m = 1; this.t = 0; this.lastTick = -1; this.nextMilestone = 0;
    const queued = this.slots.map((s) => s.queued);
    this.slots = [emptySlot(), emptySlot()];
    this.bots = this.makeBots();
    if (restore) return;
    const set = this.settings();
    queued.forEach((q, i) => {
      if (q || set[i].autoBet) void this.placeBet(i, set[i].autoBet && !q);
    });
  }

  private startRun(restore: boolean) {
    this.phase = 'running';
    this.slots = this.slots.map((s) => (s.status === 'placed' ? { ...s, status: 'active' as const } : s)) as [Slot, Slot];
    if (!restore) this.onEvent({ type: 'launch' });
  }

  private finishRound(r: LiveRound, restore: boolean) {
    const end = r.crashPoint ?? this.m;
    this.phase = 'crashed'; this.crashTime = performance.now() / 1000; this.m = end;
    if (!restore) this.punch = 1;
    /* the server confirms each lost bet with MyBet; show it straight away */
    this.slots = this.slots.map((s, i) => {
      if (s.status !== 'active') return s;
      this.logBet(i, s.amount, null, 0);
      return { ...s, status: 'lost' as const, busy: false };
    }) as [Slot, Slot];
    this.bots = this.bots.map((b) => (b.status !== 'in' ? b : b.target <= end ? { ...b, status: 'cashed' as const, at: b.target } : { ...b, status: 'lost' as const }));
    const h = histories[this.scene.id];
    if (r.crashPoint != null && !h.some((x) => x.detail.startsWith('Round ' + r.id + ' '))) {
      histories[this.scene.id] = [{ v: end, dot: null, detail: 'Round ' + r.id + ' crashed at ' + x2(end) }, ...h].slice(0, 40);
    }
    if (!restore) this.onEvent({ type: 'crash', m: end });
  }

  /* ---------- player actions (sent to the server) ---------- */
  setRoute(k: RouteKey) { if (!this.isRouteLocked()) { this.route = k; this.emit(); } }
  isRouteLocked() { return !this.scene.routes || this.phase !== 'betting'; }

  /** Fetches the balance from the server again. */
  async refreshBalance() {
    try { balanceStore.set(await this.client.getBalance()); this.toast('Balance updated from the game server.'); }
    catch (e) { this.toast(errorText(e, "Can't reach the game server.")); }
  }

  private async placeBet(i: number, auto = false) {
    const set = this.settings()[i], a = r2(set.bet), min = this.cfg?.minBet ?? 1, max = this.cfg?.maxBet ?? Infinity;
    const stop = (msg: string) => { this.toast(msg); if (auto) this.onEvent({ type: 'autostop', slot: i }); };
    if (a < min || a > max) { stop('Bets must be between ' + money(min) + ' and ' + money(max) + '.'); return; }
    const bal = balanceStore.balance;
    if (bal != null && a > bal) { stop(auto ? 'Auto bet ' + SLOT_NAMES[i] + ' stopped: not enough balance.' : 'Not enough balance for that bet.'); return; }
    const roundId = this.round?.id;
    this.slots[i] = { status: 'placed', amount: a, queued: false, busy: true };
    this.emit();
    try {
      const res = await this.client.placeBet(i, a, set.autoOn ? r2(set.autoAt) : null);
      if (this.disposed) return;
      balanceStore.set(res.balance);
      if (!res.ok || !res.bet) { this.slots[i] = emptySlot(); stop(res.error || 'The bet was not accepted.'); }
      else if (this.round?.id === roundId) { this.slots[i] = this.slotFromServer(res.bet, this.slots[i]); this.onEvent({ type: 'bet', slot: i }); }
    } catch (e) {
      if (this.disposed) return;
      this.slots[i] = emptySlot();
      stop(errorText(e, 'The bet failed.'));
    }
    this.emit();
  }

  private async cancelBet(i: number) {
    this.slots[i] = { ...this.slots[i], busy: true }; this.emit();
    try {
      const res = await this.client.cancelBet(i);
      if (this.disposed) return;
      balanceStore.set(res.balance);
      if (res.ok) this.slots[i] = emptySlot();
      else { this.slots[i] = { ...this.slots[i], busy: false }; this.toast(res.error || 'The bet could not be cancelled.'); }
    } catch (e) {
      if (this.disposed) return;
      this.slots[i] = { ...this.slots[i], busy: false }; this.toast(errorText(e, 'Cancel failed.'));
    }
    this.emit();
  }

  private async cashOut(i: number) {
    const s = this.slots[i];
    this.slots[i] = { ...s, busy: true }; this.emit();
    try {
      const res = await this.client.cashOut(i);
      if (this.disposed) return;
      balanceStore.set(res.balance);
      if (res.ok && res.multiplier != null) this.markCashed(i, s.amount, res.multiplier, res.win ?? r2(s.amount * res.multiplier), res.balance === null);
      else { this.slots[i] = { ...this.slots[i], busy: false }; this.toast(res.error || 'Too late: the round crashed first.'); }
    } catch (e) {
      if (this.disposed) return;
      this.slots[i] = { ...this.slots[i], busy: false }; this.toast(errorText(e, 'Cash-out failed.'));
    }
    this.emit();
  }

  /** A confirmed cash-out, from the CashOut reply or the MyBet event, whichever arrives first. */
  private markCashed(i: number, amount: number, at: number, pay: number, pending: boolean) {
    const s = this.slots[i];
    if (s.status === 'cashed') return;
    this.slots[i] = { status: 'cashed', amount, at, pay, queued: s.queued, busy: false };
    this.cashAt = at;
    this.logBet(i, amount, at, pay);
    this.addTop({ name: 'You', bet: amount, at, win: pay, round: this.round?.nonce ?? 0, you: true });
    this.onEvent({ type: 'cashout', slot: i, at, pay });
    if (pending) this.toast('Win confirmed. It will reach your balance shortly.');
  }

  /** The main button of a slot: place, cancel, cash out, or queue for the next round. */
  action(i: number) {
    const s = this.slots[i];
    if (s.busy) return;
    if (this.connection !== 'online' || !this.round) { this.toast("Not connected to the game server yet."); return; }
    if (this.round.status === 'BETTING' && this.phase === 'betting') {
      if (s.status === 'none') void this.placeBet(i);
      else if (s.status === 'placed') void this.cancelBet(i);
    } else if (this.phase === 'running' && s.status === 'active') void this.cashOut(i);
    else { this.slots[i] = { ...s, queued: !s.queued }; this.emit(); }
  }

  private addTop(w: TopWin) {
    const list = topWins[this.scene.id];
    list.push(w); list.sort((a, b) => b.win - a.win);
    topWins[this.scene.id] = list.slice(0, 12);
  }
  private logBet(i: number, amount: number, at: number | null, pay: number) {
    const round = this.round?.id ?? 0;
    if (myBets.some((b) => b.round === round && b.slot === i)) return;
    myBets = [{ id: round + ':' + i, round, slot: i, amount, at, pay }, ...myBets].slice(0, 60);
  }

  /* ---------- frame ---------- */
  private frame() {
    const t = performance.now() / 1000, dt = Math.min(0.05, t - this.last); this.last = t;
    if (this.phase === 'betting') {
      this.countdown = this.round ? Math.max(0, this.betEnd - t) : 0;
      const sec = Math.ceil(this.countdown);
      if (this.round && sec !== this.lastTick && sec <= 3 && sec >= 1) this.onEvent({ type: 'tick', last: sec === 1 });
      this.lastTick = sec;
    } else if (this.phase === 'running') {
      /* between server ticks the multiplier follows the same curve the server uses; the server ends the round */
      this.t = Math.max(0, t - this.runStart);
      const m = Math.min(this.cfg?.maxMultiplier ?? 10000, Math.exp(this.growth * this.t));
      let changed = false;
      const bots = this.bots.map((b) => {
        if (b.status !== 'in' || m < b.target) return b;
        changed = true;
        this.addTop({ name: b.name, bet: b.bet, at: b.target, win: r2(b.bet * b.target), round: this.round?.nonce ?? 0, you: false });
        return { ...b, status: 'cashed' as const, at: b.target, when: t };
      });
      if (changed) this.bots = bots;
      this.m = m;
      if (this.nextMilestone < MILESTONES.length && m >= MILESTONES[this.nextMilestone]) { this.onEvent({ type: 'milestone', m: MILESTONES[this.nextMilestone] }); this.nextMilestone++; }
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
      phase: this.phase, m: this.m, p: Math.log(this.m), t: this.t, dt, time: t, countdown: this.round ? this.countdown : this.betTime,
      crashAge: this.phase === 'crashed' ? t - this.crashTime : 0, cashAt: this.cashAt, route: this.route,
      routes: this.scene.routes, fork: undefined, forkPassed: false, dual: null,
    };
    try { this.scene.draw(ctx, W, VH, S, this.st); } catch (e) { console.error(e); }
    // post: film grain and crash flash
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    CG.U.grain(ctx, W, VH, 0.06);
    if (this.punch > 0) {
      ctx.save(); ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = 'rgba(255,60,40,' + (this.punch * 0.35).toFixed(3) + ')'; ctx.fillRect(0, 0, W, VH);
      ctx.restore();
    }
  }

  /* ---------- HUD text ---------- */
  private emit() {
    const sc = this.scene, r = this.round;
    let label: string, mult: string, sub: string;
    if (!r) {
      label = this.connection === 'offline' ? 'Offline' : 'Connecting';
      mult = x2(1);
      sub = this.connection === 'offline' ? "Can't reach the game server" : 'Joining the game server…';
    } else if (this.phase === 'betting') {
      label = 'Bets open'; mult = x2(1); sub = 'Next round in ' + this.countdown.toFixed(1) + 's';
    } else if (this.phase === 'running') {
      label = sc.gauge(this.m); mult = x2(this.m);
      sub = this.bots.filter((b) => b.status === 'in').length + this.slots.filter((s) => s.status === 'active').length + ' players still in';
    } else {
      label = sc.crashWord; mult = x2(this.m);
      sub = sc.crashLines ? sc.crashLines[r.id % sc.crashLines.length] : 'Round ' + r.id + ' crashed';
    }
    const mine = this.slots.reduce((s, x) => s + (x.status === 'none' ? 0 : x.amount), 0);
    this.snap = {
      phase: this.phase, m: this.m, countdown: this.countdown, betTime: this.betTime, route: this.route, routeLocked: this.isRouteLocked(),
      slots: [this.slots[0], this.slots[1]], bots: this.bots, history: histories[sc.id],
      round: { id: r?.id ?? 0, nonce: r?.nonce ?? 0 }, fairness: this.fairness, myBets, topWins: topWins[sc.id],
      hud: { label, mult, sub },
      players: this.bots.length + this.slots.filter((s) => s.status !== 'none').length,
      wagered: this.bots.reduce((s, b) => s + b.bet, 0) + mine,
      connection: this.connection, minBet: this.cfg?.minBet ?? 1, maxBet: this.cfg?.maxBet ?? 10000,
    };
    this.listeners.forEach((l) => l());
  }
}

/** True when the revealed server seed hashes to the hash that was published before its rounds. */
export async function seedMatchesHash(seed: string, hash: string): Promise<boolean> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seed));
  const hex = Array.from(new Uint8Array(d)).map((x) => x.toString(16).padStart(2, '0')).join('');
  return hex === hash.toLowerCase();
}
