// Shared measurement primitives for the suite.
//
// Everything here RE-DERIVES a quantity from the shipped geometry object rather than reading a
// number the solver already reported about itself. A test that asserts on `tuningSolver.residuals`
// is asking the solver whether the solver agrees with the solver; these helpers instead take the
// drilled hole positions, the fingering contract from data/score.ts, and the passive lattice
// statics on WaveguideFlutePipe, and ask what pitch that instrument actually sounds.

import { execFileSync } from 'node:child_process';
import { accessSync, constants, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { WaveguideFlutePipe } from '../src/web/acoustics/waveguide.js';
import { computeFluteGeometry } from '../src/web/geometry/flute.js';
import { midiToHoles } from '../src/web/data/score.js';
import { midiToFreq } from '../src/web/data/scales.js';
import type { FluteGeometry, LatticeHole, ToneHole } from '../src/web/types.js';

/** The six roots, seven scales and four hole counts index.html actually offers. 6*7*4 = 168. */
export const UI_ROOTS = [36, 50, 60, 69, 72, 86] as const;
export const UI_SCALES = [
  'hijaz', 'native_american', 'minor_pentatonic', 'major_pentatonic', 'dorian', 'major', 'natural_minor'
] as const;
export const UI_HOLE_COUNTS = [4, 5, 6, 7] as const;

export interface UiConfig { root: number; scale: string; holes: number; }

export function allUiConfigs(): UiConfig[] {
  const out: UiConfig[] = [];
  for (const root of UI_ROOTS) for (const scale of UI_SCALES) for (const holes of UI_HOLE_COUNTS) {
    out.push({ root, scale, holes });
  }
  return out;
}

/** A spread across every register, every scale and every hole count, without the full 168. */
export function representativeUiConfigs(): UiConfig[] {
  const scales = UI_SCALES;
  const out: UiConfig[] = [];
  UI_ROOTS.forEach((root, i) => {
    scales.forEach((scale, j) => {
      out.push({ root, scale, holes: UI_HOLE_COUNTS[(i + j) % UI_HOLE_COUNTS.length] });
    });
  });
  return out;
}

export function cents(f: number, target: number): number {
  return 1200 * Math.log2(f / target);
}

/**
 * Sounding fundamental of `geom` for the fingering that opens the first `openCount` holes from
 * the foot, computed from the DRILLED hole table through the passive lattice statics.
 * `openCount === 0` is the all-closed bell note.
 */
export function soundingFundamental(geom: FluteGeometry, covered: boolean[]): number | null {
  const holes: ToneHole[] = geom.melody.holes.slice().sort((p, q) => p.distanceFromFipple - q.distanceFromFipple);
  const isOpen = holes.map((h) => !(h.index < covered.length ? covered[h.index] : true));
  const fRoot = geom.melody.frequency;
  return WaveguideFlutePipe.latticeFundamental(
    geom.melody.bore, geom.melody.acousticLength, holes as LatticeHole[], isOpen, geom.wall,
    fRoot * 0.30, fRoot * 12.0
  );
}

export interface PitchResidual { degree: number; midi: number; targetHz: number; soundingHz: number; cents: number; }

/**
 * The fingering for scale degree d: holes 0..d-1 open, the rest closed. Hole 0 is the one
 * nearest the foot, which is the ordering computeFluteGeometry() drills in and the one
 * WaveguideFlutePipe.setFingering() indexes by.
 */
export function coveredForDegree(numHoles: number, degree: number): boolean[] {
  const covered = new Array<boolean>(numHoles).fill(true);
  for (let h = 0; h < Math.min(degree, numHoles); h++) covered[h] = false;
  return covered;
}

/**
 * Every pitch the instrument is solved for, in scale order: the bell note, then one hole opened
 * at a time. The fingering is the degree contract above, which is also what midiToHoles()
 * produces for every degree whose interval is under an octave (asserted in tuning.test.ts).
 */
export function measureTuning(geom: FluteGeometry): PitchResidual[] {
  const out: PitchResidual[] = [];
  const rootMidi = geom.rootMidi;
  const n = geom.melody.holes.length;
  for (let degree = 0; degree <= n; degree++) {
    const midi = degree === 0 ? rootMidi : geom.melody.holes[degree - 1].midi;
    const covered = coveredForDegree(n, degree);
    const f = soundingFundamental(geom, covered);
    const targetHz = midiToFreq(midi);
    out.push({
      degree, midi, targetHz,
      soundingHz: f === null ? NaN : f,
      cents: f === null ? NaN : cents(f, targetHz)
    });
  }
  return out;
}

/** Pitch a bare (hole-free) tube of this bore and length actually sounds. Used for the drones. */
export function bareTubeFundamental(bore: number, acousticLength: number): number | null {
  const fGuess = 343200.0 / (2.0 * acousticLength);
  return WaveguideFlutePipe.latticeFundamental(bore, acousticLength, [], [], 5.5, fGuess * 0.2, fGuess * 4.0);
}

export function worstAbs(values: number[]): number {
  return values.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
}

export function meanAbs(values: number[]): number {
  return values.reduce((s, v) => s + Math.abs(v), 0) / Math.max(1, values.length);
}

// ------------------------------------------------------------------------------------------
// Determinism.

/** mulberry32. Seeded so a rendered passage is byte-identical between runs and machines. */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * FNV-1a over the sample stream, quantized to 1e-9. A float hash has to be quantized or the last
 * mantissa bit of an irrelevant denormal decides the digest; 1e-9 is ~180 dB below full scale.
 */
export function hashSamples(samples: ArrayLike<number>): string {
  let h = 0x811c9dc5;
  const buf = new DataView(new ArrayBuffer(8));
  for (let i = 0; i < samples.length; i++) {
    buf.setFloat64(0, Math.round(samples[i] * 1e9) / 1e9);
    for (let b = 0; b < 8; b++) {
      h ^= buf.getUint8(b);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  }
  return h.toString(16).padStart(8, '0');
}

// ------------------------------------------------------------------------------------------
// OpenSCAD.

export function resolveOpenScad(): string {
  const candidates = [
    process.env.OPENSCAD,
    '/opt/homebrew/bin/openscad',
    '/usr/local/bin/openscad',
    '/Applications/OpenSCAD.app/Contents/MacOS/OpenSCAD',
    '/usr/bin/openscad'
  ].filter((c): c is string => typeof c === 'string' && c.length > 0);
  for (const c of candidates) {
    try { accessSync(c, constants.X_OK); return c; } catch { /* next */ }
  }
  // Deliberately fatal rather than a skip: a structural check that silently does not run is
  // indistinguishable from one that passes.
  throw new Error('No OpenSCAD binary found; tried:\n  ' + candidates.join('\n  '));
}

export function renderStl(scad: string): string {
  const bin = resolveOpenScad();
  const dir = mkdtempSync(path.join(tmpdir(), 'flute-stl-'));
  const scadPath = path.join(dir, 'model.scad');
  const stlPath = path.join(dir, 'model.stl');
  writeFileSync(scadPath, scad);
  execFileSync(bin, ['-o', stlPath, scadPath], { stdio: 'ignore', maxBuffer: 1 << 28 });
  return readFileSync(stlPath, 'utf8');
}

/**
 * renderStl() for a program whose EMPTY result is the passing outcome - an intersection probe
 * looking for material that should not be there. OpenSCAD exits 1 and writes no file for an
 * empty top-level object, and that one stderr phrase is the only failure mapped to ''. Every
 * other non-zero exit is re-thrown, so a render that broke for an unrelated reason can never be
 * read as "the probe found nothing".
 */
export function renderStlAllowEmpty(scad: string): string {
  const bin = resolveOpenScad();
  const dir = mkdtempSync(path.join(tmpdir(), 'flute-stl-'));
  const scadPath = path.join(dir, 'model.scad');
  const stlPath = path.join(dir, 'model.stl');
  writeFileSync(scadPath, scad);
  try {
    execFileSync(bin, ['-o', stlPath, scadPath], { stdio: ['ignore', 'ignore', 'pipe'], maxBuffer: 1 << 28 });
  } catch (err) {
    const stderr = String((err as { stderr?: unknown }).stderr ?? '');
    if (/top level object is empty/i.test(stderr)) return '';
    throw new Error(`openscad failed:\n${stderr}`);
  }
  return readFileSync(stlPath, 'utf8');
}

/**
 * Rewrites a generated program so its top-level dispatch is replaced by an intersection of
 * complete_flute() with the three air columns, each grown radially by `grow` and stopped 0.5 mm
 * short of either end. Negative `grow` probes the strict interior: anything returned there is
 * material standing in the player's air column. Positive `grow` reaches past the bore wall and
 * must return the wall ring, which is what proves the probe is looking at the body at all.
 */
export function airColumnProbe(bodyScad: string, grow: number): string {
  const marker = 'if (num_segments == 1) {';
  const idx = bodyScad.indexOf(marker);
  if (idx < 0) throw new Error('airColumnProbe: the top-level dispatch moved');
  return `${bodyScad.slice(0, idx)}
probe_grow = ${grow};
probe_end = 0.5;
intersection() {
    complete_flute();
    for (pipe = [[-spacing, bore_drone1], [0, bore_melody], [spacing, bore_drone2]])
        translate([pipe[0], 0, probe_end])
            cylinder(d=pipe[1] + 2*probe_grow, h=fipple_z - 2*probe_end, $fn=24);
}
`;
}

export interface MeshParity { triangles: number; edges: number; nonManifoldEdges: number; }

/**
 * Edge parity on a closed surface: every undirected edge of a watertight manifold is shared by
 * exactly two triangles. Vertices are quantized to 1e-4 mm before matching, because OpenSCAD
 * prints the same corner with different rounding in different facets and an exact string match
 * would split one vertex into several and HIDE the very defect this looks for.
 */
export function meshParity(stl: string): MeshParity {
  const verts: string[] = [];
  for (const line of stl.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('vertex ')) continue;
    const p = t.split(/\s+/);
    verts.push(`${(+p[1]).toFixed(4)},${(+p[2]).toFixed(4)},${(+p[3]).toFixed(4)}`);
  }
  const edges = new Map<string, number>();
  for (let i = 0; i + 2 < verts.length; i += 3) {
    const tri = [verts[i], verts[i + 1], verts[i + 2]];
    for (let k = 0; k < 3; k++) {
      const a = tri[k], b = tri[(k + 1) % 3];
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  let bad = 0;
  for (const count of edges.values()) if (count !== 2) bad++;
  return { triangles: verts.length / 3, edges: edges.size, nonManifoldEdges: bad };
}

// ------------------------------------------------------------------------------------------
// Per-worker geometry memo.
//
// solveHoleGeometryCached() clears its own map past 64 entries, so a file that sweeps all 168
// configurations more than once pays for every solve again. This memo is unbounded and lives
// for the worker, which turns a three-pass sweep from ~25 s into ~8 s.

const GEOM_MEMO = new Map<string, FluteGeometry>();

export function geomOnce(root: number, scale: string, holes: number): FluteGeometry {
  const key = `${root}|${scale}|${holes}`;
  let g = GEOM_MEMO.get(key);
  if (!g) { g = computeFluteGeometry(root, scale, holes); GEOM_MEMO.set(key, g); }
  return g;
}
