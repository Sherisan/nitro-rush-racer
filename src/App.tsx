import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { CG } from './engine/core.js';
import { Lobby } from './components/Lobby';
import { GameView } from './components/GameView';
import { money } from './game/controller';
import { wallet } from './game/wallet';
import { sound } from './game/audio';

/* A build with a single game skips the lobby and opens straight into that game. */
const SINGLE = CG.scenes.length === 1 ? CG.scenes[0] : null;

const fromHash = () => {
  if (SINGLE) return SINGLE.id;
  const id = (location.hash || '').slice(1);
  return CG.scenes.some((s) => s.id === id) ? id : null;
};

function Logo() {
  return (
    <svg className="logo-mark" width="34" height="34" viewBox="0 0 40 40" aria-hidden="true">
      <defs>
        <linearGradient id="lg-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff1b0" /><stop offset="0.45" stopColor="#f2b33d" /><stop offset="1" stopColor="#8a5a12" /></linearGradient>
      </defs>
      <path d="M20 2 36 11v18L20 38 4 29V11Z" fill="#1a140c" stroke="url(#lg-gold)" strokeWidth="2" />
      <path d="M11 27 19 13l4 7 3-4 4 11Z" fill="url(#lg-gold)" />
      <circle cx="27" cy="12" r="2.2" fill="#fff1b0" />
    </svg>
  );
}

function SoundToggle() {
  const muted = useSyncExternalStore(sound.subscribe, sound.getSnapshot);
  return (
    <button type="button" className="icon-btn" aria-pressed={!muted} aria-label={muted ? 'Turn sound on' : 'Turn sound off'} title={muted ? 'Sound off' : 'Sound on'}
      onClick={() => { sound.unlock(); sound.setMuted(!muted); }}>
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M4 9v6h4l5 4V5L8 9H4Z" />
        {muted ? <path stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="m16 9 5 6m0-6-5 6" /> : <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" />}
      </svg>
    </button>
  );
}

export function App() {
  const [gameId, setGameId] = useState<string | null>(fromHash);
  const { balance, stats } = useSyncExternalStore(wallet.subscribe, wallet.getSnapshot);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const timer = useRef<number>(0);
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);
  const lastBal = useRef(balance);

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

  return (
    <div className="app" style={scene ? { ['--acc' as string]: scene.accent } : undefined}>
      <header className="top">
        <div className="top-inner">
          <a href="#" className="brand" onClick={(e) => { e.preventDefault(); open(null); }}>
            <Logo />
            <span className="brand-text"><span className="brand-mark">{SINGLE ? SINGLE.name : 'Gold Fever'}</span><span className="brand-sub">{SINGLE ? SINGLE.sub : 'Crash Collection'}</span></span>
          </a>
          {SINGLE ? <span className="game-strip" /> : <nav className="game-strip" aria-label="Games">
            <a href="#" className={'gs-item' + (scene ? '' : ' on')} onClick={(e) => { e.preventDefault(); open(null); }}>Lobby</a>
            {CG.scenes.map((s) => (
              <a key={s.id} href={'#' + s.id} className={'gs-item' + (scene && scene.id === s.id ? ' on' : '')} style={{ ['--acc' as string]: s.accent }}
                onClick={(e) => { e.preventDefault(); open(s.id); }}><i />{s.name}</a>
            ))}
          </nav>}
          <div className="wallet">
            <SoundToggle />
            <div className={'balance' + (flash ? ' flash-' + flash : '')} title={'Session: ' + stats.rounds + ' bets, net ' + (stats.net >= 0 ? '+' : '−') + money(Math.abs(stats.net))}>
              <span className="bal-icon" aria-hidden="true">◆</span>
              <span className="bal-text"><span>Demo credits</span><b>{money(balance)}</b></span>
            </div>
            <button type="button" className="reset" onClick={() => { wallet.reset(); toast('Demo credits reset to 1,000.00'); }}>Reset</button>
          </div>
        </div>
      </header>

      <main className="shell">
        {scene ? <GameView key={scene.id} scene={scene} toast={toast} /> : <Lobby onOpen={open} />}
      </main>

      <footer className="foot">
        <div className="shell foot-inner">
          <p>Demo credits have no cash value and can't be bought or withdrawn. Every game returns 97% of stakes over the long run, so expect to lose about 3% of what you bet.</p>
          <p className="muted">{SINGLE ? SINGLE.name + ' · part of the Gold Fever Crash Collection' : 'Gold Fever Crash Collection · ' + CG.scenes.length + ' games'} · build 4</p>
        </div>
      </footer>

      <div className="toast" role="status" hidden={!toastMsg}>{toastMsg}</div>
    </div>
  );
}
