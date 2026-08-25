// Category 5 - audio determinism.
//
// The studio renders through an AudioWorklet, which needs a browser. What runs here is the exact
// same code with the two AudioWorkletGlobalScope globals shimmed, so FlutePipesProcessor - the
// score scheduler, the register selection, the three-pipe mix - is driven sample for sample in
// Node. Every stochastic source is seeded, so a passage has one hash.

import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { WaveguideFlutePipe } from '../src/web/acoustics/waveguide.js';
import { WebPhysicalPipe } from '../src/web/acoustics/modal.js';
import { buildSongScore } from '../src/web/data/score.js';
import { computeFluteGeometry } from '../src/web/geometry/flute.js';
import type { FluteGeometry, ScoreNote } from '../src/web/types.js';
import { hashSamples, seededRng } from './helpers.js';

const SR = 44100;

// --- AudioWorkletGlobalScope shim ---------------------------------------------------------
// processor.ts reads the bare globals `sampleRate` and `AudioWorkletProcessor`. They are
// installed before the module is imported, which is why the import is dynamic.
class FakePort {
  onmessage: ((e: { data: unknown }) => void) | null = null;
  posted: unknown[] = [];
  postMessage(m: unknown): void { this.posted.push(m); }
}
class FakeAudioWorkletProcessor {
  port = new FakePort();
}

interface WorkletCtor {
  new(opts?: { processorOptions?: unknown }): {
    process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean;
  };
}
let FlutePipesProcessor: WorkletCtor;

beforeAll(async () => {
  const g = globalThis as unknown as Record<string, unknown>;
  g.sampleRate = SR;
  g.AudioWorkletProcessor = FakeAudioWorkletProcessor;
  const mod = await import('../src/web/audio/processor.js');
  FlutePipesProcessor = mod.FlutePipesProcessor as unknown as WorkletCtor;
});

// --- deterministic Math.random ------------------------------------------------------------
// WebPhysicalPipe calls Math.random() directly; it has no injectable generator, so the global
// is the only seam. WaveguideFlutePipe takes an rng, which is used instead where available.
const realRandom = Math.random;
function seedGlobalRandom(seed: number): void {
  const rng = seededRng(seed);
  Math.random = rng;
}
afterEach(() => { Math.random = realRandom; });

interface Stats { peak: number; rms: number; nan: number; }
function stats(samples: ArrayLike<number>): Stats {
  let peak = 0, sq = 0, nan = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i];
    if (!Number.isFinite(v)) { nan++; continue; }
    peak = Math.max(peak, Math.abs(v));
    sq += v * v;
  }
  return { peak, rms: Math.sqrt(sq / Math.max(1, samples.length)), nan };
}

/** Fixed passage: the flute's own song score, played through a bare WaveguideFlutePipe. */
function renderWaveguide(geom: FluteGeometry, score: ScoreNote[], seconds: number, seed: number): Float64Array {
  const pipe = new WaveguideFlutePipe(SR, geom.melody.bore, geom.melody.acousticLength, geom.melody.holes);
  pipe.wallThickness = geom.wall;
  pipe.rng = seededRng(seed);
  const total = score.reduce((m, n) => Math.max(m, (n.startTime || 0) + n.duration), 0);
  const n = Math.round(seconds * SR);
  const out = new Float64Array(n);
  let active: ScoreNote | null = null;
  for (let i = 0; i < n; i++) {
    const t = (i / SR) % Math.max(0.001, total);
    let top: ScoreNote | null = null;
    for (const s of score) if (t >= (s.startTime || 0) && t < (s.startTime || 0) + s.duration) top = s;
    if (top !== active) {
      if (top) {
        pipe.setFingering(top.holes);
        const interval = (((top.midi - geom.rootMidi) % 12) + 12) % 12;
        const octaves = Math.round((top.midi - geom.rootMidi - interval) / 12);
        pipe.setRegister(Math.pow(2, Math.max(0, Math.min(2, octaves))));
      }
      active = top;
    }
    out[i] = pipe.process(top ? 0.63 : 0.0);
  }
  return out;
}

/** The same passage through FlutePipesProcessor: three pipes, the scheduler, the stereo mix. */
function renderProcessor(geom: FluteGeometry, score: ScoreNote[], seconds: number, seed: number): { left: Float32Array; right: Float32Array } {
  seedGlobalRandom(seed);
  const proc = new FlutePipesProcessor({
    processorOptions: { geometry: geom, score, breath: [{ t: 0, v: 0.7 }, { t: 1, v: 0.62 }], slapGain: 0.65 }
  });
  const BLOCK = 128;
  const blocks = Math.ceil((seconds * SR) / BLOCK);
  const left = new Float32Array(blocks * BLOCK);
  const right = new Float32Array(blocks * BLOCK);
  for (let b = 0; b < blocks; b++) {
    const L = new Float32Array(BLOCK), R = new Float32Array(BLOCK);
    proc.process([], [[L, R]]);
    left.set(L, b * BLOCK);
    right.set(R, b * BLOCK);
  }
  return { left, right };
}

