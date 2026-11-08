/* Synthesised sound: no audio files, everything is generated with Web Audio.
   Each game passes a profile (waveform, base pitch, brightness) for its engine hum. */

export interface SoundProfile { wave: OscillatorType; base: number; color: number; }

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private hum: { a: OscillatorNode; b: OscillatorNode; f: BiquadFilterNode; g: GainNode; base: number; color: number } | null = null;
  private listeners = new Set<() => void>();
  muted: boolean;

  constructor() {
    let m = false;
    try { m = localStorage.getItem('cg.muted') === '1'; } catch { /* ignore */ }
    this.muted = m;
  }
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getSnapshot = () => this.muted;

  /** Must be called from a user gesture before anything is audible. */
  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.55;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch { /* audio unavailable */ }
  }
  setMuted(m: boolean) {
    this.muted = m;
    try { localStorage.setItem('cg.muted', m ? '1' : '0'); } catch { /* ignore */ }
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.05);
    this.listeners.forEach((l) => l());
  }
  private ready() { return this.ctx && this.master && this.ctx.state === 'running' ? this.ctx : null; }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, when = 0, slideTo?: number) {
    const ctx = this.ready(); if (!ctx) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master!); o.start(t); o.stop(t + dur + 0.02);
  }
  private noise(dur: number, vol: number, from: number, to: number, type: BiquadFilterType = 'lowpass') {
    const ctx = this.ready(); if (!ctx) return;
    const len = Math.floor(ctx.sampleRate * dur), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), t = ctx.currentTime;
    src.buffer = buf; f.type = type; f.frequency.setValueAtTime(from, t); f.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master!); src.start(t);
  }

  tick(last: boolean) { this.tone(last ? 1320 : 880, 0.06, 'square', 0.05); }
  bet() { this.tone(520, 0.08, 'triangle', 0.12); this.tone(780, 0.1, 'triangle', 0.1, 0.06); }
  launch() { this.noise(0.7, 0.25, 300, 3000, 'bandpass'); this.tone(110, 0.5, 'sawtooth', 0.05, 0, 220); }
  cashout(big: boolean) {
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.14, i * 0.07));
    if (big) [1318, 1568, 2093].forEach((f, i) => this.tone(f, 0.3, 'sine', 0.1, 0.3 + i * 0.08));
    this.noise(0.25, 0.08, 6000, 9000, 'highpass');
  }
  crash() { this.noise(1.2, 0.5, 1800, 60); this.tone(140, 0.9, 'sine', 0.35, 0, 35); }
  milestone() { this.tone(1046, 0.12, 'sine', 0.06); }

  startHum(p: SoundProfile) {
    const ctx = this.ready(); if (!ctx || this.hum) return;
    const a = ctx.createOscillator(), b = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    a.type = p.wave; b.type = p.wave; a.frequency.value = p.base; b.frequency.value = p.base * 1.005; b.detune.value = 7;
    f.type = 'lowpass'; f.frequency.value = 300 + p.color * 400; f.Q.value = 4;
    g.gain.value = 0.0001; g.gain.exponentialRampToValueAtTime(0.035, ctx.currentTime + 0.4);
    a.connect(f); b.connect(f); f.connect(g); g.connect(this.master!);
    a.start(); b.start();
    this.hum = { a, b, f, g, base: p.base, color: p.color };
  }
  updateHum(m: number) {
    const ctx = this.ready(); if (!ctx || !this.hum) return;
    const k = Math.log(m), t = ctx.currentTime;
    this.hum.a.frequency.setTargetAtTime(this.hum.base * (1 + k * 0.55), t, 0.05);
    this.hum.b.frequency.setTargetAtTime(this.hum.base * 1.005 * (1 + k * 0.55), t, 0.05);
    this.hum.f.frequency.setTargetAtTime(300 + this.hum.color * 400 + k * 900, t, 0.05);
  }
  stopHum() {
    const ctx = this.ctx, h = this.hum; if (!ctx || !h) return;
    this.hum = null;
    h.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.08);
    h.a.stop(ctx.currentTime + 0.4); h.b.stop(ctx.currentTime + 0.4);
  }
}

export const sound = new SoundEngine();
