/* Types for the shared crash engine (core.js) */

export type RouteKey = 'L' | 'R';
export type Phase = 'betting' | 'running' | 'crashed';

export interface Route { name: string; color: string; }

export interface DualLane { m: number; dead: boolean; age: number; t0?: number; }

/** Everything a scene needs to draw one frame. */
export interface SceneState {
  phase: Phase;
  m: number;
  p: number;
  t: number;
  dt: number;
  time: number;
  countdown: number;
  crashAge: number;
  cashAt: number | null;
  route: RouteKey;
  routes?: Record<RouteKey, Route>;
  fork?: number;
  forkPassed: boolean;
  dual: Record<RouteKey, DualLane> | null;
}

export interface Scene {
  id: string;
  name: string;
  sub: string;
  accent: string;
  bg: string;
  blurb: string;
  mech: string;
  crashWord: string;
  /** One-liners shown under the multiplier after a crash; one is picked per round. */
  crashLines?: string[];
  cashWord: string;
  coin: string;
  tags?: Array<'split' | 'classic' | 'dual'>;
  sound?: { wave: OscillatorType; base: number; color: number };
  fork?: number;
  dual?: boolean;
  graph?: boolean;
  routes?: Record<RouteKey, Route>;
  gauge: (m: number) => string;
  init: (w: number, h: number) => unknown;
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number, S: SceneState, st: unknown) => void;
}

export interface Outcome { trunk: number | null; L?: number | null; R?: number | null; }

export interface Fair {
  EDGE: number;
  MAX: number;
  randomSeed(bytes?: number): string;
  sha256(str: string): Promise<string>;
  float(seed: string, msg: string): Promise<number>;
  crashFrom(r: number): number;
  routeFrom(r: number, fork: number): number;
  outcome(game: Scene, seed: string, client: string, nonce: number): Promise<Outcome>;
}

export const CG: {
  scenes: Scene[];
  register: (s: Scene) => void;
  K: number;
  fair: Fair;
  U: Record<string, any>;
};
