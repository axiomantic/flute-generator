// Category 7 - structural validation of the rendered mesh.
//
// Every undirected edge of a closed, watertight surface belongs to exactly two triangles. An
// edge with any other count is a hole, a duplicated face, or a self-intersection that a slicer
// will have to guess about. The mesh comes from the real OpenSCAD binary rendering the real
// generated program, so this checks the file a user downloads.
//
// CONTRIBUTING.md requires generateScadJs() to produce 2-manifold solids. Every unkeyed body at
// every register now does, so there is no pinned-defect table here for them any more.

import { describe, expect, it } from 'vitest';

import { generateScadJs } from '../src/web/cad/scad.js';
import { airColumnProbe, meshParity, renderStl, renderStlAllowEmpty } from './helpers.js';

interface StlCase {
  root: number; scale: string; holes: number; profile?: string; keywork?: string;
  /** Measured non-manifold edge count at 1e-4 mm vertex quantization. 0 means watertight. */
  expected: number;
  note?: string;
}

// One row per register, plus the profile and keywork axes.
//
// Root 60 and root 50 carry the most rows because they are where the mouthpiece-seam defect
// used to live. It was never scale-specific and never confined to six- and seven-hole bodies:
// all 28 root-60 configurations were non-manifold, 25 edges in 23 of them and 2 to 4 in the
// other five, and root 50 was hit at hijaz/4h and natural_minor/6h. What decided it was whether
// the four independently written expressions for the height of the plane under the beak rounded
// to the same number, which depends on the register's magnitudes. The plane is no longer a union
// interface at all (see seam_lap in scad.ts), so the whole family is gone. The `seam_lap` row at
// the bottom of this file is what keeps it gone.
const CASES: StlCase[] = [
  { root: 36, scale: 'hijaz', holes: 7, expected: 0 },
  { root: 50, scale: 'major', holes: 6, expected: 0 },
  { root: 69, scale: 'hijaz', holes: 6, expected: 0 },
  { root: 69, scale: 'native_american', holes: 6, expected: 0 },
  { root: 72, scale: 'dorian', holes: 7, expected: 0 },
  { root: 86, scale: 'major', holes: 4, expected: 0 },
  { root: 69, scale: 'hijaz', holes: 6, profile: 'venturi', expected: 0 },

  // The former root-60 defect, one row per shape of it: 25 edges at six and seven holes, and the
  // milder 2- and 4-edge forms that four-hole bodies showed.
  { root: 60, scale: 'hijaz', holes: 7, expected: 0 },
  { root: 60, scale: 'native_american', holes: 6, expected: 0 },
  { root: 60, scale: 'major', holes: 4, expected: 0 },
  { root: 60, scale: 'major_pentatonic', holes: 4, expected: 0 },
  { root: 50, scale: 'hijaz', holes: 4, expected: 0 },
  { root: 50, scale: 'natural_minor', holes: 6, expected: 0 },

  // Keyed bodies. The keywork adds five kinds of solid to the same mesh, and three separate
  // coincident-surface unions inside it made every keyed body non-manifold before they were
  // found here: journal lands sharing the sleeve's outer wall, a stacked sleeve's web landing
  // tangent on the sleeve below, and three coaxial bosses on one rod at equal radii.
  { root: 36, scale: 'natural_minor', holes: 7, keywork: 'keys_all', expected: 0 },
  { root: 50, scale: 'hijaz', holes: 5, keywork: 'keys_all', expected: 0 },
  { root: 69, scale: 'hijaz', holes: 6, keywork: 'keys_all', expected: 0 },
  { root: 69, scale: 'hijaz', holes: 6, keywork: 'keys_low', expected: 0 },
  { root: 72, scale: 'dorian', holes: 6, keywork: 'keys_all', expected: 0 },
  { root: 86, scale: 'major', holes: 4, keywork: 'keys_all', expected: 0 },
  { root: 60, scale: 'hijaz', holes: 7, keywork: 'keys_all', expected: 0 },
  { root: 60, scale: 'major', holes: 4, keywork: 'keys_all', expected: 0 },

  // Two more coincident-surface unions inside the keywork, both found by sweeping all 504
  // configurations rather than by reasoning: the pad arm and the bridge lug are both 6 mm prisms
  // and occupied the identical Z range whenever a bridge station landed on its own key's hole,
  // and a stanchion leg's flank plane fell exactly on a drone bore's polygon vertex at
  // 72/hijaz/4. These five rows are the configurations that showed them.
  { root: 72, scale: 'hijaz', holes: 4, keywork: 'keys_low', expected: 0 },
  { root: 86, scale: 'hijaz', holes: 6, keywork: 'keys_low', expected: 0 },
  { root: 86, scale: 'dorian', holes: 5, keywork: 'keys_all', expected: 0 },
  { root: 86, scale: 'dorian', holes: 6, keywork: 'keys_low', expected: 0 },
  { root: 86, scale: 'major', holes: 6, keywork: 'keys_low', expected: 0 }
];