// Two instruments that genuinely differ. `native_american` and `minor_pentatonic` hold the same
// interval list, and both clamp to five holes at any count above five, so a pair drawn from them
// would hash identically and prove nothing. These two differ in register, scale and hole count.
const CASE_A = { root: 69, scale: 'hijaz', holes: 6, song: 'desert_caravan' };
const CASE_B = { root: 60, scale: 'dorian', holes: 6, song: 'greensleeves' };

describe('audio: WaveguideFlutePipe renders deterministically', () => {
  // Hashes of the CURRENT signal. A change here means the synthesised instrument changed.
  const PINNED: Record<string, string> = {
    'a4-hijaz-6': '2058dd64',
    'c4-dorian-6': '47d9af13'
  };

  for (const [key, cfg] of [['a4-hijaz-6', CASE_A], ['c4-dorian-6', CASE_B]] as const) {
    it(key, () => {
      const geom = computeFluteGeometry(cfg.root, cfg.scale, cfg.holes);
      const song = buildSongScore(cfg.song, cfg.root, cfg.scale, geom.numHoles);
      const a = renderWaveguide(geom, song.notes, 1.5, 12345);
      const b = renderWaveguide(geom, song.notes, 1.5, 12345);
      expect(hashSamples(a)).toBe(hashSamples(b));
      expect(hashSamples(a)).toBe(PINNED[key]);

      const s = stats(a);
      expect(s.nan, 'non-finite samples').toBe(0);
      expect(s.rms, 'the pipe is silent').toBeGreaterThan(1e-4);
      expect(s.peak, 'the pipe clips').toBeLessThanOrEqual(1.0);
    });
  }

  it('the two cases really are different instruments', () => {
    const gA = computeFluteGeometry(CASE_A.root, CASE_A.scale, CASE_A.holes);
    const gB = computeFluteGeometry(CASE_B.root, CASE_B.scale, CASE_B.holes);
    expect(gA.melody.acousticLength).not.toBeCloseTo(gB.melody.acousticLength, 1);
    expect(hashSamples(renderWaveguide(gA, buildSongScore(CASE_A.song, CASE_A.root, CASE_A.scale, gA.numHoles).notes, 1.5, 12345)))
      .not.toBe(hashSamples(renderWaveguide(gB, buildSongScore(CASE_B.song, CASE_B.root, CASE_B.scale, gB.numHoles).notes, 1.5, 12345)));
  });

  it('the seed is what makes it reproducible, not luck', () => {
    const geom = computeFluteGeometry(CASE_A.root, CASE_A.scale, CASE_A.holes);
    const song = buildSongScore(CASE_A.song, CASE_A.root, CASE_A.scale, geom.numHoles);
    expect(hashSamples(renderWaveguide(geom, song.notes, 0.5, 1)))
      .not.toBe(hashSamples(renderWaveguide(geom, song.notes, 0.5, 2)));
  });

  it('the fingering reaches the jet: two fingerings drive two different pitches', () => {
    // updateGeomFreq() sets the jet transit from the COMMANDED fingering. If it read the pads'
    // instantaneous position instead, the first note of a session would always be aimed at the
    // all-closed root, and these two renders would start identically.
    const geom = computeFluteGeometry(CASE_A.root, CASE_A.scale, CASE_A.holes);
    const n = geom.melody.holes.length;
    const allClosed: ScoreNote[] = [{ midi: geom.rootMidi, startTime: 0, duration: 1, holes: new Array(n).fill(true) }];
    const openThree: ScoreNote[] = [{
      midi: geom.melody.holes[2].midi, startTime: 0, duration: 1,
      holes: new Array(n).fill(true).map((v, i) => (i < 3 ? false : v))
    }];
    const closedPipe = new WaveguideFlutePipe(SR, geom.melody.bore, geom.melody.acousticLength, geom.melody.holes);
    closedPipe.wallThickness = geom.wall;
    closedPipe.setFingering(allClosed[0].holes);
    const openPipe = new WaveguideFlutePipe(SR, geom.melody.bore, geom.melody.acousticLength, geom.melody.holes);
    openPipe.wallThickness = geom.wall;
    openPipe.setFingering(openThree[0].holes);
    // The three-holes-open fingering sounds a higher pitch, so the jet has to be aimed higher.
    expect(openPipe.geomFreq).toBeGreaterThan(closedPipe.geomFreq * 1.05);
    expect(hashSamples(renderWaveguide(geom, allClosed, 0.4, 7)))
      .not.toBe(hashSamples(renderWaveguide(geom, openThree, 0.4, 7)));
  });
});

