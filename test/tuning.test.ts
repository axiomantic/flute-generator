// Category 1 - tuning correctness.
//
// The question this file answers is not "did the solver converge" but "does the instrument the
// CAD is about to cut actually sound the pitches it was asked for". Every number asserted here
// is re-derived from the SHIPPED geometry object - drilled hole positions, drilled diameter,
// solved tube length - pushed back through the passive lattice statics. The solver's own
// `tuningSolver.residuals` are then compared against that independent derivation, so the two
// have to agree rather than one vouching for the other.

import { describe, expect, it } from 'vitest';

import { computeFluteGeometry } from '../src/web/geometry/flute.js';
import { midiToFreq, SCALES } from '../src/web/data/scales.js';
import { midiToHoles } from '../src/web/data/score.js';
import {
  bareTubeFundamental, cents, coveredForDegree, meanAbs, measureTuning,
  representativeUiConfigs, worstAbs
} from './helpers.js';

// ------------------------------------------------------------------------------------------
// The pinned tuning table.
//
// One row per representative configuration: the register root, the scale, the requested hole
// count, the count actually drilled after non-rising scale degrees are dropped, and the WORST
// and MEAN absolute cents deviation over every solved pitch of that instrument (the bell note
// plus one hole opened at a time).
//
// These are measurements of the CURRENT corrected behaviour, not targets. A row moving is a
// change in what gets built and must be a deliberate edit here.
const PINNED: [root: number, scale: string, holes: number, drilled: number, worst: number, mean: number][] = [
  [36, 'hijaz',            4, 4,  0.00, 0.00],
  [36, 'native_american',  5, 5,  0.00, 0.00],
  [36, 'minor_pentatonic', 6, 5,  0.00, 0.00],
  [36, 'major_pentatonic', 7, 5,  0.00, 0.00],
  [36, 'dorian',           4, 4,  0.00, 0.00],
  [36, 'major',            5, 5,  0.00, 0.00],
  [36, 'natural_minor',    6, 6,  0.00, 0.00],
  [50, 'hijaz',            5, 5,  0.00, 0.00],
  [50, 'native_american',  6, 5,  0.00, 0.00],
  [50, 'minor_pentatonic', 7, 5,  0.00, 0.00],
  [50, 'major_pentatonic', 4, 4,  0.00, 0.00],
  [50, 'dorian',           5, 5,  0.00, 0.00],
  [50, 'major',            6, 6,  0.00, 0.00],
  [50, 'natural_minor',    7, 7,  0.00, 0.00],
  [60, 'hijaz',            6, 6,  0.00, 0.00],
  [60, 'native_american',  7, 5,  0.00, 0.00],
  [60, 'minor_pentatonic', 4, 4,  0.00, 0.00],
  [60, 'major_pentatonic', 5, 5,  0.00, 0.00],
  [60, 'dorian',           6, 6,  0.00, 0.00],
  [60, 'major',            7, 7,  0.00, 0.00],
  [60, 'natural_minor',    4, 4,  0.00, 0.00],
  [69, 'hijaz',            7, 7, 12.35, 3.88],
  [69, 'native_american',  4, 4,  0.00, 0.00],
  [69, 'minor_pentatonic', 5, 5,  0.00, 0.00],
  [69, 'major_pentatonic', 6, 5,  0.00, 0.00],
  [69, 'dorian',           7, 7, 11.29, 2.49],
  [69, 'major',            4, 4,  0.00, 0.00],
  [69, 'natural_minor',    5, 5,  0.00, 0.00],
  [72, 'hijaz',            4, 4, 14.89, 5.83],
  [72, 'native_american',  5, 5,  0.00, 0.00],
  [72, 'minor_pentatonic', 6, 5,  0.00, 0.00],
  [72, 'major_pentatonic', 7, 5,  0.00, 0.00],
  [72, 'dorian',           4, 4,  4.38, 1.08],
  [72, 'major',            5, 5,  6.48, 2.13],
  [72, 'natural_minor',    6, 6, 13.43, 4.28],
  [86, 'hijaz',            5, 5, 62.53, 23.96],
  [86, 'native_american',  6, 5, 11.82, 1.98],
  [86, 'minor_pentatonic', 7, 5, 11.82, 1.98],
  [86, 'major_pentatonic', 4, 4,  0.00, 0.00],
  [86, 'dorian',           5, 5, 36.48, 9.44],
  [86, 'major',            6, 6, 69.33, 17.65],
  [86, 'natural_minor',    7, 7, 68.73, 23.76]
];

const CENTS_TOL = 0.05;

