// Category 4 - SCAD golden files.
//
// generateScadJs() is authoritative for the 3D preview, the STL renders, the ZIP and the .scad
// download. Any change to any of them therefore shows up here as a diff against a checked-in
// file, and updating a golden is an explicit act (`npx vitest run -u`), not a silent drift.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { generateScadJs, lastChimneyDisplayScad, lastTpuGasketsScad } from '../src/web/cad/scad.js';

const GOLDEN_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'golden');

interface ScadCase {
  name: string;
  root: number; scale: string; holes: number; profile: string;
  chimneyDepth?: number; rimThickness?: number;
  segments?: number; printPart?: string;
  jointTol?: number; jointLen?: number;
  drone1?: number; drone2?: number;
  shell?: string; keywork?: string; pad?: string;
}

// Chosen so that every axis the generator branches on is exercised, and so that no two cases
// collapse onto the same instrument. `minor_pentatonic` is deliberately NOT used to separate a
// 6-hole case from a 7-hole one: it supplies only five rising degrees, so both clamp to the same
// five holes and would hash identically while looking like two distinct cases.
const CASES: ScadCase[] = [
  { name: 'a4-hijaz-6-sac-default', root: 69, scale: 'hijaz', holes: 6, profile: 'sac' },
  { name: 'c2-natural-minor-7-flat-unified', root: 36, scale: 'natural_minor', holes: 7, profile: 'flat', shell: 'unified' },
  { name: 'd6-major-4-venturi', root: 86, scale: 'major', holes: 4, profile: 'venturi' },
  { name: 'c5-dorian-6-arched-3seg-assembled', root: 72, scale: 'dorian', holes: 6, profile: 'arched', segments: 3, printPart: 'assembled' },
  { name: 'c5-dorian-6-arched-3seg-part2', root: 72, scale: 'dorian', holes: 6, profile: 'arched', segments: 3, printPart: 'part_2' },
  { name: 'c4-major-7-sac-4seg-part4', root: 60, scale: 'major', holes: 7, profile: 'sac', segments: 4, printPart: 'part_4', jointTol: 0.30, jointLen: 18.0 },
  { name: 'd3-hijaz-5-sac-keys-all', root: 50, scale: 'hijaz', holes: 5, profile: 'sac', keywork: 'keys_all', pad: 'silicone' },
  { name: 'a4-native-american-6-sac-keys-low', root: 69, scale: 'native_american', holes: 6, profile: 'sac', keywork: 'keys_low' },
  { name: 'a4-major-pentatonic-5-sac-subbass-drones', root: 69, scale: 'major_pentatonic', holes: 5, profile: 'sac', drone1: -12, drone2: -12 },
  { name: 'a4-hijaz-6-sac-wide-chimney', root: 69, scale: 'hijaz', holes: 6, profile: 'sac', chimneyDepth: 5.0, rimThickness: 6.0 }
];

function generate(c: ScadCase): string {
  return generateScadJs(
    c.root, c.scale, c.holes, c.profile,
    c.chimneyDepth ?? 2.8, c.rimThickness ?? 3.3,
    c.segments ?? 1, c.printPart ?? 'assembled',
    c.jointTol ?? 0.18, c.jointLen ?? 14.0,
    c.drone1 ?? 0, c.drone2 ?? 7,
    c.shell ?? 'staggered', c.keywork ?? 'none', c.pad ?? 'tpu'
  );
}

describe('SCAD golden files', () => {
  for (const c of CASES) {
    it(c.name, async () => {
      await expect(generate(c)).toMatchFileSnapshot(path.join(GOLDEN_DIR, `${c.name}.scad`));
    });
  }

  it('the two side-channel programs are pinned too', async () => {
    // lastTpuGasketsScad and lastChimneyDisplayScad are module-level outputs of the last call,
    // read by the ZIP exporter and the 3D viewer. They are generated but never asserted
    // anywhere else, so they are captured right after the call that produces them.
    generate(CASES.find((c) => c.name === 'd3-hijaz-5-sac-keys-all') as ScadCase);
    await expect(lastTpuGasketsScad).toMatchFileSnapshot(path.join(GOLDEN_DIR, 'side-tpu-gaskets.scad'));
    await expect(lastChimneyDisplayScad).toMatchFileSnapshot(path.join(GOLDEN_DIR, 'side-chimney-display.scad'));
  });

  it('no two golden cases describe the same program', () => {
    // Guards against a blind control: two cases that differ on paper but clamp to the same
    // instrument would both pass while testing one thing.
    const byText = new Map<string, string>();
    for (const c of CASES) {
      const text = generate(c);
      const seen = byText.get(text);
      expect(seen, `${c.name} is byte-identical to ${seen}`).toBeUndefined();
      byText.set(text, c.name);
    }
    expect(byText.size).toBe(CASES.length);
  });

  it('a half-millimetre move of one tone hole is visible in the output', () => {
    // Proves the golden files are sensitive to the quantity they exist to protect. The SCAD
    // prints hole z to two decimals, so a 0.5 mm shift is far above the print resolution.
    const scad = generate(CASES[0]);
    const zs = Array.from(scad.matchAll(/translate\(\[0, 0, (-?[0-9.]+)\]\) rotate\(\[-90, 0, 0\]\) cylinder\(d=/g)).map((m) => m[1]);
    expect(zs.length).toBe(6);
    const shifted = scad.replace(`translate([0, 0, ${zs[0]}]) rotate([-90, 0, 0]) cylinder(d=`,
      `translate([0, 0, ${(parseFloat(zs[0]) + 0.5).toFixed(2)}]) rotate([-90, 0, 0]) cylinder(d=`);
    expect(shifted).not.toBe(scad);
  });
});
