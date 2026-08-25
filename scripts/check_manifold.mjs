// Edge-parity sweep over the configuration space.
//
// Every undirected edge of a closed, watertight surface belongs to exactly two triangles. The
// vitest suite pins a couple of dozen rows of this; this sweeps the whole product so a change can
// be shown not to have re-opened the family of coincident-surface defects the rows were found by.
//
// Usage: node scripts/check_manifold.mjs [--shells staggered,unified]

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

function renderStl(scad) {
  const dir = mkdtempSync(path.join(tmpdir(), 'flute-mani-'));
  try {
    const scadPath = path.join(dir, 'model.scad');
    const stlPath = path.join(dir, 'model.stl');
    writeFileSync(scadPath, scad);
    execFileSync(BIN, ['-o', stlPath, scadPath], { stdio: ['ignore', 'ignore', 'pipe'], maxBuffer: 1 << 28 });
    return readFileSync(stlPath, 'utf8');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The same measurement test/helpers.ts meshParity() makes, at the same 1e-4 mm quantization. */
function meshParity(stl) {
  const verts = [];
  for (const line of stl.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('vertex ')) continue;
    const p = t.split(/\s+/);
    verts.push(`${(+p[1]).toFixed(4)},${(+p[2]).toFixed(4)},${(+p[3]).toFixed(4)}`);
  }
  const edges = new Map();
  for (let i = 0; i + 2 < verts.length; i += 3) {
    const tri = [verts[i], verts[i + 1], verts[i + 2]];
    for (let k = 0; k < 3; k++) {
      const a = tri[k], b = tri[(k + 1) % 3];
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  let bad = 0;
  for (const n of edges.values()) if (n !== 2) bad++;
  return { triangles: verts.length / 3, edges: edges.size, nonManifoldEdges: bad };
}

const ROOTS = [36, 50, 60, 69, 72, 86];
const SCALES = ['hijaz', 'native_american', 'minor_pentatonic', 'major_pentatonic', 'dorian', 'major', 'natural_minor'];
const HOLES = [4, 5, 6, 7];
const KEYWORK = ['none', 'keys_low', 'keys_all'];

const args = process.argv.slice(2);
const shellArg = args.includes('--shells') ? args[args.indexOf('--shells') + 1] : 'staggered';
const SHELL_MODES = shellArg.split(',');

const { build } = await import('esbuild');
const bundle = path.join(mkdtempSync(path.join(tmpdir(), 'flute-bundle-')), 'node-domain.mjs');
await build({
  entryPoints: [path.join(ROOT, 'src/web/testkit/node-entry.ts')],
  outfile: bundle, bundle: true, format: 'esm', platform: 'node', target: 'node20', logLevel: 'warning'
});
const domain = await import(pathToFileURL(bundle).href + '?t=' + Date.now());

let bad = 0;
let n = 0;
for (const shell of SHELL_MODES) for (const root of ROOTS) for (const scale of SCALES) {
  for (const holes of HOLES) for (const kw of KEYWORK) {
    const scad = domain.generateScadJs(root, scale, holes, 'sac', 2.8, 3.3, 1, 'assembled', 0.18,
      14.0, 0, 7, shell, kw, 'tpu');
    const m = meshParity(renderStl(scad));
    n++;
    if (m.nonManifoldEdges !== 0 || m.triangles < 1000) {
      bad++;
      process.stdout.write(`BAD\t${root}/${scale}/${holes}/${shell}/${kw}`
        + `\ttris=${m.triangles}\tedges=${m.edges}\tnon_manifold=${m.nonManifoldEdges}\n`);
    }
  }
}
process.stdout.write(`\n${n} configurations rendered, ${bad} not watertight.\n`);
process.exitCode = bad === 0 ? 0 : 1;
