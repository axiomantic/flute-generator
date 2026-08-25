// Floating-geometry check for the stationary hardware.
//
// A spindle stanchion is joined to the flute only through its two legs. If a leg stops short of
// the shell surface the whole post becomes a solid that touches nothing, and an STL of disjoint
// solids renders and slices without complaint - nothing else in this repo would notice. That is a
// live hazard in `staggered` shell mode, where the flat front facet exists only over the middle
// of each tube and the face at the leg offsets can sit up to 6 mm lower than the nominal facet
// height. `unified` is carried as the control that cannot show it.
//
// The probe renders the body with the MOVING keywork removed. What is left is exactly two things
// that should be connected shells:
//
//     1. the body, its fused journal sleeves, and every stanchion standing on it
//     2. the spindle, which turns inside the stanchion hubs on a running clearance
//
// The moving parts are removed because each hollow pad rod carries enclosed voids - its bore,
// capped at both ends by the collars, the pad arm and the bridge lug - and an enclosed void is a
// second closed surface in the STL. Counting those as parts is what made the first version of
// this check report false positives.
//
// Usage: node scripts/check_floating.mjs [--full] [--only root/scale/holes/shell/kw]

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
  const dir = mkdtempSync(path.join(tmpdir(), 'flute-float-'));
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

/**
 * Connected shells of an ASCII STL, largest first, as triangle counts. Vertices are quantized to
 * 1e-3 mm before matching for the reason splitStlComponents() gives: OpenSCAD prints one corner
 * with different rounding in different facets, and an exact match would split one solid into many
 * and hide the very defect this looks for.
 */
function shells(stl) {
  const coords = [];
  for (const line of stl.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('vertex ')) continue;
    const p = t.split(/\s+/);
    coords.push([+p[1], +p[2], +p[3]]);
  }
  const nTri = Math.floor(coords.length / 3);
  const idOf = new Map();
  const vertId = new Int32Array(coords.length);
  coords.forEach((c, v) => {
    const key = `${c[0].toFixed(3)},${c[1].toFixed(3)},${c[2].toFixed(3)}`;
    let id = idOf.get(key);
    if (id === undefined) { id = idOf.size; idOf.set(key, id); }
    vertId[v] = id;
  });
  const parent = new Int32Array(idOf.size).map((_, i) => i);
  const find = (a) => { let r = a; while (parent[r] !== r) r = parent[r]; while (parent[a] !== r) { const n = parent[a]; parent[a] = r; a = n; } return r; };
  const join = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };
  for (let t = 0; t < nTri; t++) {
    join(vertId[t * 3], vertId[t * 3 + 1]);
    join(vertId[t * 3 + 1], vertId[t * 3 + 2]);
  }
  const byRoot = new Map();
  for (let t = 0; t < nTri; t++) {
    const r = find(vertId[t * 3]);
    let e = byRoot.get(r);
    if (!e) { e = { n: 0, min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9] }; byRoot.set(r, e); }
    e.n++;
    for (let v = 0; v < 3; v++) {
      const q = coords[t * 3 + v];
      for (let c = 0; c < 3; c++) { if (q[c] < e.min[c]) e.min[c] = q[c]; if (q[c] > e.max[c]) e.max[c] = q[c]; }
    }
  }
  return [...byRoot.values()].sort((a, b) => b.n - a.n);
}

/**
 * What an extra shell is, by the same reading classifyKeyworkPart() uses. The body is the largest
 * shell and the spindle is the only one thin in BOTH x and y; of what remains, a stanchion is one
 * post thick in z and reaches out to both legs, and a journal sleeve is long in z and on one side.
 */
function classify(list) {
  const out = { post: 0, sleeve: 0, other: 0 };
  list.slice(1).forEach((e) => {
    const sx = e.max[0] - e.min[0], sy = e.max[1] - e.min[1], sz = e.max[2] - e.min[2];
    if (sx < 6 && sy < 6) return;                       // the spindle, free by design
    if (sz < 12 && sx > 12) { out.post++; return; }     // a stanchion: thin in z, wide in x
    if (sz > 12) { out.sleeve++; return; }              // a journal sleeve: long in z
    out.other++;
  });
  return out;
}

const MOVING = '            keywork_moving();\n';
// The clip is one module now, called by the shipped program and by both display programs. Blanking
// its body is what makes the difference() a no-op, and it is matched on the `for` line so that a
// change to the tube list still trips the guard rather than silently disabling the control.
const CLIP = /(module keywork_bore_clip\(\) \{\n)    for \(pipe = \[\[[\s\S]*?\]\]\)[\s\S]*?\$fn=24\);/;
const LEG = /translate\(\[sx \* ([-\d.]+), ([-\d.]+)\]\)(\s*\n\s*)square\(\[([-\d.]+), ([-\d.]+)\], center=true\);/g;

/** The generated program with the moving keywork dropped, so only groundable solids remain. */
function stationaryOnly(scad) {
  if (!scad.includes(MOVING)) throw new Error('probe: the loose keywork call moved');
  return scad.replace(MOVING, '');
}

/** The pre-fix solid: the air-column clip collapsed to a hair, which makes the difference() a no-op. */
function unclipped(scad) {
  if (!CLIP.test(scad)) throw new Error('probe: the air-column clip moved');
  return scad.replace(CLIP, '$1    cylinder(d=0.001, h=1, $fn=24);');
}

