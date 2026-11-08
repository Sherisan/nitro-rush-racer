/* Demo-credit wallet shared by every game. Credits have no cash value. */

export interface Stats { rounds: number; wagered: number; net: number; }
export interface WalletSnapshot { balance: number; stats: Stats; }

const START = 1000;

function read<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable: keep in memory */ }
}

export const r2 = (v: number) => Math.floor(v * 100 + 1e-7) / 100;

export class Wallet {
  private snap: WalletSnapshot;
  private listeners = new Set<() => void>();

  constructor() {
    const balance = Number(read('cg.balance', START));
    this.snap = { balance: isFinite(balance) ? balance : START, stats: read<Stats>('cg.stats', { rounds: 0, wagered: 0, net: 0 }) };
  }

  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getSnapshot = () => this.snap;
  get balance() { return this.snap.balance; }

  private commit(balance: number, stats: Stats) {
    this.snap = { balance: r2(balance), stats };
    write('cg.balance', this.snap.balance);
    write('cg.stats', stats);
    this.listeners.forEach((l) => l());
  }

  /** Take a stake. Returns false when the balance is too low. */
  stake(amount: number): boolean {
    if (amount > this.snap.balance) return false;
    const s = this.snap.stats;
    this.commit(this.snap.balance - amount, { rounds: s.rounds + 1, wagered: s.wagered + amount, net: s.net });
    return true;
  }
  refund(amount: number) {
    const s = this.snap.stats;
    this.commit(this.snap.balance + amount, { rounds: s.rounds - 1, wagered: s.wagered - amount, net: s.net });
  }
  win(stake: number, payout: number) {
    const s = this.snap.stats;
    this.commit(this.snap.balance + payout, { ...s, net: s.net + payout - stake });
  }
  lose(stake: number) {
    const s = this.snap.stats;
    this.commit(this.snap.balance, { ...s, net: s.net - stake });
  }
  reset() { this.commit(START, { rounds: 0, wagered: 0, net: 0 }); }
}

export const wallet = new Wallet();
