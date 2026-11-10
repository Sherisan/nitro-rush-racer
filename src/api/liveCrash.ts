// GameEngineAPI live crash client.
//
// The game server runs the rounds: it draws each crash point with its provably
// fair RNG before betting opens, runs the clock, takes bets, pays cash-outs
// (by hand or automatic) and keeps the wallet. This module only talks to it
// over SignalR (/livecrashhub) and converts server times to this page's clock.
//
// Session: the lobby launches the game as /?token=<jwt> (the token names the
// game). In local dev, with no token in the URL, a demo token is fetched from
// the API's /api/dev-token.

import * as signalR from '@microsoft/signalr';

export const API_BASE = ((import.meta.env.VITE_GAME_API_URL as string | undefined) || 'http://localhost:5003').replace(/\/$/, '');

export type RoundStatus = 'BETTING' | 'FLYING' | 'CRASHED';
export type BetStatus = 'Pending' | 'Active' | 'CashedOut' | 'Lost' | 'Cancelled';

export interface LiveRound {
  gameId: string;
  id: number;
  status: RoundStatus;
  /** Server ms. */
  startedAt: number;
  phaseEndsAt: number;
  crashedAt: number | null;
  /** Only once the round has crashed. */
  crashPoint: number | null;
  serverSeedHash: string;
  nonce: number;
}

export interface MyBet {
  gameId: string;
  id: string;
  roundId: number;
  slot: number;
  amount: number;
  autoCashOut: number | null;
  status: BetStatus;
  cashedOutAt: number | null;
  win: number | null;
  winPending: boolean;
}

export interface PublicBet {
  roundId: number;
  player: string;
  slot: number;
  amount: number;
  cashedOutAt: number | null;
  win: number | null;
}

export interface LiveConfig {
  gameId: string;
  name: string;
  minBet: number;
  maxBet: number;
  maxWin: number;
  growthRate: number;
  bettingMs: number;
  crashedMs: number;
  tickMs: number;
  slots: number;
  minAutoCashOut: number;
  maxMultiplier: number;
}

export interface LiveSnapshot {
  player: { playerId: string; username: string; currency: string };
  balance: number | null;
  config: LiveConfig;
  state: {
    serverTime: number;
    round: LiveRound;
    multiplier: number | null;
    history: { roundId: number; crashPoint: number }[];
    bets: PublicBet[];
    myBets: MyBet[];
    fairness: { currentServerSeedHash: string; previousServerSeed: { serverSeed?: string; hash?: string } | null };
  };
}

export interface Handlers {
  round?: (r: LiveRound) => void;
  tick?: (m: number, serverMs: number) => void;
  myBet?: (bet: MyBet, balance: number | null) => void;
  betPlaced?: (b: PublicBet) => void;
  cashedOut?: (b: PublicBet) => void;
  /** After a reconnect: the whole state again. */
  resync?: (s: LiveSnapshot) => void;
  status?: (s: 'online' | 'reconnecting' | 'offline', message?: string) => void;
}

export class LiveCrashClient {
  private conn: signalR.HubConnection | null = null;
  private token: string | null = null;
  /** serverTime − Date.now(). */
  private offset = 0;
  handlers: Handlers = {};

  /** gameId: this game's id in the API's Games list (used for dev tokens). */
  constructor(private gameId: string) {}

  /** performance.now() time of a server timestamp. */
  toLocal(serverMs: number): number {
    return performance.now() + (serverMs - (Date.now() + this.offset));
  }

  async connect(): Promise<LiveSnapshot> {
    await this.loadToken();
    try {
      return await this.open();
    } catch (e) {
      // A saved dev token can outlive its 4 hours: get a fresh one.
      if (!import.meta.env.DEV) throw e;
      await this.fetchDevToken();
      return this.open();
    }
  }