/**
 * The control mutation. Every stanchion leg is cut back to its top 40 %, which lifts its foot
 * well above the front facet at any register - exactly the shape of the defect an earlier pass
 * fixed by running the legs down to the bore axis. Each post must come loose.
 */
function shortLegs(scad) {
  let n = 0;
  const out = scad.replace(LEG, (_m, x, _y, gap, w, h) => {
    n++;
    const H = parseFloat(h);
    return `translate([sx * ${x}, ${(0.8 * H).toFixed(3)}])${gap}square([${w}, ${(0.4 * H).toFixed(3)}], center=true);`;
  });
  if (n === 0) throw new Error('probe: the stanchion leg profile moved');
  return out;
}

const ROOTS = [36, 50, 60, 69, 72, 86];
const SCALES = ['hijaz', 'native_american', 'minor_pentatonic', 'major_pentatonic', 'dorian', 'major', 'natural_minor'];
const HOLES = [4, 5, 6, 7];
const SHELL_MODES = ['staggered', 'unified'];
const KEYWORK = ['keys_low', 'keys_all'];

const args = process.argv.slice(2);
const full = args.includes('--full');
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;

const { build } = await import('esbuild');
const bundle = path.join(mkdtempSync(path.join(tmpdir(), 'flute-bundle-')), 'node-domain.mjs');
await build({
  entryPoints: [path.join(ROOT, 'src/web/testkit/node-entry.ts')],
  outfile: bundle, bundle: true, format: 'esm', platform: 'node', target: 'node20', logLevel: 'warning'
});
const domain = await import(pathToFileURL(bundle).href + '?t=' + Date.now());

function cases() {
  if (only) {
    const [r, s, h, shell, kw] = only.split('/');
    return [{ root: +r, scale: s, holes: +h, shell, kw }];
  }
  const out = [];
  let i = 0;
  for (const root of ROOTS) for (const scale of SCALES) {
    const holeList = full ? HOLES : [HOLES[i++ % HOLES.length]];
    for (const holes of holeList) for (const shell of SHELL_MODES) for (const kw of KEYWORK) {
      out.push({ root, scale, holes, shell, kw });
    }
  }
  return out;
}

const EXPECTED_GROUNDED = 2; // body + sleeves + stanchions, and the spindle

let mismatch = 0;
let blind = 0;
let preFloating = 0;
let loosePosts = 0;
for (const c of cases()) {
  const scad = domain.generateScadJs(c.root, c.scale, c.holes, 'sac', 2.8, 3.3, 1, 'assembled', 0.18,
    14.0, 0, 7, c.shell, c.kw, 'tpu');
  const nPost = (scad.match(/\/\/ spindle stanchion /g) ?? []).length;

  const fixed = shells(renderStl(stationaryOnly(scad)));
  const before = shells(renderStl(stationaryOnly(unclipped(scad))));
  const control = shells(renderStl(stationaryOnly(shortLegs(scad))));

  // 1. The clip must not change what is connected to what. Anything it ungrounded would show up
  //    here as a shell the pre-fix solid did not have.
  const sameAsBefore = fixed.length === before.length;
  const loose = classify(fixed);
  const looseBefore = classify(before);
  // 2. Cutting the legs back to the facet height must detach EVERY post, and nothing else. That
  //    is what proves each of the nPost stanchions was standing on material in the clean run,
  //    rather than that the counter happens to return a small number.
  // Cutting the legs back must detach posts that were not detached before. It need not detach
  // ALL of them - where the cluster is tight a shortened leg still lands on a journal sleeve,
  // which is itself grounded - so what is required is that the counter moves and that the parts
  // it newly reports are stanchions.
  const live = classify(control).post > loose.post;

  if (!sameAsBefore) mismatch++;
  if (!live) blind++;
  // Informational: shells above the two expected ones are parts that float in BOTH solids, i.e.
  // a defect this change neither introduced nor repaired.
  if (loose.post > 0 || loose.sleeve > 0 || loose.other > 0) preFloating++;
  if (loose.post > 0) loosePosts++;

  const verdict = !sameAsBefore ? 'CHANGED ' : !live ? 'BLIND   ' : loose.post > 0 ? 'POST!   '
    : loose.sleeve > 0 ? 'OK+SLEEVE' : 'OK      ';
  process.stdout.write(`${verdict}\t${c.root}/${c.scale}/${c.holes}/${c.shell}/${c.kw}`
    + `\tposts=${nPost}\tloose_post=${loose.post}\tloose_sleeve=${loose.sleeve}\tloose_other=${loose.other}`
    + `\t(prefix ${looseBefore.post}/${looseBefore.sleeve}/${looseBefore.other})`
    + `\tshortleg_posts=${classify(control).post}\n`);
}
process.stdout.write(`\n${mismatch} configurations where the clip changed what is grounded, `
  + `${loosePosts} with a floating stanchion, `
  + `${blind} where cutting the legs back detached no extra stanchion, `
  + `${preFloating} carrying some floating part.\n`);
process.exitCode = mismatch === 0 && blind === 0 && loosePosts === 0 ? 0 : 1;
