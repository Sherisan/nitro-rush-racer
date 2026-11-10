/* The player's balance as the GameEngineAPI reports it. Nothing is stored or worked out here:
   the server keeps the wallet, and every bet, cash-out and refund comes back with the new balance. */

export interface BalanceSnapshot { balance: number | null; currency: string; }

class BalanceStore {
  private snap: BalanceSnapshot = { balance: null, currency: '' };
  private listeners = new Set<() => void>();

  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getSnapshot = () => this.snap;
  get balance() { return this.snap.balance; }

  /** A null balance from the server means "unchanged". */
  set(balance: number | null, currency?: string) {
    const next = { balance: balance ?? this.snap.balance, currency: currency ?? this.snap.currency };
    if (next.balance === this.snap.balance && next.currency === this.snap.currency) return;
    this.snap = next;
    this.listeners.forEach((l) => l());
  }
}

export const balanceStore = new BalanceStore();
