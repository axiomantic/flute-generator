import { WaveguideFlutePipe } from '../acoustics/waveguide.js';
import { createSeededRandom } from '../acoustics/random.js';
import type { FluteGeometry, ScoreNote, BreathPoint } from '../types.js';

/** processorOptions handed to the worklet at construction. */
export interface FluteProcessorOptions {
  geometry?: FluteGeometry;
  score?: ScoreNote[];
  breath?: BreathPoint[];
  slapGain?: number;
  /**
   * Seeds the breath-turbulence noise of all three pipes, making the render reproducible.
   * Omitted by live playback, which draws from Math.random().
   */
  seed?: number;
}

// Runs inside AudioWorkletGlobalScope. `sampleRate` and `AudioWorkletProcessor` are
// globals of that scope, not of the page.
export class FlutePipesProcessor extends AudioWorkletProcessor {
  score: ScoreNote[];
  breath: BreathPoint[];
  playTime: number;
  activeNote: ScoreNote | null;
  slapGain: number;
  reportCountdown: number;
  geom: FluteGeometry | null;
  /** null means every pipe draws from Math.random(). */
  seed: number | null;
  stopped = false;
  mel?: WaveguideFlutePipe;
  d1?: WaveguideFlutePipe;
  d2?: WaveguideFlutePipe;

  constructor(opts?: { processorOptions?: unknown }) {
    super();
    // processorOptions crosses a structured-clone boundary, so its shape is asserted once here
    // rather than trusted field by field.
    const o = ((opts && opts.processorOptions) || {}) as FluteProcessorOptions;
    this.score = [];
    this.breath = [{ t: 0.0, v: 0.7 }, { t: 1.0, v: 0.7 }];
    this.playTime = 0.0;
    this.activeNote = null;
    this.slapGain = 0.65;
    this.reportCountdown = 0;
    this.geom = null;
    this.seed = typeof o.seed === 'number' ? o.seed : null;
    this.applyGeometry(o.geometry);
    if (o.score) this.score = o.score;
    if (o.breath) this.breath = o.breath;
    if (typeof o.slapGain === 'number') this.setSlapGain(o.slapGain);
    this.port.onmessage = (e: MessageEvent) => {
      const m = e.data || {};
      if (m.type === 'geometry') this.applyGeometry(m.geometry);
      else if (m.type === 'score') this.score = m.score || [];
      else if (m.type === 'breath') this.breath = m.breath || this.breath;
      else if (m.type === 'slapGain') this.setSlapGain(m.value);
      else if (m.type === 'stop') this.stopped = true;
    };
  }

  setSlapGain(g: number): void {
    this.slapGain = g;
    if (this.mel) this.mel.keySlapGain = g;
    if (this.d1) this.d1.keySlapGain = g;
    if (this.d2) this.d2.keySlapGain = g;
  }

  applyGeometry(g: FluteGeometry | undefined | null): void {
    if (!g) return;
    this.geom = g;
    // The three pipes are created together and never independently, so testing all three
    // states that invariant rather than assuming it.
    if (!this.mel || !this.d1 || !this.d2) {
      this.mel = new WaveguideFlutePipe(sampleRate, g.melody.bore, g.melody.acousticLength, g.melody.holes);
      this.d1 = new WaveguideFlutePipe(sampleRate, g.drone1.bore, g.drone1.acousticLength, []);
      this.d2 = new WaveguideFlutePipe(sampleRate, g.drone2.bore, g.drone2.acousticLength, []);
      // Three streams, not one shared generator: the pipes are advanced in a fixed order per
      // sample, so a shared generator would still be reproducible, but each pipe's noise would
      // depend on how many pipes exist. Deriving a distinct seed per pipe keeps a pipe's stream
      // its own.
      if (this.seed !== null) {
        this.mel.rng = createSeededRandom(this.seed);
        this.d1.rng = createSeededRandom((this.seed ^ 0x9e3779b9) >>> 0);
        this.d2.rng = createSeededRandom((this.seed ^ 0x85ebca6b) >>> 0);
      }
      this.setSlapGain(this.slapGain);
    } else {
      this.mel.setGeometry(g.melody.bore, g.melody.acousticLength, g.melody.holes, g.wall);
      this.d1.setGeometry(g.drone1.bore, g.drone1.acousticLength, [], g.wall);
      this.d2.setGeometry(g.drone2.bore, g.drone2.acousticLength, [], g.wall);
    }
    this.mel.wallThickness = g.wall;
    // The drones have no tone holes, so their register is set from the interval they are
    // tuned to relative to their own bore length.
    this.d1.setRegister(1.0);
    this.d2.setRegister(1.0);
  }

