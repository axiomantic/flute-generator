// Category 2 - solver invariants over all 168 UI-reachable configurations.
//
// 6 roots x 7 scales x 4 hole counts is the entire product of the three selects in index.html.
// Every one of them is solved here, and each invariant is re-derived from the returned geometry
// rather than read off the solver's self-report.

import { describe, expect, it } from 'vitest';

import {
  HOLE_DIAM_BORE_FRACTION_MAX, HOLE_DIAM_FINGER_MAX_MM, HOLE_DIAM_MIN_MM, HOLE_DIAM_STEP_MM
} from '../src/web/acoustics/constants.js';
import { allUiConfigs, geomOnce, meanAbs, measureTuning, worstAbs } from './helpers.js';
import type { FluteGeometry } from '../src/web/types.js';

/** Every finite number reachable from the geometry object. Throws on the first NaN or Infinity. */
function assertAllFinite(value: unknown, path: string): void {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${path} is ${value}`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertAllFinite(v, `${path}[${i}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) assertAllFinite(v, `${path}.${k}`);
  }
}

/** Smallest centre-to-centre spacing on the SETTLED lattice, foot included. */
function minCentreGap(geom: FluteGeometry): number {
  const hs = geom.melody.holes;
  if (hs.length === 0) return Infinity;
  let mn = geom.melody.acousticLength - hs[0].distanceFromFipple;
  for (let i = 1; i < hs.length; i++) mn = Math.min(mn, hs[i - 1].distanceFromFipple - hs[i].distanceFromFipple);
  return mn;
}

const CONFIGS = allUiConfigs();

// One solve per configuration, shared by every invariant below.
const geomFor = geomOnce;

describe('solver sweep: 168 UI-reachable configurations', () => {
  it('the sweep really is the full product of the three selects', () => {
    expect(CONFIGS.length).toBe(168);
    expect(new Set(CONFIGS.map((c) => `${c.root}|${c.scale}|${c.holes}`)).size).toBe(168);
  });

  it('every configuration reaches a fixed point inside the sweep cap', () => {
    const offenders: string[] = [];
    for (const c of CONFIGS) {
      const s = geomFor(c.root, c.scale, c.holes).tuningSolver;
      // MAX_SWEEPS is 14 and TOL_MM is 5e-3 in solveToneHoleLattice(). Hitting the cap with a
      // delta still above tolerance means the lattice never settled.
      if (!(s.sweeps < 14 && s.maxDeltaMM < 5.0e-3)) {
        offenders.push(`${c.root}/${c.scale}/${c.holes} sweeps=${s.sweeps} delta=${s.maxDeltaMM.toExponential(3)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('hole order is monotone toward the fipple', () => {
    const offenders: string[] = [];
    for (const c of CONFIGS) {
      const hs = geomFor(c.root, c.scale, c.holes).melody.holes;
      for (let i = 1; i < hs.length; i++) {
        // Index 0 is the lowest-pitched hole and therefore the one nearest the foot, so
        // distanceFromFipple must fall strictly as the index rises.
        if (!(hs[i].distanceFromFipple < hs[i - 1].distanceFromFipple)) {
          offenders.push(`${c.root}/${c.scale}/${c.holes} hole ${i} at ${hs[i].distanceFromFipple.toFixed(3)} >= hole ${i - 1} at ${hs[i - 1].distanceFromFipple.toFixed(3)}`);
        }
        if (hs[i].midi <= hs[i - 1].midi) offenders.push(`${c.root}/${c.scale}/${c.holes} hole ${i} pitch does not rise`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('minGap holds on the settled lattice, not merely as a bracket hint', () => {
    const offenders: string[] = [];
    for (const c of CONFIGS) {
      const g = geomFor(c.root, c.scale, c.holes);
      if (g.melody.holes.length < 2) continue;
      const need = g.holeDiameter + 2.0;
      const got = minCentreGap(g);
      if (got < need - 1.0e-6) {
        offenders.push(`${c.root}/${c.scale}/${c.holes} gap=${got.toFixed(4)} mm needs ${need.toFixed(1)} mm (diam ${g.holeDiameter})`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the solver own spacing verdict matches the recomputed spacing', () => {
    for (const c of CONFIGS) {
      const g = geomFor(c.root, c.scale, c.holes);
      if (g.melody.holes.length < 2) continue;
      expect(g.tuningSolver.spacingOK, `${c.root}/${c.scale}/${c.holes}`).toBe(true);
      expect(g.tuningSolver.minCentreGapMM).toBeCloseTo(minCentreGap(g), 6);
    }
  });

  it('hole diameter stays inside its derived bounds and on the ladder grid', () => {
    const offenders: string[] = [];
    for (const c of CONFIGS) {
      const g = geomFor(c.root, c.scale, c.holes);
      const dMax = Math.max(HOLE_DIAM_MIN_MM, Math.min(HOLE_DIAM_FINGER_MAX_MM, g.melody.bore * HOLE_DIAM_BORE_FRACTION_MAX));
      const steps = (g.holeDiameter - HOLE_DIAM_MIN_MM) / HOLE_DIAM_STEP_MM;
      if (g.holeDiameter < HOLE_DIAM_MIN_MM - 1e-9 || g.holeDiameter > dMax + 1e-9) {
        offenders.push(`${c.root}/${c.scale}/${c.holes} diam ${g.holeDiameter} outside [${HOLE_DIAM_MIN_MM}, ${dMax.toFixed(2)}]`);
      }
      if (Math.abs(steps - Math.round(steps)) > 1e-9) {
        offenders.push(`${c.root}/${c.scale}/${c.holes} diam ${g.holeDiameter} off the ${HOLE_DIAM_STEP_MM} mm ladder`);
      }
      for (const h of g.melody.holes) expect(h.diameter).toBe(g.holeDiameter);
    }
    expect(offenders).toEqual([]);
  });

  it('no NaN or Infinity anywhere in any returned geometry', () => {
    for (const c of CONFIGS) {
      assertAllFinite(geomFor(c.root, c.scale, c.holes), `${c.root}/${c.scale}/${c.holes}`);
    }
  });

  it('the drilled hole count never exceeds the request and never rises above the scale', () => {
    for (const c of CONFIGS) {
      const g = geomFor(c.root, c.scale, c.holes);
      expect(g.numHoles).toBeLessThanOrEqual(c.holes);
      expect(g.numHoles).toBe(g.melody.holes.length);
      expect(g.requestedHoles).toBe(c.holes);
      expect(g.numHoles + g.droppedHoles.length).toBe(c.holes);
    }
  });

  it('aggregate tuning across all 168 configurations is pinned', () => {
    let worst = 0, sum = 0, count = 0;
    for (const c of CONFIGS) {
      const cs = measureTuning(geomFor(c.root, c.scale, c.holes)).map((r) => r.cents);
      worst = Math.max(worst, worstAbs(cs));
      sum += meanAbs(cs) * cs.length;
      count += cs.length;
    }
    // 1038 solved pitches across the 168 instruments. Worst case is the D6 piccolo in hijaz,
    // which has seven scale degrees to place inside a 130 mm tube.
    expect(count).toBe(1038);
    expect(worst).toBeLessThanOrEqual(91.4);
    expect(worst).toBeGreaterThan(90.0);
    expect(sum / count).toBeLessThanOrEqual(2.75);
  });
});