  private async open(): Promise<LiveSnapshot> {
    await this.conn?.stop().catch(() => {});
    const conn = new signalR.HubConnectionBuilder()
      .withUrl(`${API_BASE}/livecrashhub`, { accessTokenFactory: () => this.token ?? '' })
      .withAutomaticReconnect([0, 1000, 2000, 5000, 10000, 10000, 10000])
      .configureLogging(signalR.LogLevel.Warning)
      .build();
    conn.on('Round', (r: LiveRound) => this.handlers.round?.(r));
    conn.on('Tick', (x: { t: number; m: number }) => this.handlers.tick?.(x.m, x.t));
    conn.on('MyBet', (x: { bet: MyBet; balance: number | null }) => this.handlers.myBet?.(x.bet, x.balance));
    conn.on('BetPlaced', (b: PublicBet) => this.handlers.betPlaced?.(b));
    conn.on('CashedOut', (b: PublicBet) => this.handlers.cashedOut?.(b));
    conn.onreconnecting(() => this.handlers.status?.('reconnecting', 'Connection lost. Reconnecting…'));
    conn.onreconnected(async () => {
      try {
        const s = await this.snapshot();
        this.handlers.status?.('online');
        this.handlers.resync?.(s);
      } catch {
        this.handlers.status?.('offline', "Can't reach the game server.");
      }
    });
    conn.onclose(() => this.handlers.status?.('offline', 'Disconnected from the game server. Reload to play.'));
    this.conn = conn;
    await conn.start();
    const s = await this.snapshot();
    this.handlers.status?.('online');
    return s;
  }

  private async snapshot(): Promise<LiveSnapshot> {
    const sent = Date.now();
    const s = await this.conn!.invoke<LiveSnapshot>('GetSnapshot');
    const got = Date.now();
    this.offset = s.state.serverTime - (sent + got) / 2;
    return s;
  }

  /** Closes the connection (when the game is left). */
  async disconnect() {
    const c = this.conn;
    this.conn = null;
    this.handlers = {};
    await c?.stop().catch(() => {});
  }

  placeBet(slot: number, amount: number, autoCashOut: number | null) {
    return this.call<{ ok: boolean; bet: MyBet | null; balance: number | null; error: string | null }>('PlaceBet', slot, amount, autoCashOut);
  }

  cancelBet(slot: number) {
    return this.call<{ ok: boolean; balance: number | null; error: string | null }>('CancelBet', slot);
  }

  cashOut(slot: number) {
    return this.call<{ ok: boolean; multiplier: number | null; win: number | null; balance: number | null; error: string | null }>('CashOut', slot);
  }

  getBalance() {
    return this.call<number>('GetBalance');
  }

  private async call<T>(method: string, ...args: unknown[]): Promise<T> {
    if (!this.conn || this.conn.state !== signalR.HubConnectionState.Connected) throw new Error("Can't reach the game server.");
    return this.conn.invoke<T>(method, ...args);
  }

  private get tokenKey() {
    return `gameengine_token_${this.gameId}`;
  }

  // Picks up the launch token (and drops it from the address bar so it isn't
  // shared by copying the URL), falling back to a dev token locally.
  private async loadToken() {
    const key = this.tokenKey;
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('token');
    if (fromUrl) {
      this.token = fromUrl;
      sessionStorage.setItem(key, fromUrl);
      params.delete('token');
      const qs = params.toString();
      window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash);
    } else {
      this.token = sessionStorage.getItem(key);
    }
    if (!this.token && import.meta.env.DEV) await this.fetchDevToken();
    if (!this.token) throw new Error('No game session. Open the game from the lobby.');
  }

  private async fetchDevToken() {
    const res = await fetch(`${API_BASE}/api/dev-token?gameId=${encodeURIComponent(this.gameId)}`);
    if (!res.ok) throw new Error("Can't reach the game server.");
    this.token = (await res.json()).token;
    sessionStorage.setItem(this.tokenKey, this.token!);
  }
}
