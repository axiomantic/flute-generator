// Category 3 - geometry invariants, and the agreement between computeSmartJointCuts() and the
// cut planes the SCAD body is actually sliced at.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { generateScadJs } from '../src/web/cad/scad.js';
import { computeFluteGeometry, computeSmartJointCuts } from '../src/web/geometry/flute.js';
import { SCALES } from '../src/web/data/scales.js';
import { allUiConfigs, geomOnce, representativeUiConfigs } from './helpers.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Reads the three z_cut assignments out of a generated SCAD program. */
function scadCutPlanes(scad: string): { zCut1: number; zCut2: number; zCut3: number } {
  const read = (name: string): number => {
    const m = new RegExp(`^${name} = (-?[0-9.]+);$`, 'm').exec(scad);
    if (!m) throw new Error(`${name} not found in the generated SCAD`);
    return parseFloat(m[1]);
  };
  return { zCut1: read('z_cut1'), zCut2: read('z_cut2'), zCut3: read('z_cut3') };
}

describe('geometry: hole table', () => {
  it('intervals are strictly increasing on every UI-reachable configuration', () => {
    const offenders: string[] = [];
    for (const c of allUiConfigs()) {
      const g = geomOnce(c.root, c.scale, c.holes);
      for (let i = 1; i < g.melody.holes.length; i++) {
        if (g.melody.holes[i].interval <= g.melody.holes[i - 1].interval) {
          offenders.push(`${c.root}/${c.scale}/${c.holes} interval ${g.melody.holes[i].interval} after ${g.melody.holes[i - 1].interval}`);
        }
      }
      // Every drilled interval has to come from the scale table itself; the old fallback that
      // synthesised one is what produced repeats.
      const table = SCALES[c.scale];
      for (const h of g.melody.holes) expect(table, `${c.root}/${c.scale}/${c.holes}`).toContain(h.interval);
    }
    expect(offenders).toEqual([]);
  });

  it('no two holes share a position or a pitch', () => {
    const offenders: string[] = [];
    for (const c of allUiConfigs()) {
      const g = geomOnce(c.root, c.scale, c.holes);
      const zs = g.melody.holes.map((h) => h.z.toFixed(6));
      const midis = g.melody.holes.map((h) => h.midi);
      if (new Set(zs).size !== zs.length) offenders.push(`${c.root}/${c.scale}/${c.holes} duplicate z: ${zs.join(', ')}`);
      if (new Set(midis).size !== midis.length) offenders.push(`${c.root}/${c.scale}/${c.holes} duplicate midi: ${midis.join(', ')}`);
    }
    expect(offenders).toEqual([]);
  });

  it('every hole sits inside the melody tube', () => {
    for (const c of allUiConfigs()) {
      const g = geomOnce(c.root, c.scale, c.holes);
      for (const h of g.melody.holes) {
        expect(h.distanceFromFipple).toBeGreaterThan(0);
        expect(h.distanceFromFipple).toBeLessThan(g.melody.acousticLength);
        expect(h.z).toBeCloseTo(g.fippleZ - h.distanceFromFipple, 9);
      }
    }
  });

  it('the body is long enough for the longest of the three tubes', () => {
    for (const d1 of [-12, -5, 0, 7, 12]) for (const d2 of [-12, 0, 7, 19]) {
      const g = computeFluteGeometry(69, 'hijaz', 6, d1, d2);
      const longest = Math.max(g.melody.acousticLength, g.drone1.acousticLength, g.drone2.acousticLength);
      expect(g.bodyLength, `d1=${d1} d2=${d2}`).toBeCloseTo(longest + 30.0, 9);
      expect(g.totalLength).toBeCloseTo(g.bodyLength + g.headLength, 9);
    }
  });
});

