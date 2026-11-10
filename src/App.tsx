import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { CG } from './engine/core.js';
import { Lobby } from './components/Lobby';
import { GameView } from './components/GameView';
import { money } from './game/controller';
import { wallet } from './game/wallet';

/* A build with a single game skips the lobby and opens straight into that game. */
const SINGLE = CG.scenes.length === 1 ? CG.scenes[0] : null;

const fromHash = () => {
  if (SINGLE) return SINGLE.id;
  const id = (location.hash || '').slice(1);
  return CG.scenes.some((s) => s.id === id) ? id : null;
};

function Logo() {
  return (
    <svg className="logo" viewBox="0 0 44 44" aria-hidden="true">
      <defs>
        <linearGradient id="lg-nitro" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8cf5ff" /><stop offset="1" stopColor="#0a6cff" /></linearGradient>
        <clipPath id="lc-nitro"><circle cx="22" cy="22" r="21" /></clipPath>
      </defs>
      <circle cx="22" cy="22" r="21" fill="url(#lg-nitro)" />
      <g clipPath="url(#lc-nitro)">
        <path d="M18 24h8l16 22H2z" fill="#0b1224" />
        <path d="M21.3 27h1.4l.4 4h-2.2zM20.7 34h2.6l.6 7h-3.8z" fill="#fff" />
      </g>
      <path d="M26 4 13 21h7l-3 9 13-15h-7z" fill="#fff" stroke="#0b1224" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

function Coin() {
  return (
    <svg viewBox="0 0 28 28" aria-hidden="true">
      <circle cx="14" cy="14" r="13" fill="#22e6ff" />
      <circle cx="14" cy="14" r="10" fill="none" stroke="#0a6c86" strokeWidth="1.5" />
      <path d="M15.6 6.5 9 15h4.4l-1 6.5L19 13h-4.4z" fill="#07303d" />
    </svg>
  );
}

export function App() {
  const [gameId, setGameId] = useState<string | null>(fromHash);
  const { balance, stats } = useSyncExternalStore(wallet.subscribe, wallet.getSnapshot);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const timer = useRef<number>(0);
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);
  const lastBal = useRef(balance);
  const [historyHost, setHistoryHost] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (balance !== lastBal.current) { setFlash(balance > lastBal.current ? 'up' : 'down'); lastBal.current = balance; const t = window.setTimeout(() => setFlash(null), 700); return () => window.clearTimeout(t); }
  }, [balance]);

  const toast = useCallback((m: string) => {
    setToastMsg(m);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToastMsg(null), 3800);
  }, []);

  const open = useCallback((id: string | null) => {
    if (SINGLE) return;
    setGameId(id);
    try { history.replaceState(null, '', id ? '#' + id : location.pathname + location.search); } catch { /* ignore */ }
    window.scrollTo(0, 0);
  }, []);

  const scene = gameId ? CG.scenes.find((s) => s.id === gameId) ?? null : null;
  useEffect(() => {
    document.title = SINGLE ? SINGLE.name : scene ? scene.name + ' · Gold Fever Crash Collection' : 'Gold Fever Crash Collection';
  }, [scene]);

  const [wordA, ...wordB] = (SINGLE ? SINGLE.name : 'Gold Fever').split(' ');

  return (
    <div className={'app' + (scene ? ' in-game' : '')} style={scene ? { ['--acc' as string]: scene.accent } : undefined}>
      <header className="top">
        <a href="#" className="brand" onClick={(e) => { e.preventDefault(); open(null); }}>
          <Logo />
          <span className="word"><span>{SINGLE ? SINGLE.sub : 'Crash Collection'}</span><b>{wordA} <i>{wordB.join(' ')}</i></b></span>
        </a>
        {scene
          ? <div className="history" ref={setHistoryHost} aria-label="Recent rounds, newest first" />
          : <nav className="game-strip" aria-label="Games">
            <a href="#" className="gs-item on" onClick={(e) => { e.preventDefault(); open(null); }}>Lobby</a>
            {CG.scenes.map((s) => (
              <a key={s.id} href={'#' + s.id} className="gs-item" style={{ ['--acc' as string]: s.accent }}
                onClick={(e) => { e.preventDefault(); open(s.id); }}><i />{s.name}</a>
            ))}
          </nav>}
        <div className={'wallet' + (flash ? ' flash-' + flash : '')} title={'Session: ' + stats.rounds + ' bets, net ' + (stats.net >= 0 ? '+' : '−') + money(Math.abs(stats.net))}>
          <Coin />
          <div><span>Balance</span><strong>{money(balance)}</strong></div>
        </div>
      </header>

      {scene
        ? <GameView key={scene.id} scene={scene} toast={toast} toastMsg={toastMsg} historyHost={historyHost} />
        : <main className="shell"><Lobby onOpen={open} /></main>}

      {!scene && (
        <footer className="foot">
          <div className="shell foot-inner">
            <p>Demo credits have no cash value and can't be bought or withdrawn. Every game returns 97% of stakes over the long run, so expect to lose about 3% of what you bet.</p>
            <p className="muted">{'Gold Fever Crash Collection · ' + CG.scenes.length + ' games'} · build 4</p>
          </div>
        </footer>
      )}

      {!scene && <div className="toast" role="status" hidden={!toastMsg}>{toastMsg}</div>}
    </div>
  );
}
