import { memo, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { CG } from '../engine/core.js';
import type { RouteKey, Scene } from '../engine/core.js';
import { BET_TIME, GameController, getClientSeed, getGraph, money, setClientSeed, setGraph, verifyRound, x2 } from '../game/controller';
import type { Bot, GameEvent, HistoryEntry, MyBet, Round, Slot, SlotSettings, Snapshot, TopWin } from '../game/controller';
import { r2, wallet } from '../game/wallet';
import { sound } from '../game/audio';

const noSub = () => () => {};
const noSnap = (): Snapshot | null => null;
const tier = (v: number) => (v >= 10 ? 'hi' : v >= 2 ? 'mid' : 'lo');
const mask = (n: string) => (n.length <= 2 ? n : n[0] + '***' + n[n.length - 1]);
const AV = ['#ef4444', '#f59e0b', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6'];
const avColor = (n: string) => AV[[...n].reduce((s, c) => s + c.charCodeAt(0), 0) % AV.length];

interface Props { scene: Scene; toast: (m: string) => void; }
interface Pop { id: number; text: string; sub: string; big: boolean; }

const defaultSlot = (bet: number): SlotSettings => ({ bet, autoOn: false, autoAt: 2, autoBet: false });

export function GameView({ scene, toast }: Props) {
  const [slotSet, setSlotSet] = useState<[SlotSettings, SlotSettings]>(() => [defaultSlot(10), defaultSlot(5)]);
  const settings = useRef(slotSet); settings.current = slotSet;
  const [ctrl, setCtrl] = useState<GameController | null>(null);
  const [pops, setPops] = useState<Pop[]>([]);
  const [tab, setTab] = useState<'all' | 'mine' | 'top'>('all');
  const [modal, setModal] = useState<null | 'how' | 'fair'>(null);
  const [graph, setGraphState] = useState(getGraph());
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const toastRef = useRef(toast); toastRef.current = toast;
  const popId = useRef(0);

  const updateSlot = useCallback((i: number, patch: Partial<SlotSettings>) => setSlotSet((s) => { const n = [...s] as [SlotSettings, SlotSettings]; n[i] = { ...n[i], ...patch }; return n; }), []);

  const onEvent = useCallback((e: GameEvent) => {
    if (e.type === 'tick') sound.tick(e.last);
    else if (e.type === 'bet') sound.bet();
    else if (e.type === 'launch') { sound.launch(); if (scene.sound) sound.startHum(scene.sound); }
    else if (e.type === 'milestone') sound.milestone();
    else if (e.type === 'crash') { sound.stopHum(); sound.crash(); }
    else if (e.type === 'autostop') updateSlot(e.slot, { autoBet: false });
    else if (e.type === 'cashout') {
      const big = e.at >= 10;
      sound.cashout(big);
      const id = ++popId.current;
      setPops((p) => [...p, { id, text: '+' + money(e.pay), sub: (big ? 'Big win · ' : 'You cashed out · ') + x2(e.at), big }]);
      window.setTimeout(() => setPops((p) => p.filter((x) => x.id !== id)), big ? 3200 : 2200);
    }
  }, [scene, updateSlot]);

  /* one controller per mounted game; created in an effect so StrictMode remounts stay clean */
  useEffect(() => {
    const c = new GameController(scene, wallet, () => settings.current, (m) => toastRef.current(m), onEvent);
    const cv = canvasRef.current as HTMLCanvasElement;
    c.attach(cv);
    const ro = new ResizeObserver(() => c.resize());
    ro.observe(cv);
    setCtrl(c);
    return () => { ro.disconnect(); c.dispose(); sound.stopHum(); setCtrl(null); };
  }, [scene, onEvent]);

  const snap = useSyncExternalStore(ctrl ? ctrl.subscribe : noSub, ctrl ? ctrl.getSnapshot : noSnap);
  const { balance } = useSyncExternalStore(wallet.subscribe, wallet.getSnapshot);
  useEffect(() => { if (snap && snap.phase === 'running') sound.updateHum(snap.m); }, [snap]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setModal(null); return; }
      const tag = (document.activeElement && document.activeElement.tagName) || '';
      if (e.code !== 'Space' || modal || /INPUT|TEXTAREA|SELECT|BUTTON/.test(tag)) return;
      e.preventDefault(); sound.unlock(); ctrl?.action(0);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [ctrl, modal]);

  const progress = snap && snap.phase === 'betting' ? snap.countdown / BET_TIME : 0;

  return (
    <section className="game" onPointerDown={() => sound.unlock()}>
      <div className="game-grid">
        <div className="play">
          <div className="play-top">
            <div className="game-id">
              <span className="gi-mark" aria-hidden="true" />
              <h1>{scene.name}</h1>
              <span className="gi-mech">{scene.mech}</span>
            </div>
            <div className="play-actions">
              <button type="button" className="ghost-btn" onClick={() => setModal('how')}><InfoIcon />How to play</button>
              <button type="button" className="ghost-btn fair-btn" onClick={() => setModal('fair')}><ShieldIcon />Provably fair</button>
            </div>
          </div>

          <History items={snap ? snap.history : []} />

          <div className="stage" style={{ background: scene.bg }}>
            <canvas ref={canvasRef} />
            {snap && (
              <>
                <div className="stage-top">
                  <span className="pill"><span className={'state-dot ' + snap.phase} />{snap.phase === 'running' ? 'Live' : snap.phase === 'betting' ? 'Bets open' : 'Round over'} · #{snap.round.nonce}</span>
                  <div className="stage-tools">
                    <span className="pill pill-players"><UsersIcon />{snap.players} · {money(snap.wagered)}</span>
                    {scene.graph !== false && (
                      <button type="button" className={'pill pill-btn' + (graph ? ' on' : '')} aria-pressed={graph} onClick={() => { setGraph(!graph); setGraphState(!graph); }} title="Show the multiplier curve"><ChartIcon />Curve</button>
                    )}
                  </div>
                </div>
                <div className="hud" data-phase={snap.phase} aria-live="polite">
                  <span className="hud-label">{snap.hud.label}</span>
                  <span className="hud-mult">{snap.hud.mult}</span>
                  <span className="hud-sub">{snap.hud.sub}</span>
                </div>
                {snap.phase === 'betting' && <div className="countdown"><i style={{ transform: `scaleX(${progress})` }} /></div>}
                <div className="pops">
                  {pops.map((p) => <div key={p.id} className={'pop' + (p.big ? ' big' : '')}><span>{p.sub}</span><b>{p.text}</b></div>)}
                </div>
              </>
            )}
          </div>

          {scene.routes && snap && (
            <div className="route-bar">
              <div className="route-info"><b>Pick your route</b><span>{scene.dual ? 'Locks at launch' : 'Locks at ' + x2(scene.fork as number) + ' · each route has its own crash point'}</span></div>
              <div className="seg" role="group" aria-label="Route">
                {(['L', 'R'] as RouteKey[]).map((k) => (
                  <button key={k} id={'route' + k} type="button" className="seg-btn" style={{ ['--rc' as string]: scene.routes![k].color }}
                    aria-pressed={snap.route === k} disabled={snap.routeLocked && snap.route !== k} onClick={() => ctrl?.setRoute(k)}>
                    <span className="dot" />{scene.routes![k].name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="slots">
            {[0, 1].map((i) => (
              <BetSlot key={i} index={i} set={slotSet[i]} slot={snap ? snap.slots[i] : null} phase={snap ? snap.phase : 'betting'} m={snap ? snap.m : 1}
                balance={balance} onChange={(p) => updateSlot(i, p)} onAction={() => { sound.unlock(); ctrl?.action(i); }} />
            ))}
          </div>
          {balance < 1 && <p className="low">You're out of demo credits. <button type="button" className="link" onClick={() => { wallet.reset(); toast('Demo credits reset to 1,000.00'); }}>Reset to 1,000</button></p>}
        </div>

        <aside className="bets-panel" aria-label="Bets">
          <div className="tabs" role="tablist">
            {([['all', 'All bets'], ['mine', 'My bets'], ['top', 'Top']] as const).map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
            ))}
          </div>
          {snap && tab === 'all' && <AllBets bots={snap.bots} slots={snap.slots} phase={snap.phase} route={snap.route} scene={scene} />}
          {snap && tab === 'mine' && <MyBets bets={snap.myBets} />}
          {snap && tab === 'top' && <TopWins wins={snap.topWins} />}
        </aside>
      </div>

      {modal && (
        <Modal title={modal === 'how' ? 'How to play ' + scene.name : 'Provably fair'} onClose={() => setModal(null)}>
          {modal === 'how' ? <HowTo scene={scene} /> : snap ? <Fairness scene={scene} round={snap.round} prev={snap.prev} toast={toast} /> : null}
        </Modal>
      )}
    </section>
  );
}

/* ---------- icons ---------- */
function ShieldIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3Zm-1.2 14.2-3.5-3.5 1.4-1.4 2.1 2.1 4.9-4.9 1.4 1.4-6.3 6.3Z" /></svg>; }
function InfoIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 15h-2v-6h2v6Zm0-8h-2V7h2v2Z" /></svg>; }
function UsersIcon() { return <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM9 13c-3.3 0-7 1.7-7 4v3h14v-3c0-2.3-3.7-4-7-4Zm7 0c-.5 0-1 0-1.5.1 1.5 1 2.5 2.3 2.5 3.9v3h5v-3c0-2.2-3.4-4-6-4Z" /></svg>; }
function ChartIcon() { return <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" d="M3 20h18M4 17c6 0 10-4 15-13" /></svg>; }

/* ---------- modal ---------- */
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <div className="modal-wrap" role="presentation" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><h2>{title}</h2><button ref={ref} type="button" className="icon-btn" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

function HowTo({ scene }: { scene: Scene }) {
  const steps: Array<[string, string]> = [
    ['Place a bet', 'Set an amount in Bet 1, Bet 2 or both while the countdown runs, then press Bet.'],
    ['Watch it climb', 'When the round starts, the multiplier rises from 1.00× and so does what your bet would pay.'],
    ['Cash out in time', 'Press Cash out before the round crashes to win your bet times the multiplier. If it crashes first, the bet is lost.'],
  ];
  if (scene.fork && scene.routes) steps.splice(2, 0, ['Choose a route', 'At ' + x2(scene.fork) + ' the track splits into ' + scene.routes.L.name + ' and ' + scene.routes.R.name + '. Each has its own hidden crash point. You can switch until the split.']);
  if (scene.dual && scene.routes) steps.splice(1, 0, ['Back a route', 'Pick ' + scene.routes.L.name + ' or ' + scene.routes.R.name + ' before launch. Both run at once, and your bet follows the route you picked.']);
  return (
    <div className="howto">
      <p className="howto-lede">{scene.blurb}</p>
      <ol>{steps.map(([t, d], i) => <li key={i}><b>{t}</b><span>{d}</span></li>)}</ol>
      <div className="howto-grid">
        <div><span>Return to player</span><b>97%</b></div>
        <div><span>Top multiplier</span><b>10,000×</b></div>
        <div><span>Rounds that bust at 1.00×</span><b>3%</b></div>
      </div>
      <p className="note">Use <b>Auto</b> on a bet panel to bet every round or cash out at a set multiplier. Space bar bets or cashes out on Bet 1. Demo credits have no cash value.</p>
    </div>
  );
}

/* ---------- bet slot ---------- */
function BetSlot({ index, set, slot, phase, m, balance, onChange, onAction }: {
  index: number; set: SlotSettings; slot: Slot | null; phase: string; m: number; balance: number;
  onChange: (p: Partial<SlotSettings>) => void; onAction: () => void;
}) {
  const [mode, setMode] = useState<'bet' | 'auto'>('bet');
  const [betText, setBetText] = useState(set.bet.toFixed(2));
  const [autoText, setAutoText] = useState(set.autoAt.toFixed(2));
  useEffect(() => { setBetText(set.bet.toFixed(2)); }, [set.bet]);
  const commitBet = (v: number) => { const n = Math.max(1, r2(v || 0)); setBetText(n.toFixed(2)); onChange({ bet: n }); };
  const s = slot ? slot.status : 'none';
  let label: string, sub: string, cls: string;
  if (phase === 'betting' && s === 'none') { label = 'Bet'; sub = money(set.bet) + ' credits'; cls = 'go'; }
  else if (phase === 'betting' && s === 'placed') { label = 'Cancel'; sub = 'Waiting for the round'; cls = 'stop'; }
  else if (phase === 'running' && s === 'active' && slot) { label = 'Cash out'; sub = money(r2(slot.amount * m)); cls = 'cash'; }
  else if (slot?.queued) { label = 'Cancel'; sub = 'Queued for next round'; cls = 'stop'; }
  else { label = 'Bet'; sub = 'Next round · ' + money(set.bet); cls = 'go dim'; }
  const locked = s === 'placed' || s === 'active';
  const result = s === 'cashed' && slot ? { t: 'Won ' + money(slot.pay as number), c: 'win' } : s === 'lost' && slot ? { t: 'Lost ' + money(slot.amount), c: 'loss' } : null;
  return (
    <div className={'slot' + (s === 'active' ? ' live' : '') + (result ? ' ' + result.c : '')}>
      <div className="slot-head">
        <div className="mini-tabs" role="tablist" aria-label={'Bet ' + (index + 1) + ' mode'}>
          <button type="button" role="tab" aria-selected={mode === 'bet'} className={mode === 'bet' ? 'on' : ''} onClick={() => setMode('bet')}>Bet</button>
          <button type="button" role="tab" aria-selected={mode === 'auto'} className={mode === 'auto' ? 'on' : ''} onClick={() => setMode('auto')}>Auto{(set.autoBet || set.autoOn) && <i className="auto-dot" />}</button>
        </div>
        {result ? <span className={'slot-result ' + result.c}>{result.t}</span> : <span className="slot-name">Bet {index + 1}</span>}
      </div>
      <div className="slot-body">
        <div className="slot-controls">
          <div className="amount">
            <button type="button" aria-label={'Lower bet ' + (index + 1)} disabled={locked} onClick={() => commitBet(set.bet - (set.bet > 10 ? 5 : 1))}>−</button>
            <input id={'bet' + index} type="number" inputMode="decimal" min="1" step="1" value={betText} disabled={locked}
              onChange={(e) => { setBetText(e.target.value); const v = parseFloat(e.target.value); if (v >= 1) onChange({ bet: r2(v) }); }}
              onBlur={() => commitBet(parseFloat(betText))} aria-label={'Bet ' + (index + 1) + ' amount'} />
            <button type="button" aria-label={'Raise bet ' + (index + 1)} disabled={locked} onClick={() => commitBet(set.bet + (set.bet >= 10 ? 5 : 1))}>+</button>
          </div>
          <div className="quick">
            {[10, 50, 100, 500].map((v) => <button key={v} type="button" disabled={locked} onClick={() => commitBet(Math.min(v, Math.max(1, Math.floor(balance))))}>{v}</button>)}
          </div>
        </div>
        <button type="button" className={'act ' + cls} onClick={onAction}>
          <span className="act-label">{label}</span>
          <span className="act-sub">{sub}</span>
        </button>
      </div>
      {mode === 'auto' && (
        <div className="auto-panel">
          <label className="toggle">
            <input id={'autobet' + index} type="checkbox" checked={set.autoBet} onChange={(e) => onChange({ autoBet: e.target.checked })} />
            <span className="switch" aria-hidden="true" />Auto bet every round
          </label>
          <div className="auto-row">
            <label className="toggle">
              <input id={'auto' + index} type="checkbox" checked={set.autoOn} onChange={(e) => onChange({ autoOn: e.target.checked })} />
              <span className="switch" aria-hidden="true" />Auto cash out at
            </label>
            <div className="auto">
              <input id={'autoAt' + index} type="number" inputMode="decimal" min="1.01" step="0.1" value={autoText} disabled={!set.autoOn}
                onChange={(e) => { setAutoText(e.target.value); const v = parseFloat(e.target.value); if (v >= 1.01) onChange({ autoAt: r2(v) }); }}
                onBlur={() => { const v = Math.max(1.01, r2(parseFloat(autoText) || 2)); setAutoText(v.toFixed(2)); onChange({ autoAt: v }); }}
                aria-label={'Auto cash out multiplier for bet ' + (index + 1)} />
              <span>×</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- history pills ---------- */
const History = memo(function History({ items }: { items: HistoryEntry[] }) {
  return (
    <div className="history" aria-label="Recent results">
      {items.length === 0 ? <span className="hist-empty">Recent results will line up here</span> :
        items.map((e, i) => (
          <span key={items.length - i} className={'mpill ' + tier(e.v) + (i === 0 ? ' latest' : '')} title={e.detail}>
            {e.dot && <i style={{ background: e.dot }} />}{x2(e.v)}
          </span>
        ))}
    </div>
  );
});

/* ---------- bets panel ---------- */
function Avatar({ name, you }: { name: string; you?: boolean }) {
  return <span className={'avatar' + (you ? ' you' : '')} style={{ background: you ? undefined : avColor(name) }} aria-hidden="true">{you ? 'You' : name[0]}</span>;
}
const AllBets = memo(function AllBets({ bots, slots, phase, route, scene }: { bots: Bot[]; slots: [Slot, Slot]; phase: string; route: RouteKey; scene: Scene }) {
  const total = bots.length + slots.filter((s) => s.status !== 'none').length;
  const won = bots.reduce((s, b) => s + (b.status === 'cashed' ? r2(b.bet * b.at) : 0), 0) + slots.reduce((s, x) => s + (x.pay || 0), 0);
  const routeDot = (k: RouteKey) => scene.routes ? <i className="rdot" style={{ background: scene.routes[k].color }} title={scene.routes[k].name} /> : null;
  const cell = (st: string, at?: number) => st === 'cashed' ? <span className={'mpill sm ' + tier(at as number)}>{x2(at as number)}</span> : st === 'lost' ? <span className="lost-tag">Lost</span> : <span className="muted">{phase === 'betting' ? '—' : 'In'}</span>;
  const rows: Array<{ key: string; name: string; you: boolean; bet: number; st: string; at?: number; win: number; route: RouteKey }> = [];
  slots.forEach((s, i) => { if (s.status !== 'none') rows.push({ key: 'me' + i, name: 'You (' + (i + 1) + ')', you: true, bet: s.amount, st: s.status, at: s.at, win: s.pay || 0, route }); });
  bots.forEach((b) => rows.push({ key: b.name, name: mask(b.name), you: false, bet: b.bet, st: b.status, at: b.at, win: b.status === 'cashed' ? r2(b.bet * b.at) : 0, route: b.route }));
  return (
    <div className="bets-body">
      <div className="bets-sum"><span><b>{total}</b> bets this round</span><span>Paid <b className="pos">{money(won)}</b></span></div>
      <div className="bets-head"><span>Player</span><span>Bet</span><span>×</span><span>Win</span></div>
      <ul className="bets-list">
        {rows.map((r) => (
          <li key={r.key} className={(r.you ? 'you ' : '') + (r.st === 'cashed' ? 'won' : '')}>
            <span className="who"><Avatar name={r.name} you={r.you} />{routeDot(r.route)}<span className="nm">{r.name}</span></span>
            <span className="num">{money(r.bet)}</span>
            <span>{cell(r.st, r.at)}</span>
            <span className="num">{r.win ? money(r.win) : ''}</span>
          </li>
        ))}
      </ul>
      <p className="note small">Other players are simulated for this demo.</p>
    </div>
  );
});

function MyBets({ bets }: { bets: MyBet[] }) {
  if (!bets.length) return <div className="bets-body"><p className="empty">Your settled bets from this session appear here, from every game.</p></div>;
  return (
    <div className="bets-body">
      <div className="bets-head"><span>Game</span><span>Bet</span><span>×</span><span>Win</span></div>
      <ul className="bets-list">
        {bets.map((b) => (
          <li key={b.id} className={b.at ? 'won' : ''}>
            <span className="who stack"><span className="nm">{b.game}</span><span className="muted tiny">#{b.round} · Bet {b.slot} · crashed {x2(b.result || 1)}</span></span>
            <span className="num">{money(b.amount)}</span>
            <span>{b.at ? <span className={'mpill sm ' + tier(b.at)}>{x2(b.at)}</span> : <span className="lost-tag">Lost</span>}</span>
            <span className="num">{b.at ? money(b.pay) : ''}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TopWins({ wins }: { wins: TopWin[] }) {
  if (!wins.length) return <div className="bets-body"><p className="empty">The biggest wins in this game appear here as rounds are played.</p></div>;
  return (
    <div className="bets-body">
      <div className="bets-head"><span>Player</span><span>Bet</span><span>×</span><span>Win</span></div>
      <ul className="bets-list">
        {wins.map((w, i) => (
          <li key={i} className={w.you ? 'you won' : 'won'}>
            <span className="who"><span className="rank">{i + 1}</span><Avatar name={w.name} you={w.you} /><span className="nm">{w.you ? 'You' : mask(w.name)}</span></span>
            <span className="num">{money(w.bet)}</span>
            <span><span className={'mpill sm ' + tier(w.at)}>{x2(w.at)}</span></span>
            <span className="num">{money(w.win)}</span>
          </li>
        ))}
      </ul>
      <p className="note small">This session only. Other players are simulated.</p>
    </div>
  );
}

/* ---------- fairness ---------- */
const Fairness = memo(function Fairness({ scene, round, prev, toast }: { scene: Scene; round: Snapshot['round']; prev: Round | null; toast: (m: string) => void }) {
  const [seed, setSeed] = useState(getClientSeed());
  const [verdict, setVerdict] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { setVerdict(null); }, [prev]);
  const applySeed = (v: string) => { const s = v.trim().slice(0, 64); if (!s) { setSeed(getClientSeed()); return; } setClientSeed(s); setSeed(s); toast('Your new client seed applies from the next round.'); };
  const copy = () => {
    const h = round.hash || '';
    try { navigator.clipboard.writeText(h).then(() => toast('Hash copied'), () => toast('Copy was blocked. Select the hash and copy it yourself.')); }
    catch { toast('Copy was blocked. Select the hash and copy it yourself.'); }
  };
  const o = prev?.out, R = scene.routes;
  const outText = !o ? '' : scene.dual && R ? R.L.name + ' ' + x2(o.L as number) + ', ' + R.R.name + ' ' + x2(o.R as number)
    : scene.fork && R ? ((o.trunk as number) < scene.fork ? 'Shared track ' + x2(o.trunk as number) + ' (before the split)' : R.L.name + ' ' + x2(o.L as number) + ', ' + R.R.name + ' ' + x2(o.R as number))
      : x2(o.trunk as number);
  return (
    <div className="fair">
      <p className="note">Every result is fixed before betting opens. You see a hash of the secret server seed now, and the seed itself after the round, so you can check nothing changed.</p>
      <dl>
        <dt>Round #{round.nonce} · server seed hash <button type="button" className="link" onClick={copy}>Copy</button></dt>
        <dd className="mono code">{round.hash || 'Generating…'}</dd>
        <dt><label htmlFor="clientSeed">Your client seed</label></dt>
        <dd className="seed-row">
          <input id="clientSeed" className="mono" value={seed} onChange={(e) => setSeed(e.target.value)} onBlur={(e) => applySeed(e.target.value)} />
          <button type="button" onClick={() => applySeed(CG.fair.randomSeed(8))}>New</button>
        </dd>
      </dl>
      {prev ? (
        <div className="prev">
          <h3>Previous round #{prev.nonce}</h3>
          <dl>
            <dt>Revealed server seed</dt><dd className="mono code">{prev.seed}</dd>
            <dt>Client seed</dt><dd className="mono code">{prev.client}</dd>
            <dt>Result</dt><dd>{outText}</dd>
          </dl>
          <button type="button" className="verify-btn" onClick={async () => {
            setVerdict({ ok: true, text: 'Checking…' });
            const ok = await verifyRound(scene, prev);
            setVerdict({ ok, text: ok ? 'Verified. The seed matches the published hash and every result recomputes exactly.' : 'Mismatch. These results do not match the published hash.' });
          }}><ShieldIcon /> Verify previous round</button>
          {verdict && <p className={'verdict ' + (verdict.ok ? 'pos' : 'neg')}>{verdict.text}</p>}
        </div>
      ) : <p className="note">Play one round and its revealed seed appears here to check.</p>}
      <p className="note small">Formula: r = HMAC-SHA256(server seed, client seed:nonce:path), crash = floor(97 / (1 − r)) / 100, so P(crash ≥ x) = 0.97 / x. For this demo the seeds are made in your browser; a live product keeps them on its server.</p>
    </div>
  );
});
