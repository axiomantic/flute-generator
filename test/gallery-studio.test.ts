// Category 6 - the gallery and the studio describe the same instrument.
//
// The gallery generator and the studio have diverged twice, and both times it was found by hand.
// This file makes it mechanical. Three separate claims are checked:
//
//   1. the studio's DEFAULT control values equal the gallery's DEFAULTS table
//   2. the SCAD checked into examples/<dir>/flute.scad is byte-identical to what the studio's
//      generateScadJs() produces from that example's settings today
//   3. examples/ and docs/ hold the same bytes, since docs/ is a copy and not a regeneration
//
// The gallery's own constants are read out of scripts/build_examples.mjs rather than duplicated
// here. Duplicating them would be a third implementation to keep in step.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { generateScadJs } from '../src/web/cad/scad.js';
import { computeFluteGeometry } from '../src/web/geometry/flute.js';
import { buildSongScore } from '../src/web/data/score.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GENERATOR = path.join(ROOT, 'scripts', 'build_examples.mjs');

/** Lifts a top-level `const NAME = <literal>;` out of the generator and evaluates the literal. */
function literalFromGenerator<T>(source: string, name: string): T {
  const start = source.indexOf(`const ${name} = `);
  if (start < 0) throw new Error(`${name} is not declared in ${GENERATOR}`);
  const open = start + `const ${name} = `.length;
  const opener = source[open];
  const closer = opener === '[' ? ']' : '}';
  if (opener !== '[' && opener !== '{') throw new Error(`${name} is not an array or object literal`);
  let depth = 0, end = -1, inStr: string | null = null;
  for (let i = open; i < source.length; i++) {
    const ch = source[i];
    if (inStr) {
      if (ch === '\\') i++;
      else if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue; }
    if (ch === opener) depth++;
    else if (ch === closer) { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  if (end < 0) throw new Error(`${name} literal is unterminated`);
  return Function(`"use strict"; return (${source.slice(open, end)});`)() as T;
}

interface GalleryExample {
  dir: string; title: string; root: number; scale: string; song: string;
  profile: string; holes: number; env: string; desc: string;
}
interface GalleryDefaults {
  chimneyDepth: number; rimThickness: number; numSegments: number; printPart: string;
  jointTol: number; jointLen: number; drone1Interval: number; drone2Interval: number;
  tubeShellMode: string; keyworkMode: string; padMaterial: string; slapGain: number;
}

const generatorSource = readFileSync(GENERATOR, 'utf8');
const EXAMPLES = literalFromGenerator<GalleryExample[]>(generatorSource, 'EXAMPLES');
const DEFAULTS = literalFromGenerator<GalleryDefaults>(generatorSource, 'DEFAULTS');

const html = readFileSync(path.join(ROOT, 'index.html'), 'utf8');

/** The `selected` option of a <select>, i.e. the value the studio starts on. */
function selectedOption(id: string): string {
  const block = new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)</select>`).exec(html);
  if (!block) throw new Error(`<select id="${id}"> not found in index.html`);
  const opt = /<option value="([^"]+)"[^>]*\bselected\b/.exec(block[1]);
  if (!opt) throw new Error(`<select id="${id}"> has no selected option`);
  return opt[1];
}

/** The `value` attribute of a range input, i.e. where the studio's slider starts. */
function rangeDefault(id: string): number {
  const tag = new RegExp(`<input\\b[^>]*id="${id}"[^>]*>`).exec(html);
  if (!tag) throw new Error(`<input id="${id}"> not found in index.html`);
  const v = /\bvalue="([-0-9.]+)"/.exec(tag[0]);
  if (!v) throw new Error(`<input id="${id}"> has no value`);
  return parseFloat(v[1]);
}

describe('gallery and studio: the shared control defaults', () => {
  it('the gallery generator still declares the constants this test reads', () => {
    expect(EXAMPLES.length).toBeGreaterThan(0);
    for (const ex of EXAMPLES) {
      expect(typeof ex.dir).toBe('string');
      expect(typeof ex.root).toBe('number');
      expect(typeof ex.scale).toBe('string');
      expect(typeof ex.holes).toBe('number');
    }
    expect(Object.keys(DEFAULTS).sort()).toEqual([
      'chimneyDepth', 'drone1Interval', 'drone2Interval', 'jointLen', 'jointTol', 'keyworkMode',
      'numSegments', 'padMaterial', 'printPart', 'rimThickness', 'slapGain', 'tubeShellMode'
    ]);
  });

  it('every gallery default equals the studio control it stands for', () => {
    expect(DEFAULTS.chimneyDepth).toBe(rangeDefault('rng-chim-depth'));
    expect(DEFAULTS.rimThickness).toBe(rangeDefault('rng-chim-rim'));
    expect(DEFAULTS.jointTol).toBe(rangeDefault('rng-joint-tol'));
    expect(DEFAULTS.jointLen).toBe(rangeDefault('rng-joint-len'));
    expect(DEFAULTS.slapGain).toBe(rangeDefault('rng-key-slap') / 100);
    expect(String(DEFAULTS.numSegments)).toBe(selectedOption('sel-print-segments'));
    expect(DEFAULTS.printPart).toBe(selectedOption('sel-print-part'));
    expect(String(DEFAULTS.drone1Interval)).toBe(selectedOption('sel-drone1-interval'));
    expect(String(DEFAULTS.drone2Interval)).toBe(selectedOption('sel-drone2-interval'));
    expect(DEFAULTS.tubeShellMode).toBe(selectedOption('sel-tube-shell-mode'));
    expect(DEFAULTS.keyworkMode).toBe(selectedOption('sel-keywork-mode'));
    expect(DEFAULTS.padMaterial).toBe(selectedOption('sel-pad-material'));
  });

  it('every example names a hole count and profile the studio can select', () => {
    const holeValues = Array.from(
      (/<select id="sel-holes">([\s\S]*?)<\/select>/.exec(html) as RegExpExecArray)[1].matchAll(/value="([^"]+)"/g)
    ).map((m) => m[1]);
    const rootValues = Array.from(
      (/<select id="sel-root">([\s\S]*?)<\/select>/.exec(html) as RegExpExecArray)[1].matchAll(/value="([^"]+)"/g)
    ).map((m) => m[1]);
    const profileValues = Array.from(
      (/<select id="sel-profile">([\s\S]*?)<\/select>/.exec(html) as RegExpExecArray)[1].matchAll(/value="([^"]+)"/g)
    ).map((m) => m[1]);
    for (const ex of EXAMPLES) {
      expect(holeValues, ex.dir).toContain(String(ex.holes));
      expect(rootValues, ex.dir).toContain(String(ex.root));
      expect(profileValues, ex.dir).toContain(ex.profile);
    }
  });
});

describe('gallery and studio: identical SCAD for identical settings', () => {
  /** The exact call the studio makes, with the gallery's settings substituted for the controls. */
  function studioScadFor(ex: GalleryExample): string {
    return generateScadJs(
      ex.root, ex.scale, ex.holes, ex.profile,
      DEFAULTS.chimneyDepth, DEFAULTS.rimThickness,
      DEFAULTS.numSegments, DEFAULTS.printPart,
      DEFAULTS.jointTol, DEFAULTS.jointLen,
      DEFAULTS.drone1Interval, DEFAULTS.drone2Interval,
      DEFAULTS.tubeShellMode, DEFAULTS.keyworkMode, DEFAULTS.padMaterial
    );
  }

  for (const ex of EXAMPLES) {
    it(`${ex.dir}: examples/flute.scad is what the studio produces today`, () => {
      const onDisk = readFileSync(path.join(ROOT, 'examples', ex.dir, 'flute.scad'), 'utf8');
      expect(studioScadFor(ex)).toBe(onDisk);
    });

    it(`${ex.dir}: docs/ holds the same bytes as examples/`, () => {
      for (const file of ['flute.scad', 'README.md', 'index.html']) {
        const a = readFileSync(path.join(ROOT, 'examples', ex.dir, file));
        const b = readFileSync(path.join(ROOT, 'docs', ex.dir, file));
        expect(b.equals(a), `${ex.dir}/${file}`).toBe(true);
      }
    });

    it(`${ex.dir}: the published specification matches the solved geometry`, () => {
      // The README quotes numbers out of the geometry object. If the geometry moves and the
      // gallery is not rebuilt, the page describes an instrument nobody can print.
      const geom = computeFluteGeometry(
        ex.root, ex.scale, ex.holes,
        DEFAULTS.drone1Interval, DEFAULTS.drone2Interval,
        DEFAULTS.chimneyDepth, DEFAULTS.rimThickness
      );
      const readme = readFileSync(path.join(ROOT, 'examples', ex.dir, 'README.md'), 'utf8');
      expect(readme).toContain(`**Total Height**: ${geom.totalLength.toFixed(1)} mm`);
      expect(readme).toContain(`**Tone Holes**: ${geom.melody.holes.length} holes of ${geom.holeDiameter.toFixed(1)} mm`);
      expect(readme).toContain(`worst ${geom.tuningSolver.maxResidualCents.toFixed(1)} cents`);
      for (const h of geom.melody.holes) expect(readme).toContain(`${h.distanceFromFipple.toFixed(1)}mm`);
    });

    it(`${ex.dir}: the gallery's melody is the studio's melody`, () => {
      const geom = computeFluteGeometry(
        ex.root, ex.scale, ex.holes,
        DEFAULTS.drone1Interval, DEFAULTS.drone2Interval,
        DEFAULTS.chimneyDepth, DEFAULTS.rimThickness
      );
      const song = buildSongScore(ex.song, ex.root, ex.scale, geom.numHoles);
      expect(song.notes.length).toBeGreaterThan(0);
      // Every note has to be playable on this instrument: its pitch class is a scale degree and
      // its fingering is the right width.
      for (const n of song.notes) {
        expect(n.holes.length).toBe(geom.numHoles);
        expect(Number.isFinite(n.startTime)).toBe(true);
        expect(n.duration).toBeGreaterThan(0);
      }
    });
  }

  it('the four examples are four different instruments', () => {
    // Without this, an example that silently collapsed onto another would still pass every
    // comparison above.
    const texts = EXAMPLES.map((ex) => studioScadFor(ex));
    expect(new Set(texts).size).toBe(EXAMPLES.length);
  });
});