  breathAt(tNorm: number): number {
    const b = this.breath;
    if (!b || b.length === 0) return 0.70;
    const t = Math.max(0, Math.min(1, tNorm));
    for (let i = 0; i < b.length - 1; i++) {
      if (t >= b[i].t && t <= b[i + 1].t) {
        const span = b[i + 1].t - b[i].t;
        const a = span > 0 ? (t - b[i].t) / span : 0;
        return b[i].v + a * (b[i + 1].v - b[i].v);
      }
    }
    return b[b.length - 1].v;
  }

  // Impact energy scales with how many pads actually travel. Mirrors keySlapImpactBetween().
  impactBetween(prev: ScoreNote | null, next: ScoreNote | null): number {
    if (!next) return 0.50;
    const p = prev && Array.isArray(prev.holes) ? prev.holes : null;
    const q = Array.isArray(next.holes) ? next.holes : null;
    if (!p || !q || p.length !== q.length || q.length === 0) return 0.85;
    let moved = 0;
    for (let i = 0; i < q.length; i++) if (p[i] !== q[i]) moved++;
    return 0.45 + 0.55 * Math.min(1.0, moved / q.length);
  }

  override process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0];
    const L = out[0], R = out[1] || out[0];
    const n = L.length;
    if (!this.mel || !this.d1 || !this.d2 || this.stopped) { L.fill(0); if (R !== L) R.fill(0); return !this.stopped; }

    let totalDur = 4.0;
    for (let i = 0; i < this.score.length; i++) {
      const e = (this.score[i].startTime || 0) + this.score[i].duration;
      if (e > totalDur) totalDur = e;
    }
    const dt = 1.0 / sampleRate;
    const root = this.geom ? this.geom.rootMidi : 69;

    for (let i = 0; i < n; i++) {
      this.playTime += dt;
      if (this.playTime >= totalDur) this.playTime = 0.0;

      let top = null;
      for (let s = 0; s < this.score.length; s++) {
        const st = this.score[s].startTime || 0;
        if (this.playTime >= st && this.playTime < st + this.score[s].duration) top = this.score[s];
      }

      if (top !== this.activeNote) {
        this.mel.triggerKeySlap(this.impactBetween(this.activeNote, top));
        if (top && Array.isArray(top.holes)) {
          this.mel.setFingering(top.holes);
          // The fingering only fixes the pitch class; the octave is reached by overblowing.
          // Register is the mode number the jet is driven to, taken from the written octave.
          const interval = ((top.midi - root) % 12 + 12) % 12;
          const octaves = Math.round((top.midi - root - interval) / 12);
          this.mel.setRegister(Math.pow(2, Math.max(0, Math.min(2, octaves))));
        }
        this.activeNote = top;
      }

      const breath = this.breathAt((this.playTime % totalDur) / totalDur);
      const sM = this.mel.process(top ? breath * 0.90 : 0.0);
      const sD1 = this.d1.process(breath * 0.75);
      const sD2 = this.d2.process(breath * 0.65);

      L[i] = (sD1 * 0.50 + sD2 * 0.25 + sM * 0.85) * 0.50;
      R[i] = (sD1 * 0.25 + sD2 * 0.50 + sM * 0.85) * 0.50;
    }

    this.reportCountdown -= n;
    if (this.reportCountdown <= 0) {
      this.reportCountdown = sampleRate * 0.03;
      this.port.postMessage({ type: 'time', playTime: this.playTime });
    }
    return true;
  }
}
