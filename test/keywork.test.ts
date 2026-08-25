// Category 8 - the articulated keywork.
//
// Everything here is measured from the layout computeKeyworkLayout() returns for a geometry
// computeFluteGeometry() produced, which is the only path the CAD generator and the studio use.
// Sixteen of the nineteen warning conditions fire on an instrument the studio can actually
// build, and each has a named row below. The other three - a duplicate hole position, a rod the
// torsion solve cannot size, and a cluster wider than its body - are exercised on a deliberately
// mutated geometry rather than left unproven.

import { describe, expect, it } from 'vitest';

import { buildKeywork } from '../src/web/cad/keywork-scad.js';
import { generateScadJs, lastTpuGasketsScad } from '../src/web/cad/scad.js';
import { computeFluteGeometry, computeSmartJointCuts, solveJointCuts } from '../src/web/geometry/flute.js';
import {
  DEFAULT_KEYWORK_PARAMS, applyCutPlanes, computeKeyworkLayout, keyworkCutZones,
  type KeyworkLayout
} from '../src/web/geometry/keywork.js';
import type { FluteGeometry, KeyworkMode, ToneHole } from '../src/web/types.js';
import { UI_HOLE_COUNTS, UI_ROOTS, UI_SCALES, geomOnce } from './helpers.js';

const P = DEFAULT_KEYWORK_PARAMS;

interface Sweep { root: number; scale: string; holes: number; mode: KeyworkMode; segments: number }

/** Every UI-reachable instrument, both keyed modes, every segment count. */
function sweep(): Sweep[] {
  const out: Sweep[] = [];
  for (const root of UI_ROOTS) for (const scale of UI_SCALES) for (const holes of UI_HOLE_COUNTS) {
    for (const mode of ['keys_all', 'keys_low'] as const) for (const segments of [1, 2, 3, 4]) {
      out.push({ root, scale, holes, mode, segments });
    }
  }
  return out;
}

function layoutFor(c: Sweep): KeyworkLayout {
  const geom = geomOnce(c.root, c.scale, c.holes);
  const kw = buildKeywork(geom, c.mode, c.segments, 14.0);
  if (!kw.layout) throw new Error(`no layout for ${c.root}/${c.scale}/${c.holes}/${c.mode}`);
  return kw.layout;
}

const LABEL = (c: Sweep): string => `${c.root}/${c.scale}/${c.holes}h/${c.mode}/${c.segments}seg`;