describe('tuning: solved geometry sounds the intended pitches', () => {
  it('covers exactly the representative configuration set', () => {
    const measured = representativeUiConfigs().map((c) => `${c.root}/${c.scale}/${c.holes}`);
    const pinned = PINNED.map((r) => `${r[0]}/${r[1]}/${r[2]}`);
    expect(pinned).toEqual(measured);
  });

  for (const [root, scale, holes, drilled, worst, mean] of PINNED) {
    it(`${root} ${scale} ${holes}h: worst ${worst.toFixed(2)}c / mean ${mean.toFixed(2)}c`, () => {
      const geom = computeFluteGeometry(root, scale, holes);
      expect(geom.melody.holes.length).toBe(drilled);

      const rows = measureTuning(geom);
      expect(rows.length).toBe(drilled + 1);
      for (const r of rows) {
        expect(Number.isFinite(r.soundingHz), `degree ${r.degree} produced no resonance`).toBe(true);
        expect(Number.isFinite(r.cents)).toBe(true);
      }

      const cs = rows.map((r) => r.cents);
      expect(worstAbs(cs)).toBeCloseTo(worst, 1);
      expect(meanAbs(cs)).toBeCloseTo(mean, 1);
      expect(worstAbs(cs)).toBeLessThanOrEqual(worst + CENTS_TOL);
      expect(meanAbs(cs)).toBeLessThanOrEqual(mean + CENTS_TOL);
    });
  }
});

describe('tuning: the solver report agrees with an independent derivation', () => {
  // Two derivations of the same quantity from different data. The solver reports the residual
  // it measured on its own settled lattice; measureTuning() rebuilds the lattice out of the
  // ToneHole[] the CAD generator reads and re-measures. A divergence means the object handed
  // downstream is not the object the solver graded.
  for (const c of representativeUiConfigs()) {
    it(`${c.root} ${c.scale} ${c.holes}h`, () => {
      const geom = computeFluteGeometry(c.root, c.scale, c.holes);
      const mine = worstAbs(measureTuning(geom).map((r) => r.cents));
      expect(mine).toBeCloseTo(geom.tuningSolver.maxResidualCents, 2);
    });
  }
});

describe('tuning: drone tubes are cut to the length their pitch needs', () => {
  // The two drone tubes carry no tone holes, so their length is a closed form in
  // END_CORR_COEFF with no solver in between to absorb a wrong coefficient. Their sounding
  // pitch is recomputed here from the Levine & Schwinger radiation correction that the
  // waveguide itself applies, which is independent of END_CORR_COEFF by construction.
  for (const c of representativeUiConfigs()) {
    it(`${c.root} ${c.scale} ${c.holes}h`, () => {
      const geom = computeFluteGeometry(c.root, c.scale, c.holes);
      for (const [name, tube] of [['drone1', geom.drone1], ['drone2', geom.drone2]] as const) {
        const f = bareTubeFundamental(tube.bore, tube.acousticLength);
        expect(f, `${name} has no resonance`).not.toBeNull();
        expect(Math.abs(cents(f as number, tube.frequency)), `${name} pitch`).toBeLessThan(0.5);
      }
    });
  }

  it('a drone tuned an octave below the root is still cut for its own pitch', () => {
    const geom = computeFluteGeometry(69, 'hijaz', 6, -12, 19);
    expect(geom.drone1.frequency).toBeCloseTo(midiToFreq(57), 6);
    expect(geom.drone2.frequency).toBeCloseTo(midiToFreq(88), 6);
    for (const tube of [geom.drone1, geom.drone2]) {
      const f = bareTubeFundamental(tube.bore, tube.acousticLength) as number;
      expect(Math.abs(cents(f, tube.frequency))).toBeLessThan(0.5);
    }
  });
});

describe('tuning: the fingering contract the audio scheduler uses', () => {
  // measureTuning() fingers scale degree d as "holes 0..d-1 open". midiToHoles() is what the
  // score and the worklet actually use. They must be the same set, or the instrument is solved
  // for one fingering and played with another.
  for (const c of representativeUiConfigs()) {
    it(`${c.root} ${c.scale} ${c.holes}h`, () => {
      const geom = computeFluteGeometry(c.root, c.scale, c.holes);
      const n = geom.melody.holes.length;
      for (let d = 1; d <= n; d++) {
        const hole = geom.melody.holes[d - 1];
        const fromScore = midiToHoles(hole.midi, geom.rootMidi, geom.scaleKey, n);
        if (hole.interval % 12 === 0) {
          // A hole a whole octave above the root is NOT addressable as a first-mode fingering:
          // its pitch class is the root's, so midiToHoles() returns the all-closed fingering
          // and the note is reached by overblowing instead. Documented, not asserted away.
          expect(fromScore).toEqual(new Array<boolean>(n).fill(true));
        } else {
          expect(fromScore, `degree ${d} (interval ${hole.interval})`).toEqual(coveredForDegree(n, d));
        }
      }
    });
  }
});

describe('tuning: scale tables are well formed', () => {
  for (const key of Object.keys(SCALES)) {
    it(key, () => {
      const iv = SCALES[key];
      expect(iv[0]).toBe(0);
      for (let i = 1; i < iv.length; i++) expect(iv[i], `${key}[${i}]`).toBeGreaterThan(iv[i - 1]);
    });
  }
});
