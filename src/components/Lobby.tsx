import { useEffect, useMemo, useRef, useState } from 'react';
import { CG } from '../engine/core.js';
import type { Scene } from '../engine/core.js';
import { Attract } from '../game/attract';
import { getHistory, x2 } from '../game/controller';

type Filter = 'all' | 'split' | 'classic' | 'dual';
const FILTERS: Array<[Filter, string]> = [['all', 'All games'], ['split', 'Split path'], ['classic', 'Classic'], ['dual', 'Two routes']];

function Tile({ scene, onOpen, index }: { scene: Scene; onOpen: (id: string) => void; index: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const att = useRef<Attract | null>(null);
  useEffect(() => {
    let cancelled = false;
    const c = ref.current; if (!c) return;
    const ready = document.fonts?.ready ?? Promise.resolve();
    // stagger the first paint so the lobby appears quickly
    const go = () => { if (cancelled) return; att.current = new Attract(c, scene); att.current.still(); };
    Promise.race([ready, new Promise((r) => setTimeout(r, 1200))]).then(() => setTimeout(go, index * 60));
    return () => { cancelled = true; att.current?.stop(); };
  }, [scene, index]);
  const hist = getHistory(scene.id).slice(0, 3);
  return (
    <a href={'#' + scene.id} className="tile" style={{ ['--acc' as string]: scene.accent }}
      onClick={(e) => { e.preventDefault(); onOpen(scene.id); }}
      onMouseEnter={() => att.current?.start()} onMouseLeave={() => att.current?.stop()}
      onFocus={() => att.current?.start()} onBlur={() => att.current?.stop()}>
      <div className="tile-art"><canvas ref={ref} width={640} height={360} aria-hidden="true" /></div>
      <div className="tile-shade" />
      <div className="tile-top">
        <span className="mech">{scene.mech}</span>
        {hist.length > 0 && <span className="tile-hist">{hist.map((h, i) => <b key={i} className={h.v >= 10 ? 'hi' : h.v >= 2 ? 'mid' : 'lo'}>{x2(h.v)}</b>)}</span>}
      </div>
      <div className="tile-body">
        <h3>{scene.name}</h3>
        <p>{scene.sub}</p>
      </div>
      <span className="tile-play" aria-hidden="true">Play</span>
    </a>
  );
}

function Feature({ onOpen }: { onOpen: (id: string) => void }) {
  const scene = CG.scenes[0];
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1), rect = c.getBoundingClientRect();
    c.width = Math.round(rect.width * dpr); c.height = Math.round(rect.height * dpr);
    const a = new Attract(c, scene);
    a.start();
    return () => a.stop();
  }, [scene]);
  return (
    <div className="feature-stage" style={{ ['--acc' as string]: scene.accent }}>
      <canvas ref={ref} aria-hidden="true" />
      <div className="feature-tag"><span className="live-dot" />Featured · {scene.name}</div>
      <button type="button" className="feature-cta" onClick={() => onOpen(scene.id)}>Play {scene.name}</button>
    </div>
  );
}

export function Lobby({ onOpen }: { onOpen: (id: string) => void }) {
  const [filter, setFilter] = useState<Filter>(() => { try { return (localStorage.getItem('cg.filter') as Filter) || 'all'; } catch { return 'all'; } });
  const scenes = CG.scenes;
  const shown = useMemo(() => scenes.filter((s) => filter === 'all' || (s.tags || []).includes(filter)), [scenes, filter]);
  const count = (f: Filter) => (f === 'all' ? scenes.length : scenes.filter((s) => (s.tags || []).includes(f)).length);
  const pick = (f: Filter) => { setFilter(f); try { localStorage.setItem('cg.filter', f); } catch { /* ignore */ } };
  return (
    <section className="lobby">
      <div className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Crash games · demo credits</p>
          <h1>Twelve worlds. Every one of them can crash.</h1>
          <p className="lede">Mine carts, jets, submarines and runaway trains all ride the same rising multiplier. Cash out before the crash, or pick the safer tunnel in the split-path games.</p>
          <div className="hero-actions">
            <button type="button" className="btn-primary" onClick={() => onOpen(scenes[0].id)}>Play {scenes[0].name}</button>
            <a className="btn-ghost" href="#games" onClick={(e) => { e.preventDefault(); document.getElementById('games')?.scrollIntoView({ behavior: 'smooth' }); }}>Browse all {scenes.length}</a>
          </div>
          <dl className="facts">
            <div><dt>Return to player</dt><dd>97%</dd></div>
            <div><dt>Top multiplier</dt><dd>10,000×</dd></div>
            <div><dt>Every result</dt><dd>Verifiable</dd></div>
          </dl>
        </div>
        <Feature onOpen={onOpen} />
      </div>

      <div className="lobby-bar" id="games">
        <h2>All games</h2>
        <div className="filters" role="tablist" aria-label="Filter games">
          {FILTERS.map(([f, label]) => (
            <button key={f} type="button" role="tab" aria-selected={filter === f} className={'filter' + (filter === f ? ' on' : '')} onClick={() => pick(f)}>
              {label}<span>{count(f)}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="tiles">
        {shown.map((sc, i) => <Tile key={sc.id} scene={sc} onOpen={onOpen} index={i} />)}
      </div>
    </section>
  );
}