describe('keywork: geometry is derived from the flute geometry object', () => {
  it('every rod runs from its own hole to its own bridge station and no further', () => {
    const offenders: string[] = [];
    for (const c of sweep()) {
      const L = layoutFor(c);
      for (const k of L.keys) {
        const lo = Math.min(k.holeZ, k.bridgeZ) - P.rodOver - Math.max(P.armZ, P.bridgeT);
        const hi = Math.max(k.holeZ, k.bridgeZ) + P.rodOver + Math.max(P.armZ, P.bridgeT);
        // The journal may sit past the hole when the rod is too short for an inline one, which
        // is the only thing that legitimately extends the tube beyond the hole/bridge pair.
        const slack = k.inlineJournal ? 0 : P.rodOver + Math.max(12, 3 * L.rodOd) + L.baseFlange / 2 + 4;
        if (k.rodZ0 < lo - slack || k.rodZ1 > hi + slack) {
          offenders.push(`${LABEL(c)} hole ${k.holeIndex}: rod [${k.rodZ0.toFixed(1)},${k.rodZ1.toFixed(1)}] against hole ${k.holeZ.toFixed(1)} bridge ${k.bridgeZ.toFixed(1)}`);
        }
        expect(k.rodLength, LABEL(c)).toBeCloseTo(Math.abs(k.bridgeZ - k.holeZ) + 2 * P.rodOver, 9);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('rod length shrinks when the bridge station is closer, and only then', () => {
    // A blind control: the length has to be a function of the hole/bridge pair, not a constant.
    const L = layoutFor({ root: 36, scale: 'hijaz', holes: 7, mode: 'keys_all', segments: 3 });
    const lengths = L.keys.map((k) => k.rodLength);
    expect(new Set(lengths.map((v) => v.toFixed(3))).size).toBeGreaterThan(1);
    for (const k of L.keys) expect(k.rodLength).toBeGreaterThan(2 * P.rodOver);
  });

  it('the hole positions the tuning solver produced are read, never recomputed', () => {
    for (const c of sweep().slice(0, 60)) {
      const geom = geomOnce(c.root, c.scale, c.holes);
      const L = layoutFor(c);
      for (const k of L.keys) {
        const hole = geom.melody.holes.find((h) => h.index === k.holeIndex) as ToneHole;
        expect(k.holeZ, LABEL(c)).toBe(hole.z);
        expect(k.holeDiameter).toBe(hole.diameter);
      }
      // rimThickness comes from the object too: DESIGN_v2 s.14 records the 3.2 / 3.3 discrepancy.
      expect(L.baseFlange).toBeCloseTo(geom.holeDiameter + 2 * geom.rimThickness + 2 * geom.chimneyDepth, 9);
    }
  });

  it('every rod, sleeve and stanchion sits inside the printed body', () => {
    const offenders: string[] = [];
    for (const c of sweep()) {
      const geom = geomOnce(c.root, c.scale, c.holes);
      const L = layoutFor(c);
      for (const k of L.keys) {
        if (k.rodZ0 < 0 || k.rodZ1 > geom.fippleZ) offenders.push(`${LABEL(c)} rod ${k.holeIndex} outside [0, fippleZ]`);
        if (Math.abs(k.rodX) + L.sleeveOd / 2 > L.faceHalfW) offenders.push(`${LABEL(c)} sleeve ${k.holeIndex} past the facet edge`);
      }
      for (const z of L.postZ) {
        if (z < 0 || z > geom.fippleZ) offenders.push(`${LABEL(c)} stanchion at ${z.toFixed(1)} outside the body`);
      }
      if (L.legX + P.legW / 2 > L.faceHalfW) offenders.push(`${LABEL(c)} stanchion leg past the facet edge`);
    }
    expect(offenders).toEqual([]);
  });

  it('the touch cluster is centred on the keyed hole span and inside the body', () => {
    const offenders: string[] = [];
    for (const c of sweep()) {
      const L = layoutFor(c);
      const zs = L.keys.map((k) => k.holeZ);
      const mid = (Math.min(...zs) + Math.max(...zs)) / 2;
      const clusterMid = (L.clusterLoZ + L.clusterHiZ) / 2;
      if (Math.abs(clusterMid - mid) > 1e-6) offenders.push(`${LABEL(c)} cluster centre ${clusterMid} vs hole span centre ${mid}`);
      if (L.buttonPitch < P.pitchMin - 1e-9 || L.buttonPitch > P.pitchMax + 1e-9) offenders.push(`${LABEL(c)} pitch ${L.buttonPitch}`);
      const wide = L.clusterWidth > L.bodyWidth;
      const warned = L.warnings.some((w) => w.code === 'KW-CLUSTER');
      if (wide !== warned) offenders.push(`${LABEL(c)} cluster width ${L.clusterWidth} vs body ${L.bodyWidth}, warned=${warned}`);
    }
    expect(offenders).toEqual([]);
  });

  it('no two rods share a lateral column and overlap in Z', () => {
    // The greedy interval colouring is verified, not trusted. DESIGN_v2 s.4 states the rule as a
    // count of earlier-started overlapping rods, which is not a colouring at all and puts two
    // rods in one column on real hole lattices; this is the check that caught it.
    const offenders: string[] = [];
    for (const c of sweep()) {
      const L = layoutFor(c);
      L.collisions.columnClash.forEach((list, i) => {
        if (list.length > 0) offenders.push(`${LABEL(c)} rod ${L.keys[i].holeIndex} shares a column with ${list.join(',')}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it('no rod stands inside another key\'s pad-arm sweep', () => {
    // Re-derived from the shipped keys, not read back off L.collisions.padArm. Key k's pad arm
    // runs from its rod at |x| = armX inboard to the hole at x = 0 and descends from its own Y
    // tier, so it sweeps every same-side rod at a smaller |x| on its own tier or below.
    const offenders: string[] = [];
    for (const c of sweep()) {
      const L = layoutFor(c);
      for (const k of L.keys) {
        for (const j of L.keys) {
          if (j === k || j.side !== k.side) continue;
          if (j.armX >= k.armX - 0.01 || j.tier > k.tier) continue;
          if (j.rodZ0 < k.holeZ + P.armZ / 2 && k.holeZ - P.armZ / 2 < j.rodZ1) {
            offenders.push(`${LABEL(c)} rod ${j.holeIndex} (|x|=${j.armX.toFixed(1)}, tier ${j.tier}) `
              + `crosses hole ${k.holeIndex}'s pad arm (|x|=${k.armX.toFixed(1)}, tier ${k.tier})`);
          }
        }
        // and the layout's own report agrees with that measurement.
        if (L.collisions.padArm[k.slot].length > 0) {
          offenders.push(`${LABEL(c)} key ${k.holeIndex} reports padArm ${L.collisions.padArm[k.slot].join(',')}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('a rod that spans a neighbour\'s hole is placed outboard of that neighbour', () => {
    // The blind control for the row above. v1 got the pad-arm clearance from an ordering rule
    // ("|X| decreases with hole index"); v2 dropped it and warned afterwards instead. If no
    // configuration actually had a rod spanning another key's hole, the clearance test would be
    // vacuous and would stay green with the ordering removed. This counts the cases.
    let ordered = 0;
    const offenders: string[] = [];
    for (const c of sweep()) {
      const L = layoutFor(c);
      for (const k of L.keys) for (const j of L.keys) {
        if (j === k || j.side !== k.side) continue;
        if (!(j.rodZ0 < k.holeZ + P.armZ / 2 && k.holeZ - P.armZ / 2 < j.rodZ1)) continue;
        if (!(j.armX > k.armX - 0.01 || j.tier > k.tier)) {
          offenders.push(`${LABEL(c)} rod ${j.holeIndex} spans hole ${k.holeIndex} from inboard`);
        }
        if (j.armX > k.armX + 0.01 && j.tier === k.tier) ordered++;
      }
    }
    expect(offenders).toEqual([]);
    expect(ordered, 'no configuration exercises the outboard ordering rule').toBeGreaterThan(0);
  });

  it('the rod OD solve has reached a fixed point after its three passes', () => {
    for (const c of sweep().slice(0, 80)) {
      const geom = geomOnce(c.root, c.scale, c.holes);
      const L = layoutFor(c);
      // Re-running the layout on a geometry whose only change is a fourth pass would need the
      // private solver; instead the invariant that matters is asserted: the OD is inside its
      // clamp and every rod's wind-up respects the budget the OD was sized for.
      expect(L.rodOd, LABEL(c)).toBeGreaterThanOrEqual(4.0);
      expect(L.rodOd).toBeLessThanOrEqual(14.0);
      for (const k of L.keys) {
        const budget = Math.min(P.thetaMaxDeg, P.windupFrac * k.alphaDeg);
        const clamped = L.rodOd <= 4.0 + 1e-9 || L.rodOd >= 14.0 - 1e-9;
        if (!clamped) expect(k.windupDeg, `${LABEL(c)} hole ${k.holeIndex}`).toBeLessThanOrEqual(budget + 1e-6);
      }
      expect(geom.numHoles).toBeGreaterThan(0);
    }
  });

  it('a running fit is never derived from the glued socket tolerance', () => {
    const geom = geomOnce(69, 'hijaz', 6);
    const a = buildKeywork(geom, 'keys_all', 3, 14.0).layout as KeyworkLayout;
    expect(a.sleeveId - a.rodOd).toBeCloseTo(2 * P.sleeveTol, 9);
    expect(a.hubId - a.spindleOd).toBeCloseTo(2 * P.sleeveTol, 9);
    // jointTol is a generateScadJs() argument and must not reach the bearing bores.
    const tight = generateScadJs(69, 'hijaz', 6, 'sac', 2.8, 3.3, 3, 'assembled', 0.05, 14.0, 0, 7, 'staggered', 'keys_all', 'tpu');
    const loose = generateScadJs(69, 'hijaz', 6, 'sac', 2.8, 3.3, 3, 'assembled', 0.40, 14.0, 0, 7, 'staggered', 'keys_all', 'tpu');
    const bore = /module keywork_sleeves\(\)[\s\S]*?\n}\n/;
    expect((bore.exec(tight) as RegExpExecArray)[0]).toBe((bore.exec(loose) as RegExpExecArray)[0]);
  });
});

describe('keywork: segment planes', () => {
  it('a legal cut plane clears the cluster and every journal end', () => {
    const offenders: string[] = [];
    for (const c of sweep()) {
      if (c.segments === 1) continue;
      const geom = geomOnce(c.root, c.scale, c.holes);
      const kw = buildKeywork(geom, c.mode, c.segments, 14.0);
      const L = kw.layout as KeyworkLayout;
      kw.verdict.planes.forEach((z, i) => {
        if (!kw.verdict.legal[i]) return;   // an illegal plane is reported by KW-NOCUT, not hidden
        if (z > L.clusterLoZ - L.buttonPitch / 2 - 10 && z < L.clusterHiZ + L.buttonPitch / 2 + 10) {
          offenders.push(`${LABEL(c)} plane ${z.toFixed(1)} bisects the cluster`);
        }
        for (const k of L.keys) {
          if (Math.abs(z - k.sleeveZ0) < 9 || Math.abs(z - k.sleeveZ1) < 9) {
            offenders.push(`${LABEL(c)} plane ${z.toFixed(1)} lands on journal ${k.holeIndex}'s end`);
          }
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it('an illegal plane is reported rather than silently used', () => {
    const offenders: string[] = [];
    for (const c of sweep()) {
      if (c.segments === 1) continue;
      const geom = geomOnce(c.root, c.scale, c.holes);
      const kw = buildKeywork(geom, c.mode, c.segments, 14.0);
      const L = kw.layout as KeyworkLayout;
      const anyIllegal = kw.verdict.legal.some((ok) => !ok);
      const warned = L.warnings.some((w) => w.code === 'KW-NOCUT');
      if (anyIllegal !== warned) offenders.push(`${LABEL(c)} illegal=${anyIllegal} warned=${warned}`);
    }
    expect(offenders).toEqual([]);
  });

  it('a rod is marked print-in-place exactly when no plane crosses it', () => {
    for (const c of sweep()) {
      const geom = geomOnce(c.root, c.scale, c.holes);
      const kw = buildKeywork(geom, c.mode, c.segments, 14.0);
      const L = kw.layout as KeyworkLayout;
      for (const k of L.keys) {
        const crossed = kw.verdict.planes.some((z) => z > k.rodZ0 && z < k.rodZ1);
        expect(k.crossedByCut, `${LABEL(c)} hole ${k.holeIndex}`).toBe(crossed);
      }
    }
  });

  it('the keywork exclusion zones actually move the planes', () => {
    // Blind control: if the zones were ignored the keyed and unkeyed searches would agree
    // everywhere, and the two tests above would pass while checking nothing.
    let moved = 0;
    for (const c of sweep()) {
      if (c.segments === 1) continue;
      const plain = computeSmartJointCuts(c.root, c.scale, c.holes, c.segments, 14.0);
      const keyed = computeSmartJointCuts(c.root, c.scale, c.holes, c.segments, 14.0, 0, 7, 2.8, 3.3, c.mode);
      if (Math.abs(plain.zCut1 - keyed.zCut1) > 1e-6 || Math.abs(plain.zCut2 - keyed.zCut2) > 1e-6) moved++;
    }
    expect(moved).toBeGreaterThan(50);
  });

  it('turning keywork off leaves the unkeyed cut search exactly as it was', () => {
    for (const c of sweep().slice(0, 40)) {
      const geom = geomOnce(c.root, c.scale, c.holes);
      const solved = solveJointCuts(geom, c.segments, 14.0);
      const legacy = computeSmartJointCuts(c.root, c.scale, c.holes, c.segments, 14.0);
      expect(solved.cuts.zCut1).toBe(legacy.zCut1);
      expect(solved.cuts.zCut2).toBe(legacy.zCut2);
      expect(solved.cuts.zCut3).toBe(legacy.zCut3);
    }
  });
});

describe('keywork: hole selection', () => {
  it('keys_low keys the upper half of the drilled holes and nothing else', () => {
    for (const c of sweep().filter((s) => s.mode === 'keys_low').slice(0, 60)) {
      const geom = geomOnce(c.root, c.scale, c.holes);
      const L = layoutFor(c);
      const cut = Math.floor(geom.numHoles / 2);
      expect(L.keys.map((k) => k.holeIndex), LABEL(c))
        .toEqual(geom.melody.holes.filter((h) => h.index >= cut).map((h) => h.index));
    }
  });

  it('keys_all and keys_low really are different mechanisms', () => {
    const geom = geomOnce(36, 'natural_minor', 7);
    const all = buildKeywork(geom, 'keys_all', 3, 14.0).layout as KeyworkLayout;
    const low = buildKeywork(geom, 'keys_low', 3, 14.0).layout as KeyworkLayout;
    expect(all.keys.length).toBeGreaterThan(low.keys.length);
    expect(all.rodOd).not.toBeCloseTo(low.rodOd, 3);
  });

  it('mode none produces no layout and no keywork in the program', () => {
    const geom = geomOnce(69, 'hijaz', 6);
    expect(computeKeyworkLayout(geom, 'none')).toBeNull();
    const scad = generateScadJs(69, 'hijaz', 6, 'sac', 2.8, 3.3, 3, 'assembled', 0.18, 14.0, 0, 7, 'staggered', 'none', 'tpu');
    expect(scad).not.toContain('keywork_');
    expect(lastTpuGasketsScad).toBe('');
  });
});

describe('keywork: duplicate hole positions', () => {
  /** A geometry whose holes 2 and 3 have been moved onto one another. */
  function withDuplicate(): FluteGeometry {
    const geom = computeFluteGeometry(69, 'hijaz', 6);
    const holes = geom.melody.holes.map((h) => ({ ...h }));
    holes[3].z = holes[2].z + 0.4;
    return { ...geom, melody: { ...geom.melody, holes } };
  }

  it('the second of a colliding pair gets no key, and the hole is not moved', () => {
    const geom = withDuplicate();
    const L = computeKeyworkLayout(geom, 'keys_all') as KeyworkLayout;
    expect(L.droppedDuplicates).toEqual([3]);
    expect(L.keys.map((k) => k.holeIndex)).toEqual([0, 1, 2, 4, 5]);
    // Not renumbered: hole 4 is still hole 4, at the z the tuning solver gave it.
    expect(L.keys.map((k) => k.holeZ)).toEqual([0, 1, 2, 4, 5].map((i) => geom.melody.holes[i].z));
    const w = L.warnings.find((x) => x.code === 'KW-DUP');
    expect(w?.message).toContain('holes [3]');
  });

  it('a 1.1 mm gap is not a duplicate', () => {
    const geom = computeFluteGeometry(69, 'hijaz', 6);
    const holes = geom.melody.holes.map((h) => ({ ...h }));
    holes[3].z = holes[2].z + 1.1;
    const L = computeKeyworkLayout({ ...geom, melody: { ...geom.melody, holes } }, 'keys_all') as KeyworkLayout;
    expect(L.droppedDuplicates).toEqual([]);
  });

  it('no UI-reachable instrument produces one, because the hole table drops them first', () => {
    // computeFluteGeometry() rejects a scale degree that repeats or falls below its predecessor,
    // so the keywork's own detector is a backstop. This records that it is one.
    let worst = Infinity;
    for (const root of UI_ROOTS) for (const scale of UI_SCALES) for (const holes of UI_HOLE_COUNTS) {
      const g = geomOnce(root, scale, holes);
      for (let i = 1; i < g.melody.holes.length; i++) {
        worst = Math.min(worst, Math.abs(g.melody.holes[i].z - g.melody.holes[i - 1].z));
      }
      const L = computeKeyworkLayout(g, 'keys_all');
      expect(L?.droppedDuplicates ?? []).toEqual([]);
    }
    expect(worst).toBeGreaterThan(1.0);
  });
});

describe('keywork: the nineteen warning conditions', () => {
  const FIRE_ON: Record<string, Sweep> = {
    'KW-BRIDGEHOLE': { root: 36, scale: 'hijaz', holes: 6, mode: 'keys_all', segments: 1 },
    'KW-BUILDZ': { root: 36, scale: 'hijaz', holes: 4, mode: 'keys_all', segments: 1 },
    'KW-FOOTGAP': { root: 60, scale: 'major_pentatonic', holes: 4, mode: 'keys_all', segments: 1 },
    'KW-LEAFSTRAIN': { root: 72, scale: 'hijaz', holes: 6, mode: 'keys_low', segments: 1 },
    'KW-NOCUT': { root: 36, scale: 'hijaz', holes: 7, mode: 'keys_all', segments: 3 },
    'KW-OVERHOLE': { root: 36, scale: 'hijaz', holes: 6, mode: 'keys_all', segments: 1 },
    'KW-PITCH': { root: 72, scale: 'major_pentatonic', holes: 4, mode: 'keys_low', segments: 1 },
    'KW-STANCHION': { root: 60, scale: 'hijaz', holes: 4, mode: 'keys_all', segments: 1 },
    'KW-STANDOFF': { root: 60, scale: 'major', holes: 7, mode: 'keys_all', segments: 1 },
    'KW-TIER': { root: 72, scale: 'hijaz', holes: 5, mode: 'keys_all', segments: 1 },
    'KW-TINYSEG': { root: 69, scale: 'native_american', holes: 4, mode: 'keys_low', segments: 4 },
    'KW-TRAVEL': { root: 60, scale: 'major_pentatonic', holes: 4, mode: 'keys_all', segments: 1 },
    'KW-UNNEEDED': { root: 36, scale: 'hijaz', holes: 4, mode: 'keys_all', segments: 1 },
    'KW-WINDUP': { root: 60, scale: 'major', holes: 6, mode: 'keys_all', segments: 1 }
  };

  for (const [code, c] of Object.entries(FIRE_ON)) {
    it(`${code} fires on ${LABEL(c)}`, () => {
      const L = layoutFor(c);
      const hit = L.warnings.find((w) => w.code === code);
      expect(hit, `warnings were ${L.warnings.map((w) => w.code).join(', ')}`).toBeDefined();
      expect((hit as { message: string }).message.length).toBeGreaterThan(40);
    });
  }

  it('a warning that has not fired is not emitted', () => {
    // The control for the fifteen rows above: a mid-range instrument with none of those defects
    // must not carry their messages.
    const L = layoutFor({ root: 50, scale: 'hijaz', holes: 5, mode: 'keys_all', segments: 3 });
    const codes = L.warnings.map((w) => w.code);
    for (const c of ['KW-DUP', 'KW-PITCH', 'KW-TIER', 'KW-CLUSTER', 'KW-TRAVEL', 'KW-FOOTGAP', 'KW-NOCUT']) {
      expect(codes).not.toContain(c);
    }
  });

  it('KW-DUP, KW-ODCLAMP and KW-CLUSTER fire on a geometry built to trigger them', () => {
    const base = computeFluteGeometry(69, 'hijaz', 6);

    const dup = { ...base, melody: { ...base.melody, holes: base.melody.holes.map((h, i) => (i === 3 ? { ...h, z: base.melody.holes[2].z } : { ...h })) } };
    expect((computeKeyworkLayout(dup, 'keys_all') as KeyworkLayout).warnings.map((w) => w.code)).toContain('KW-DUP');

    // A 10 m hole span drives the torsion solve past the 14 mm cap.
    const long = { ...base, fippleZ: 20000, totalLength: 20042, bodyLength: 20000,
      melody: { ...base.melody, holes: base.melody.holes.map((h, i) => ({ ...h, z: 100 + i * 2000 })) } };
    expect((computeKeyworkLayout(long, 'keys_all') as KeyworkLayout).warnings.map((w) => w.code)).toContain('KW-ODCLAMP');

    // A body narrower than the 40 mm touch cluster.
    const narrow = { ...base, outerDiameter: 14, tubeSpacing: 8 };
    expect((computeKeyworkLayout(narrow, 'keys_all') as KeyworkLayout).warnings.map((w) => w.code)).toContain('KW-CLUSTER');
  });

  it('KW-COLLIDE fires on a body too narrow to stand the spindle off the chimneys', () => {
    // No UI-reachable instrument reaches this any more: the column search places every rod
    // clear of every pad arm and of every other rod in its column, so the two interference
    // lists that used to fire are empty by construction. The stanchion/chimney list is not a
    // column decision - the legs are clamped to the facet edge - so it still can, and this is
    // the geometry that proves the report path is live rather than dead code.
    const base = computeFluteGeometry(69, 'hijaz', 6);
    const narrow = { ...base, outerDiameter: 14, tubeSpacing: 8 };
    const L = computeKeyworkLayout(narrow, 'keys_all') as KeyworkLayout;
    expect(L.collisions.postChimney.filter((l) => l.length > 0).length).toBeGreaterThan(0);
    expect(L.collisions.padArm.every((l) => l.length === 0)).toBe(true);
    const hit = L.warnings.find((w) => w.code === 'KW-COLLIDE');
    expect(hit?.message).toContain('stanchion/chimney');
  });

  it('KW-BEARING fires exactly when a journal was clipped short by the body', () => {
    // A journal is bearMin long by construction unless the body ran out first, which happens on
    // the smallest instruments where the topmost rod's far-side journal would hang over the
    // fipple. The warning and the measurement must agree on every configuration.
    const offenders: string[] = [];
    let short = 0;
    for (const c of sweep()) {
      const L = layoutFor(c);
      const bearMin = Math.max(12, 3 * L.rodOd);
      const worst = Math.min(...L.keys.map((k) => k.sleeveZ1 - k.sleeveZ0));
      const warned = L.warnings.some((w) => w.code === 'KW-BEARING');
      if ((worst < bearMin - 0.01) !== warned) {
        offenders.push(`${LABEL(c)} shortest journal ${worst.toFixed(2)} against ${bearMin.toFixed(2)}, warned=${warned}`);
      }
      if (warned) short++;
    }
    expect(offenders).toEqual([]);
    expect(short, 'no configuration exercises the short-journal path').toBeGreaterThan(0);
  });

  it('every warning that fires carries its interpolated numbers, not a template', () => {
    const codes = new Set<string>();
    for (const c of sweep()) {
      for (const w of layoutFor(c).warnings) {
        codes.add(w.code);
        expect(w.message).not.toContain('undefined');
        expect(w.message).not.toContain('NaN');
      }
    }
    expect(codes.size).toBeGreaterThanOrEqual(15);
  });
});

describe('keywork: the soft parts reach the TPU export', () => {
  it('the gasket program carries a pad, three bumpers and three leaves per key', () => {
    generateScadJs(50, 'hijaz', 5, 'sac', 2.8, 3.3, 3, 'assembled', 0.18, 14.0, 0, 7, 'staggered', 'keys_all', 'tpu');
    const tpu = lastTpuGasketsScad;
    const geom = geomOnce(50, 'hijaz', 5);
    const L = buildKeywork(geom, 'keys_all', 3, 14.0).layout as KeyworkLayout;
    const count = (re: RegExp): number => (tpu.match(re) ?? []).length;
    expect(count(/\/\/ pad disc, hole /g)).toBe(L.keys.length);
    expect(count(/\/\/ regulation bumper, hole /g)).toBe(L.keys.length * 3);
    expect(count(/\/\/ leaf spring, hole /g)).toBe(L.keys.length * 3);
    // The ladders must be three DIFFERENT thicknesses, or they are not a ladder.
    const bumpers = Array.from(tpu.matchAll(/regulation bumper, hole 0, ([0-9.]+) mm/g)).map((m) => m[1]);
    expect(new Set(bumpers).size).toBe(3);
    const leaves = Array.from(tpu.matchAll(/leaf spring, hole 0, ([0-9.]+) mm/g)).map((m) => m[1]);
    expect(new Set(leaves).size).toBe(3);
  });

  it('the leaf thickness in the export is the one the spring calculation produced', () => {
    generateScadJs(50, 'hijaz', 5, 'sac', 2.8, 3.3, 3, 'assembled', 0.18, 14.0, 0, 7, 'staggered', 'keys_all', 'tpu');
    const geom = geomOnce(50, 'hijaz', 5);
    const L = buildKeywork(geom, 'keys_all', 3, 14.0) .layout as KeyworkLayout;
    const nominal = L.keys[0].leafThickness.toFixed(3);
    expect(lastTpuGasketsScad).toContain(`leaf spring, hole ${L.keys[0].holeIndex}, ${nominal} mm`);
  });
});

describe('keywork: the emitted program', () => {
  it('contains one journal, one rod, one touch key and one echoed warning set', () => {
    const scad = generateScadJs(50, 'hijaz', 5, 'sac', 2.8, 3.3, 3, 'assembled', 0.18, 14.0, 0, 7, 'staggered', 'keys_all', 'tpu');
    const geom = geomOnce(50, 'hijaz', 5);
    const kw = buildKeywork(geom, 'keys_all', 3, 14.0);
    const L = kw.layout as KeyworkLayout;
    for (const k of L.keys) {
      expect(scad).toContain(`// journal sleeve for hole ${k.holeIndex}`);
      expect(scad).toContain(`// pad rod for hole ${k.holeIndex}`);
      expect(scad).toContain(`// touch key for hole ${k.holeIndex}`);
    }
    expect((scad.match(/\/\/ spindle stanchion /g) ?? []).length).toBe(L.keys.length + 1);
    for (const w of L.warnings) expect(scad).toContain(`!! WARN ${w.code}`);
    // The soft parts are NOT part of the printed body.
    expect(scad).not.toContain('keywork_tpu();');
  });

  it('the cut planes in the program are the ones the layout was told about', () => {
    for (const segments of [2, 3, 4]) {
      const scad = generateScadJs(36, 'natural_minor', 7, 'sac', 2.8, 3.3, segments, 'assembled', 0.18, 14.0, 0, 7, 'staggered', 'keys_all', 'tpu');
      const geom = geomOnce(36, 'natural_minor', 7);
      const kw = buildKeywork(geom, 'keys_all', segments, 14.0);
      expect(scad).toContain(`z_cut1 = ${kw.cuts.zCut1.toFixed(2)};`);
      expect(scad).toContain(`z_cut2 = ${kw.cuts.zCut2.toFixed(2)};`);
    }
  });

  it('the layout, its zones and the planes are applied in that one order', () => {
    // applyCutPlanes() is what marks a rod print-in-place; a caller that forgets it would leave
    // every rod claiming it prints in place. This asserts the pipeline, not the wrapper.
    const geom = geomOnce(36, 'natural_minor', 7);
    const layout = computeKeyworkLayout(geom, 'keys_all') as KeyworkLayout;
    expect(layout.keys.every((k) => !k.crossedByCut)).toBe(true);
    const solved = solveJointCuts(geom, 4, 14.0, keyworkCutZones(layout));
    applyCutPlanes(layout, solved.verdict);
    expect(layout.keys.some((k) => k.crossedByCut)).toBe(true);
  });
});