describe('geometry: computeSmartJointCuts agrees with the SCAD cut planes', () => {
  // The two used to be independent derivations, and they disagreed whenever a drone tube was
  // longer than the melody tube - which is exactly what a negative drone interval produces.
  // Both negative options the studio offers are covered here.
  const DRONE1 = [-12, -5, 0, 7, 12];
  const DRONE2 = [-12, 0, 7, 19];

  for (const segments of [2, 3, 4]) {
    for (const d1 of DRONE1) {
      for (const d2 of DRONE2) {
        it(`${segments} segments, drone1 ${d1}, drone2 ${d2}`, () => {
          const args = { root: 69, scale: 'hijaz', holes: 6, chim: 2.8, rim: 3.3, jointLen: 14.0 };
          const scad = generateScadJs(
            args.root, args.scale, args.holes, 'sac', args.chim, args.rim,
            segments, 'assembled', 0.18, args.jointLen, d1, d2, 'staggered', 'none', 'tpu'
          );
          const fromScad = scadCutPlanes(scad);
          const fromJs = computeSmartJointCuts(
            args.root, args.scale, args.holes, segments, args.jointLen, d1, d2, args.chim, args.rim
          );
          expect(+fromJs.zCut1.toFixed(2)).toBe(fromScad.zCut1);
          expect(+fromJs.zCut2.toFixed(2)).toBe(fromScad.zCut2);
          expect(+fromJs.zCut3.toFixed(2)).toBe(fromScad.zCut3);
        });
      }
    }
  }

  it('a longer drone really does move the cut planes (the case that used to diverge)', () => {
    // A blind control would compare two configurations whose geometry is identical. These two
    // are not: drone1 at -12 makes the body longer than the melody tube alone, and the cut
    // planes are a fraction of total length, so they must move.
    const cutsUnison = computeSmartJointCuts(69, 'hijaz', 6, 3, 14.0, 0, 7);
    const cutsSubBass = computeSmartJointCuts(69, 'hijaz', 6, 3, 14.0, -12, 7);
    expect(cutsSubBass.zCut1).not.toBeCloseTo(cutsUnison.zCut1, 2);
    const geomUnison = computeFluteGeometry(69, 'hijaz', 6, 0, 7);
    const geomSubBass = computeFluteGeometry(69, 'hijaz', 6, -12, 7);
    expect(geomSubBass.totalLength).toBeGreaterThan(geomUnison.totalLength + 50);
  });

  it('cut planes clear the fipple window and every tone hole', () => {
    for (const segments of [2, 3, 4]) {
      for (const c of representativeUiConfigs().slice(0, 14)) {
        const jointLen = 14.0;
        const g = geomOnce(c.root, c.scale, c.holes);
        const cuts = computeSmartJointCuts(c.root, c.scale, c.holes, segments, jointLen);
        const planes = [cuts.zCut1];
        if (segments >= 3) planes.push(cuts.zCut2);
        if (segments >= 4) planes.push(cuts.zCut3);
        for (const z of planes) {
          // findSafeCutZ() clamps into [jointLen + 4, fippleZ - jointLen - 8]; a plane outside
          // that window would put a socket through the beak or off the foot.
          expect(z, `${c.root}/${c.scale}/${c.holes} seg${segments}`).toBeGreaterThanOrEqual(jointLen + 4 - 1e-9);
          expect(z).toBeLessThanOrEqual(g.fippleZ - jointLen - 8 + 1e-9);
        }
      }
    }
  });
});

describe('geometry: the studio controls that feed it', () => {
  const html = readFileSync(path.join(ROOT, 'index.html'), 'utf8');

  it('every range slider default sits exactly on its own step grid', () => {
    // rimThickness once defaulted to a value its slider could not reach, so the studio and a
    // freshly generated instrument disagreed the moment anyone touched the control.
    const offenders: string[] = [];
    const re = /<input\b[^>]*type="range"[^>]*>/g;
    let m: RegExpExecArray | null;
    let seen = 0;
    while ((m = re.exec(html)) !== null) {
      const tag = m[0];
      const attr = (name: string): number | null => {
        const a = new RegExp(`\\b${name}="([-0-9.]+)"`).exec(tag);
        return a ? parseFloat(a[1]) : null;
      };
      const id = /\bid="([^"]+)"/.exec(tag)?.[1] ?? '(no id)';
      const min = attr('min'), step = attr('step'), value = attr('value');
      if (min === null || step === null || value === null) { offenders.push(`${id} is missing min/step/value`); continue; }
      seen++;
      const steps = (value - min) / step;
      if (Math.abs(steps - Math.round(steps)) > 1e-6) {
        offenders.push(`${id}: value ${value} is ${steps.toFixed(4)} steps of ${step} above min ${min}`);
      }
    }
    expect(seen).toBeGreaterThan(4);
    expect(offenders).toEqual([]);
  });

  it('the scale select offers exactly the scales the table defines', () => {
    const block = /<select id="sel-scale">([\s\S]*?)<\/select>/.exec(html);
    expect(block).not.toBeNull();
    const values = Array.from((block as RegExpExecArray)[1].matchAll(/value="([^"]+)"/g)).map((x) => x[1]);
    expect(values.slice().sort()).toEqual(Object.keys(SCALES).slice().sort());
  });
});