function scadFor(c: StlCase): string {
  return generateScadJs(c.root, c.scale, c.holes, c.profile ?? 'sac', 2.8, 3.3, 1, 'assembled',
    0.18, 14.0, 0, 7, 'staggered', c.keywork ?? 'none', 'tpu');
}

function meshFor(c: StlCase) {
  return meshParity(renderStl(scadFor(c)));
}

/**
 * The distinct z planes the non-manifold edges lie in, quantized the same way meshParity()
 * quantizes vertices. meshParity() returns only counts; this re-derives the edges so a test can
 * say WHERE a defect is rather than only how large it is.
 */
function badEdgeZ(stl: string): Set<string> {
  const verts: string[] = [];
  for (const line of stl.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('vertex ')) continue;
    const p = t.split(/\s+/);
    verts.push(`${(+p[1]).toFixed(4)},${(+p[2]).toFixed(4)},${(+p[3]).toFixed(4)}`);
  }
  const counts = new Map<string, number>();
  for (let i = 0; i + 2 < verts.length; i += 3) {
    const tri = [verts[i], verts[i + 1], verts[i + 2]];
    for (let k = 0; k < 3; k++) {
      const a = tri[k], b = tri[(k + 1) % 3];
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const planes = new Set<string>();
  for (const [key, n] of counts) {
    if (n === 2) continue;
    for (const vertex of key.split('|')) planes.add(vertex.split(',')[2]);
  }
  return planes;
}

const NAME = (c: StlCase): string => `${c.root} ${c.scale} ${c.holes}h ${c.profile ?? 'sac'} ${c.keywork ?? 'none'}`;

describe('STL: closed-surface edge parity', () => {
  for (const c of CASES.filter((x) => x.expected === 0)) {
    it(`${NAME(c)} is watertight`, () => {
      const m = meshFor(c);
      expect(m.triangles).toBeGreaterThan(1000);
      expect(m.nonManifoldEdges, `${m.nonManifoldEdges} of ${m.edges} edges are not shared by exactly two faces`).toBe(0);
    });
  }

  for (const c of CASES.filter((x) => x.expected !== 0)) {
    it(`KNOWN DEFECT: ${NAME(c)} has ${c.expected} non-manifold edges`, () => {
      const m = meshFor(c);
      expect(m.triangles).toBeGreaterThan(1000);
      // Pinned exactly. Lower means the defect was fixed and this row should become a
      // watertight case; higher means it spread.
      expect(m.nonManifoldEdges, c.note).toBe(c.expected);
    });
  }

  it('the detector is not blind: a deleted facet is reported', () => {
    // A parity checker that never fires is indistinguishable from one that is not running.
    // One triangle is removed from a mesh that measures clean, which must open three edges.
    const clean = renderStl(generateScadJs(69, 'hijaz', 6, 'sac'));
    expect(meshParity(clean).nonManifoldEdges).toBe(0);
    const facets = clean.split('  facet normal ');
    expect(facets.length).toBeGreaterThan(100);
    const punctured = [facets[0], ...facets.slice(2)].join('  facet normal ');
    expect(meshParity(punctured).nonManifoldEdges).toBe(3);
  });

  it('a keyed body really does carry the mechanism', () => {
    // Blind control for the keyed rows: if the keywork were absent from the solid they would be
    // watertight for the wrong reason.
    const plain = meshFor({ root: 69, scale: 'hijaz', holes: 6, expected: 0 });
    const keyed = meshFor({ root: 69, scale: 'hijaz', holes: 6, keywork: 'keys_all', expected: 0 });
    expect(keyed.triangles).toBeGreaterThan(plain.triangles * 3);
  });

  it('the root-60 rows are genuinely different meshes from the root-69 ones', () => {
    // Guards against a blind control: two rows that render the same solid would agree for the
    // wrong reason. These two differ in register, so their tube lengths differ outright.
    const good = meshFor(CASES[2]);
    const wasBad = meshFor(CASES.find((c) => c.root === 60 && c.holes === 7) as StlCase);
    expect(good.triangles).not.toBe(wasBad.triangles);
  });

  it('seam_lap is what makes root 60 watertight, and it changes nothing else', () => {
    // The load-bearing control for the fix. seam_lap is the distance every solid under the
    // mouthpiece runs PAST fipple_z + win_len, so that the beak is not unioned onto the body
    // across an exactly coplanar plane. Setting it to zero restores the old abutment exactly,
    // and must bring the old defect back - otherwise the constant is decoration and this suite
    // would stay green if someone deleted it.
    const scad = scadFor({ root: 60, scale: 'hijaz', holes: 7, expected: 0 });
    expect(scad.split('seam_lap = 0.2;')).toHaveLength(2);
    const abutting = renderStl(scad.replace('seam_lap = 0.2;', 'seam_lap = 0.0;'));
    expect(meshParity(abutting).nonManifoldEdges).toBe(25);

    // Every one of those edges lies in the one plane, which is the diagnosis itself and not a
    // restatement of the count: fipple_z rounds to 672.41 and win_len is 5.20.
    expect([...badEdgeZ(abutting)]).toEqual(['677.6100']);

    // And the lap is a no-op on the shape: same enclosed volume, to double-rounding.
    const volume = (stl: string): number => {
      const v: number[][] = [];
      for (const line of stl.split('\n')) {
        const t = line.trim();
        if (t.startsWith('vertex ')) { const p = t.split(/\s+/); v.push([+p[1], +p[2], +p[3]]); }
      }
      let sum = 0;
      for (let i = 0; i + 2 < v.length; i += 3) {
        const [a, b, c] = [v[i], v[i + 1], v[i + 2]];
        sum += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
      }
      return sum;
    };
    const vAbut = volume(abutting);
    const vLapped = volume(renderStl(scad));
    expect(vAbut).toBeGreaterThan(1000);
    expect(Math.abs(vLapped - vAbut) / vAbut).toBeLessThan(1e-12);
  });
});

// ---------------------------------------------------------------------------------------------
// The air column.
//
// The stanchions and the moving keywork are unioned after the bore subtraction, so nothing in
// complete_flute() stops them standing inside a bore, and the stanchion legs run down to the bore
// axis over the drone tubes. kw_bore_clear is the clip that takes them back out. Every pitch this
// generator ships is solved for an unobstructed bore, so an intrusion here is a tuning error in
// the printed instrument, not a cosmetic one.

const BORE_CASES: StlCase[] = [
  { root: 72, scale: 'hijaz', holes: 4, keywork: 'keys_low', expected: 0 },
  { root: 50, scale: 'hijaz', holes: 5, keywork: 'keys_all', expected: 0 },
  { root: 86, scale: 'natural_minor', holes: 7, keywork: 'keys_all', expected: 0 },
  { root: 36, scale: 'natural_minor', holes: 7, keywork: 'keys_all', expected: 0 },
  { root: 69, scale: 'hijaz', holes: 6, keywork: 'none', expected: 0 }
];

/** Volume enclosed by an STL, 0 for the empty render. */
function stlVolume(stl: string): number {
  const v: number[][] = [];
  for (const line of stl.split('\n')) {
    const t = line.trim();
    if (t.startsWith('vertex ')) { const p = t.split(/\s+/); v.push([+p[1], +p[2], +p[3]]); }
  }
  let sum = 0;
  for (let i = 0; i + 2 < v.length; i += 3) {
    const [a, b, c] = [v[i], v[i + 1], v[i + 2]];
    sum += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  }
  return Math.abs(sum);
}

describe('STL: the bore is an air column, not a hole through the middle of the keywork', () => {
  for (const c of BORE_CASES) {
    it(`${NAME(c)} leaves every bore clear`, () => {
      const scad = scadFor(c);

      // The probe reaching PAST the bore wall must come back with the tube wall, or the clean
      // result below would mean "the probe saw nothing", not "the bore is clear".
      const outward = renderStlAllowEmpty(airColumnProbe(scad, 1.0));
      expect(stlVolume(outward), 'the probe is not looking at the body').toBeGreaterThan(100);

      const inward = renderStlAllowEmpty(airColumnProbe(scad, -0.05));
      expect(stlVolume(inward), `${stlVolume(inward).toFixed(1)} mm^3 of material stands inside a bore`).toBe(0);
    });
  }

  it('the clip is what clears the bore, and removing it puts the obstruction back', () => {
    // The load-bearing control. Without this, deleting kw_bore_clear from the generator would
    // leave every assertion above green for the wrong reason: they would all render empty
    // intersections if the probe were broken, and a probe that never fires is not a check.
    const c = BORE_CASES[0];
    const scad = scadFor(c);
    // The clip is one module, defined once and called by the shipped program and by both display
    // programs. Its BODY is what this collapses; the module is matched on the `for` line so that
    // changing the tube list trips this guard instead of quietly disabling the control.
    const clip = /(module keywork_bore_clip\(\) \{\n)    for \(pipe = \[\[[\s\S]*?\]\]\)[\s\S]*?\$fn=24\);/;
    expect(scad.match(clip), 'the air-column clip module moved').not.toBeNull();
    // Defined once, and actually called: a module nothing invokes would cut nothing while still
    // matching the pattern above.
    expect(scad.split('keywork_bore_clip();').length - 1).toBeGreaterThanOrEqual(1);

    // Collapsing the cutter to a hair restores exactly the pre-fix solid: the difference()
    // becomes a no-op and the legs run to the bore axis again.
    const unclipped = scad.replace(clip, '$1    cylinder(d=0.001, h=1, $fn=24);');
    expect(unclipped, 'the collapse did not change the program').not.toBe(scad);
    const intruding = renderStlAllowEmpty(airColumnProbe(unclipped, -0.05));
    expect(stlVolume(intruding), 'the probe did not detect a deliberately restored obstruction')
      .toBeGreaterThan(100);
  });

  it('an unkeyed body carries no clip at all', () => {
    // The clip is emitted only with keywork, which is what keeps every unkeyed golden byte-identical.
    expect(generateScadJs(69, 'hijaz', 6, 'sac')).not.toContain('kw_bore_clear');
  });
});