describe('audio: FlutePipesProcessor renders deterministically', () => {
  const PINNED: Record<string, { left: string; right: string }> = {
    'a4-hijaz-6': { left: 'aa6ecc42', right: '91e9dcc1' },
    'c4-dorian-6': { left: '4b555525', right: '901f688e' }
  };

  for (const [key, cfg] of [['a4-hijaz-6', CASE_A], ['c4-dorian-6', CASE_B]] as const) {
    it(key, () => {
      const geom = computeFluteGeometry(cfg.root, cfg.scale, cfg.holes);
      const song = buildSongScore(cfg.song, cfg.root, cfg.scale, geom.numHoles);
      const a = renderProcessor(geom, song.notes, 1.0, 999);
      const b = renderProcessor(geom, song.notes, 1.0, 999);
      expect(hashSamples(a.left)).toBe(hashSamples(b.left));
      expect(hashSamples(a.right)).toBe(hashSamples(b.right));
      expect({ left: hashSamples(a.left), right: hashSamples(a.right) }).toEqual(PINNED[key]);

      for (const [side, ch] of [['left', a.left], ['right', a.right]] as const) {
        const s = stats(ch);
        expect(s.nan, `${side} non-finite`).toBe(0);
        expect(s.rms, `${side} silent`).toBeGreaterThan(1e-4);
        expect(s.peak, `${side} clips`).toBeLessThanOrEqual(1.0);
      }
      // The two drones are panned oppositely, so the channels must not be identical.
      expect(hashSamples(a.left)).not.toBe(hashSamples(a.right));
    });
  }
});

describe('audio: WebPhysicalPipe renders deterministically', () => {
  const PINNED: Record<string, string> = {
    'a4-hijaz-6': '3faa1794',
    'c4-dorian-6': 'ea2683a7'
  };

  function renderModal(geom: FluteGeometry, score: ScoreNote[], seconds: number, seed: number): Float64Array {
    seedGlobalRandom(seed);
    const pipe = new WebPhysicalPipe(SR, geom.melody.bore, geom.melody.acousticLength);
    const total = score.reduce((m, n) => Math.max(m, (n.startTime || 0) + n.duration), 0);
    const n = Math.round(seconds * SR);
    const out = new Float64Array(n);
    let active: ScoreNote | null = null;
    for (let i = 0; i < n; i++) {
      const t = (i / SR) % Math.max(0.001, total);
      let top: ScoreNote | null = null;
      for (const s of score) if (t >= (s.startTime || 0) && t < (s.startTime || 0) + s.duration) top = s;
      if (top !== active) {
        if (top) { pipe.triggerKeySlap(0.7); pipe.setFreq(440.0 * Math.pow(2, (top.midi - 69) / 12)); }
        active = top;
      }
      out[i] = pipe.process(top ? 0.63 : 0.0);
    }
    return out;
  }

  for (const [key, cfg] of [['a4-hijaz-6', CASE_A], ['c4-dorian-6', CASE_B]] as const) {
    it(key, () => {
      const geom = computeFluteGeometry(cfg.root, cfg.scale, cfg.holes);
      const song = buildSongScore(cfg.song, cfg.root, cfg.scale, geom.numHoles);
      const a = renderModal(geom, song.notes, 1.0, 4242);
      const b = renderModal(geom, song.notes, 1.0, 4242);
      expect(hashSamples(a)).toBe(hashSamples(b));
      expect(hashSamples(a)).toBe(PINNED[key]);

      const s = stats(a);
      expect(s.nan).toBe(0);
      expect(s.rms).toBeGreaterThan(1e-4);
      // KNOWN DEFECT, left in place. The modal engine's raw output overshoots full scale on a
      // normal breath pressure (0.63); the waveguide engine on the same passage does not. It is
      // inaudible today only because connectFluteOutputChain() attenuates by 0.65 before the
      // destination, so nothing downstream reports it. Both bounds are live: the lower one goes
      // red if the overshoot is ever fixed, the upper one if it gets worse.
      expect(s.peak, 'no longer overshoots - remove this known-defect band').toBeGreaterThan(1.0);
      expect(s.peak, 'the overshoot has grown').toBeLessThan(1.35);
    });
  }
});
