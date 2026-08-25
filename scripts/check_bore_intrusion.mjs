// Bore-intrusion check.
//
// Renders the shipped solid intersected with the strict interior of each air column. A flute
// whose bore is unobstructed produces an EMPTY solid here; anything the intersection returns is
// material standing inside the air column of the printed instrument.
//
// The cutter is 0.05 mm SMALLER in radius than the bore and stops 0.5 mm short of each end, so a
// surface that merely touches the bore wall is not counted. Only real intrusion is.
//
// Usage: node scripts/check_bore_intrusion.mjs [--full] [--jobs N]

import { execFileSync } from 'node:child_process';
import { accessSync, constants, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function resolveOpenScad() {
  const candidates = [
    process.env.OPENSCAD,
    '/opt/homebrew/bin/openscad',
    '/usr/local/bin/openscad',
    '/Applications/OpenSCAD.app/Contents/MacOS/OpenSCAD',
    '/usr/bin/openscad'
  ].filter((c) => typeof c === 'string' && c.length > 0);
  for (const c of candidates) {
    try { accessSync(c, constants.X_OK); return c; } catch { /* next */ }
  }
  throw new Error('No OpenSCAD binary found; tried:\n  ' + candidates.join('\n  '));
}

const BIN = resolveOpenScad();

/**
 * Renders and returns the STL text. An EMPTY intersection is the passing outcome of this probe,
 * and OpenSCAD exits 1 without writing a file for it ("Current top level object is empty"). That
 * one stderr phrase is the only failure this maps to a result; every other non-zero exit is
 * re-thrown, so a render that broke for an unrelated reason can never be read as a clean bore.
 */
function renderStl(scad) {
  const dir = mkdtempSync(path.join(tmpdir(), 'flute-bore-'));
  try {
    const scadPath = path.join(dir, 'model.scad');
    const stlPath = path.join(dir, 'model.stl');
    writeFileSync(scadPath, scad);
    try {
      execFileSync(BIN, ['-o', stlPath, scadPath], { stdio: ['ignore', 'ignore', 'pipe'], maxBuffer: 1 << 28 });
    } catch (err) {
      const stderr = String(err.stderr ?? '');
      if (/top level object is empty/i.test(stderr)) return '';
      throw new Error(`openscad failed (status ${err.status}):\n${stderr}`);
    }
    return readFileSync(stlPath, 'utf8');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function volumeAndTris(stl) {
  const v = [];
  for (const line of stl.split('\n')) {
    const t = line.trim();
    if (t.startsWith('vertex ')) { const p = t.split(/\s+/); v.push([+p[1], +p[2], +p[3]]); }
  }
  let sum = 0;
  for (let i = 0; i + 2 < v.length; i += 3) {
    const [a, b, c] = [v[i], v[i + 1], v[i + 2]];
    sum += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  }
  return { triangles: v.length / 3, volume: Math.abs(sum) };
}

/** The probe program: the shipped solid, intersected with the strict interior of the air columns. */
export function probeScad(bodyScad, grow) {
  // Replace the trailing top-level dispatch with our own intersection so we measure the same
  // complete_flute() the exporter ships, not a re-modelled copy of it.
  const marker = 'if (num_segments == 1) {';
  const idx = bodyScad.indexOf(marker);
  if (idx < 0) throw new Error('probe: could not find the top-level dispatch');
  const head = bodyScad.slice(0, idx);
  return `${head}
probe_grow = ${grow};
probe_end = 0.5;
intersection() {
    complete_flute();
    union() {
        translate([0, 0, probe_end])
            cylinder(d=bore_melody + 2*probe_grow, h=fipple_z - 2*probe_end, $fn=24);
        translate([-spacing, 0, probe_end])
            cylinder(d=bore_drone1 + 2*probe_grow, h=fipple_z - 2*probe_end, $fn=24);
        translate([spacing, 0, probe_end])
            cylinder(d=bore_drone2 + 2*probe_grow, h=fipple_z - 2*probe_end, $fn=24);
    }
}
`;
}

const ROOTS = [36, 50, 60, 69, 72, 86];
const SCALES = ['hijaz', 'native_american', 'minor_pentatonic', 'major_pentatonic', 'dorian', 'major', 'natural_minor'];
const HOLES = [4, 5, 6, 7];
const SHELLS = ['staggered', 'unified'];
const KEYWORK = ['none', 'keys_low', 'keys_all'];

function cases(full) {
  const out = [];
  if (full) {
    for (const root of ROOTS) for (const scale of SCALES) for (const holes of HOLES) {
      for (const shell of SHELLS) for (const kw of KEYWORK) out.push({ root, scale, holes, shell, kw });
    }
    return out;
  }
  // A spread: every root x every scale x every hole count x every shell x every keywork mode
  // appears, without the 1008-cell product.
  let i = 0;
  for (const root of ROOTS) for (const scale of SCALES) {
    for (const shell of SHELLS) for (const kw of KEYWORK) {
      out.push({ root, scale, holes: HOLES[i % HOLES.length], shell, kw });
      i++;
    }
  }
  return out;
}

const args = process.argv.slice(2);
const full = args.includes('--full');
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;

const { build } = await import('esbuild');
const bundle = path.join(mkdtempSync(path.join(tmpdir(), 'flute-bundle-')), 'node-domain.mjs');
await build({
  entryPoints: [path.join(ROOT, 'src/web/testkit/node-entry.ts')],
  outfile: bundle, bundle: true, format: 'esm', platform: 'node', target: 'node20', logLevel: 'warning'
});
const { generateScadJs } = await import(pathToFileURL(bundle).href + '?t=' + Date.now());

let list = cases(full);
if (only) {
  const [r, s, h, shell, kw] = only.split('/');
  list = [{ root: +r, scale: s, holes: +h, shell: shell ?? 'staggered', kw: kw ?? 'keys_all' }];
}

let bad = 0;
let blind = 0;
for (const c of list) {
  const scad = generateScadJs(c.root, c.scale, c.holes, 'sac', 2.8, 3.3, 1, 'assembled', 0.18, 14.0,
    0, 7, c.shell, c.kw, 'tpu');
  // -0.05: the strict interior of the air column. Material here is a real obstruction.
  const m = volumeAndTris(renderStl(probeScad(scad, -0.05)));
  // +1.0: the same probe grown past the bore wall, which MUST return the wall ring. If this one
  // comes back empty the probe is not seeing the body at all, and the clean result above would
  // be blind rather than true. Reported per configuration, not assumed once.
  const ctl = volumeAndTris(renderStl(probeScad(scad, 1.0)));
  const clean = m.triangles === 0;
  const live = ctl.triangles > 0;
  if (!clean) bad++;
  if (!live) blind++;
  const verdict = !live ? 'BLIND' : clean ? 'CLEAN' : 'INTRUDES';
  process.stdout.write(`${verdict}\t${c.root}/${c.scale}/${c.holes}/${c.shell}/${c.kw}`
    + `\ttris=${m.triangles}\tvol=${m.volume.toFixed(3)} mm^3\tprobe_live_tris=${ctl.triangles}\n`);
}
process.stdout.write(`\n${list.length} configurations checked, ${bad} with bore intrusion, ${blind} where the probe saw nothing.\n`);
process.exitCode = bad === 0 && blind === 0 ? 0 : 1;
