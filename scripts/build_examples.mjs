#!/usr/bin/env node
// Regenerates the showcase gallery under examples/ and its published copy under docs/.
//
//   node scripts/build_examples.mjs            -> every example
//   node scripts/build_examples.mjs 01 03      -> only examples whose directory starts with 01 or 03
//
// Every number the gallery states and every byte of every artifact comes from the modules the
// studio itself runs. Nothing about a flute is computed here:
//
//   geometry + tuning   src/web/geometry/flute.ts   computeFluteGeometry()
//   OpenSCAD source     src/web/cad/scad.ts         generateScadJs()
//   the melody          src/web/data/score.ts       buildSongScore()
//   the audio           src/web/audio/offline-render.ts -> the flute-pipes AudioWorklet
//   the MIDI/WAV bytes  src/web/export/{midi,wav}.ts
//
// This file only orchestrates: it drives OpenSCAD for the mesh and the renders, drives a
// headless browser for the audio (an AudioWorklet needs a real Web Audio implementation), and
// writes the pages. The predecessor, scripts/build_examples.py, was a second implementation of
// the acoustics and it had drifted from the studio by tens of cents.
import { build } from 'esbuild';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { access, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import puppeteer from 'puppeteer';
import { copyVendorTo } from './vendor.mjs';

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXAMPLES_DIR = path.join(ROOT, 'examples');
const DOCS_DIR = path.join(ROOT, 'docs');

// ---------------------------------------------------------------------------------------
// The gallery.
//
// Every field here is a studio control, with one exception. There is no example-only knob:
// anyone can reproduce an example by setting these values in the studio. `holes` is the studio
// default of 6; the geometry solver drops any scale degree that does not rise, so a scale with
// fewer usable degrees simply yields fewer holes and says so in the page.
//
// The exception is `seed`. It is not a studio control: it is what makes this a reproducible
// build. The audio path draws noise for the breath turbulence and for the reverb impulse, and
// unseeded it wrote different flute.wav bytes on every run, so a rebuild dirtied six megabytes
// for no semantic change. The values are arbitrary and only have to stay put; changing one
// rewrites that example's .wav.

const EXAMPLES = [
  {
    dir: '01_native_american_a4_sac',
    seed: 1001,
    title: 'Native American Triple Flute (A4) with Slow Air Chamber (SAC)',
    root: 69,
    scale: 'native_american',
    song: 'native_motif',
    profile: 'sac',
    holes: 6,
    env: 'canyon',
    desc: 'Traditional Native American minor pentatonic triple flute in A4 featuring an internal Slow Air Chamber (SAC) expansion reservoir that smooths breath pressure and produces a warm, velvety acoustic tone with rich drone resonance.'
  },
  {
    dir: '02_desert_caravan_hijaz_venturi',
    seed: 1002,
    title: 'Desert Caravan Middle Eastern Flute (A4) with Venturi Windway',
    root: 69,
    scale: 'hijaz',
    song: 'desert_caravan',
    profile: 'venturi',
    holes: 6,
    env: 'canyon',
    desc: 'Middle Eastern Hijaz scale flute in A4 with a Venturi accelerating windway, which raises jet velocity at the labium for crisp octave voicing over the drone backdrop.'
  },
  {
    dir: '03_baroque_condor_pasa_arched',
    seed: 1003,
    title: 'Andean Condor Pasa Triple Flute (A4) with Arched Baroque Windway',
    root: 69,
    scale: 'minor_pentatonic',
    song: 'condor_pasa',
    profile: 'arched',
    holes: 6,
    env: 'canyon',
    desc: 'Minor pentatonic triple flute in A4 with a crowned arched windway inspired by Baroque recorders, focusing laminar airflow onto the center of the labium for singing upper harmonics.'
  },
  {
    dir: '04_greensleeves_dorian_c5',
    seed: 1004,
    title: 'Renaissance Greensleeves Triple Flute (C5) in Dorian Scale',
    root: 72,
    scale: 'dorian',
    song: 'greensleeves',
    profile: 'flat',
    holes: 6,
    env: 'studio',
    desc: 'High-register C5 triple flute in Dorian modal scale playing Greensleeves with crisp planar windway voicing and a calibrated harmonic fifth drone accompaniment.'
  }
];

/** Studio defaults for every control an example does not name. */
const DEFAULTS = {
  chimneyDepth: 2.8,
  rimThickness: 3.3,
  numSegments: 1,
  printPart: 'assembled',
  jointTol: 0.18,
  jointLen: 14.0,
  drone1Interval: 0,
  drone2Interval: 7,
  tubeShellMode: 'staggered',
  keyworkMode: 'none',
  padMaterial: 'tpu',
  slapGain: 0.65
};

// Camera angles are fixed; the framing is not. The previous generator hard-coded a gaze point
// and a distance, and when the tuning work changed the instrument's length both renders went
// off the model - one showed the three tube tips, the other a flat wall of body. The iso view
// therefore lets OpenSCAD frame the whole solid (--viewall --autocenter), and the detail view
// aims at the fipple z this very geometry reports.
const IMG_SIZE = '1024,1024';

// Both views look at the face the tone holes and the sound windows are cut into.
const FACE_AZIMUTH = 200;

function isoCameraArgs() {
  return [`--camera=0,0,0,58,0,${FACE_AZIMUTH},0`, '--viewall', '--autocenter', `--imgsize=${IMG_SIZE}`];
}

function headCameraArgs(geom) {
  // Level with the sound windows, and far enough back to hold the beak above them in frame.
  const gazeZ = geom.fippleZ - geom.windowLength * 0.5;
  const dist = Math.max(180, geom.tubeSpacing * 8);
  return [`--camera=0,0,${gazeZ.toFixed(2)},80,0,${FACE_AZIMUTH},${dist.toFixed(2)}`, `--imgsize=${IMG_SIZE}`];
}

// ---------------------------------------------------------------------------------------
// Toolchain.

async function resolveOpenScad() {
  const candidates = [
    process.env.OPENSCAD,
    '/opt/homebrew/bin/openscad',
    '/usr/local/bin/openscad',
    '/Applications/OpenSCAD.app/Contents/MacOS/OpenSCAD',
    '/usr/bin/openscad'
  ].filter(Boolean);
  for (const c of candidates) {
    try {
      await access(c, constants.X_OK);
      return c;
    } catch { /* try the next one */ }
  }
  throw new Error(
    'No OpenSCAD binary found. The gallery needs it for flute.stl and the two PNG renders.\n' +
    'Install it (brew install --cask openscad) or set OPENSCAD to its path. Tried:\n  ' +
    candidates.join('\n  ')
  );
}

/** Bundles the pure domain modules for Node and imports them. */
async function loadDomain() {
  const outfile = path.join(ROOT, 'dist', 'node-domain.mjs');
  await build({
    entryPoints: [path.join(ROOT, 'src/web/testkit/node-entry.ts')],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    logLevel: 'warning'
  });
  return import(pathToFileURL(outfile).href + '?t=' + Date.now());
}

/** Serves the repo root, plus one blank page the audio render runs in. */
function startServer() {
  const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    '.wasm': 'application/wasm'
  };
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/__render.html') {
      res.writeHead(200, { 'Content-Type': TYPES['.html'] });
      res.end('<!doctype html><meta charset="utf-8"><title>offline render</title>');
      return;
    }
    // Confined to the repo: a resolved path outside ROOT is refused rather than served.
    const target = path.resolve(ROOT, '.' + decodeURIComponent(url.pathname));
    if (target !== ROOT && !target.startsWith(ROOT + path.sep)) {
      res.writeHead(403); res.end('forbidden'); return;
    }
    try {
      const body = await readFile(target);
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(target)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404); res.end('not found');
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

// ---------------------------------------------------------------------------------------
// Page content.

function specList(ex, geom) {
  const holes = geom.melody.holes;
  const holeStr = holes.map((h) => `${h.distanceFromFipple.toFixed(1)}mm`).join(', ');
  const lines = [
    `- **Root Note**: MIDI ${ex.root}`,
    `- **Musical Scale**: \`${ex.scale}\``,
    `- **Melody Preset**: \`${ex.song}\``,
    `- **Mouthpiece Profile**: \`${ex.profile}\``,
    `- **Drone Intervals**: ${DEFAULTS.drone1Interval} and ${DEFAULTS.drone2Interval} semitones from the root`,
    `- **Total Height**: ${geom.totalLength.toFixed(1)} mm`,
    `- **Melody Tube Length**: ${geom.melody.acousticLength.toFixed(1)} mm (${geom.melody.frequency.toFixed(1)} Hz)`,
    `- **Drone 1 Tube Length**: ${geom.drone1.acousticLength.toFixed(1)} mm (${geom.drone1.frequency.toFixed(1)} Hz)`,
    `- **Drone 2 Tube Length**: ${geom.drone2.acousticLength.toFixed(1)} mm (${geom.drone2.frequency.toFixed(1)} Hz)`,
    `- **Tone Holes**: ${holes.length} holes of ${geom.holeDiameter.toFixed(1)} mm, measured from the fipple (${holeStr})`,
    `- **Tuning Residual**: worst ${geom.tuningSolver.maxResidualCents.toFixed(1)} cents across the solved lattice`
  ];
  if (geom.holeNotice) lines.push(`- **Hole Notice**: ${geom.holeNotice}`);
  if (geom.tuningNotice) lines.push(`- **Tuning Notice**: ${geom.tuningNotice}`);
  return lines.join('\n');
}

function renderReadme(ex, geom) {
  return `# 🪈 ${ex.title}

${ex.desc}

---

## 📸 3D Renderings

| Full Assembly View | Mouthpiece & Beak Detail |
|:---:|:---:|
| ![Full Flute](flute_iso.png) | ![Mouthpiece Detail](flute_head.png) |

---

## 🎧 Audio & MIDI Preview

- 🔊 **Audio Recording (WAV)**: [flute.wav](flute.wav)
- 🎼 **MIDI Sequence**: [flute.mid](flute.mid)
- 📐 **Parametric OpenSCAD Model**: [flute.scad](flute.scad)
- 🖨️ **3D Printable STL**: [flute.stl](flute.stl)

> [!TIP]
> Open [\`index.html\`](index.html) in your web browser for an interactive 3D rotating model viewer with embedded audio playback!

The \`.wav\` is rendered through the studio's own digital waveguide AudioWorklet and its
convolution room reverb, so it is the signal the studio plays for these settings, not a
separate model of it.

---

## 📐 Acoustic & CAD Specifications

${specList(ex, geom)}
`;
}

function renderIndexHtml(ex, geom) {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${esc(ex.title)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #121214; color: #f0f0f5; margin: 0; padding: 24px; display: flex; flex-direction: column; align-items: center; }
    .container { max-width: 960px; width: 100%; background: #1e1e24; border-radius: 16px; padding: 28px; box-shadow: 0 12px 32px rgba(0,0,0,0.5); }
    h1 { margin-top: 0; font-size: 1.6rem; color: #e2e8f0; }
    p { color: #94a3b8; line-height: 1.6; }
    .player-card { background: #282832; padding: 18px 24px; border-radius: 12px; margin: 20px 0; display: flex; align-items: center; gap: 20px; border: 1px solid #3e3e4f; }
    audio { width: 100%; filter: invert(0.9) hue-rotate(180deg); }
    #viewport { width: 100%; height: 500px; background: radial-gradient(circle, #2d3748 0%, #1a202c 100%); border-radius: 12px; overflow: hidden; position: relative; }
    .badge { display: inline-block; padding: 4px 10px; background: #3b82f6; color: white; border-radius: 6px; font-size: 0.8rem; font-weight: 600; margin-right: 8px; }
    .specs { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; margin-top: 20px; }
    .spec-box { background: #282832; padding: 14px; border-radius: 10px; border-left: 4px solid #3b82f6; }
    .spec-box span { display: block; font-size: 0.75rem; color: #94a3b8; text-transform: uppercase; }
    .spec-box strong { font-size: 1.1rem; color: #f8fafc; }
  </style>
  <!-- Checked in under vendor/, not fetched from a CDN: the page has to work offline and under a
       script-src 'self' policy, and the gallery build has to work with no network. This build
       mirrors vendor/ next to the pages, so ../vendor/ resolves from examples/ and from docs/.
       See vendor/README.md for versions and hashes. -->
  <script src="../vendor/three.min.js"></script>
  <script src="../vendor/STLLoader.js"></script>
  <script src="../vendor/OrbitControls.js"></script>
</head>
<body>
  <div class="container">
    <h1>🪈 ${esc(ex.title)}</h1>
    <p>${esc(ex.desc)}</p>

    <div class="player-card">
      <span class="badge">AUDIO PREVIEW</span>
      <audio controls loop src="flute.wav"></audio>
    </div>

    <h3>Interactive 3D Model (Click &amp; Drag to Rotate / Scroll to Zoom)</h3>
    <div id="viewport"></div>

    <div class="specs">
      <div class="spec-box"><span>Root Pitch</span><strong>MIDI ${ex.root} (${geom.melody.frequency.toFixed(1)} Hz)</strong></div>
      <div class="spec-box"><span>Musical Scale</span><strong>${esc(ex.scale)}</strong></div>
      <div class="spec-box"><span>Mouthpiece Profile</span><strong>${esc(ex.profile.toUpperCase())}</strong></div>
      <div class="spec-box"><span>Tone Holes</span><strong>${geom.melody.holes.length} &times; ${geom.holeDiameter.toFixed(1)} mm</strong></div>
      <div class="spec-box"><span>Total Length</span><strong>${geom.totalLength.toFixed(1)} mm</strong></div>
    </div>
  </div>

  <script>
    const container = document.getElementById('viewport');
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 1, 2000);
    camera.position.set(0, -350, 200);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));

    const dirLight1 = new THREE.DirectionalLight(0xfff5ea, 0.9);
    dirLight1.position.set(150, -200, 300);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xdbeafe, 0.5);
    dirLight2.position.set(-150, 200, -100);
    scene.add(dirLight2);

    const loader = new THREE.STLLoader();
    loader.load('flute.stl', function (geometry) {
      geometry.computeVertexNormals();
      geometry.center();
      const material = new THREE.MeshStandardMaterial({ color: 0xdeb887, roughness: 0.35, metalness: 0.15 });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.rotation.x = -Math.PI / 2;
      scene.add(mesh);
    });

    function animate() {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    window.addEventListener('resize', () => {
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    });
  </script>
</body>
</html>
`;
}

function renderGalleryReadme(entries) {
  const sections = entries.map(({ ex, geom }, i) => {
    const scaleList = '`[' + geom.scaleIntervals.join(', ') + ']`';
    return `### ${i + 1}. [${ex.title}](${ex.dir}/)
- **Scale**: ${ex.scale} (${scaleList})
- **Melody**: \`${ex.song}\`
- **Mouthpiece**: \`${ex.profile}\`
- **Instrument**: ${geom.melody.holes.length} tone holes of ${geom.holeDiameter.toFixed(1)} mm, ${geom.totalLength.toFixed(1)} mm tall, sounding ${geom.melody.frequency.toFixed(1)} Hz with all holes closed
- 🔗 **[Explore Example & Interactive 3D Model](${ex.dir}/)**`;
  }).join('\n\n');

  return `# 🪈 Flute Generator Examples & Showcase Gallery

A gallery of multi-drone flutes demonstrating various acoustic scales, melodies, and specialized mouthpiece designs.

Each example directory includes:
- 📸 **3D CAD Renders** (\`flute_iso.png\`, \`flute_head.png\`)
- 🔊 **Synthesized Audio** (\`flute.wav\`)
- 🎼 **MIDI Sequence** (\`flute.mid\`)
- 📐 **Parametric OpenSCAD Model** (\`flute.scad\`)
- 🖨️ **3D-Printable Mesh** (\`flute.stl\`)
- 🌐 **Interactive 3D Web Viewer & Player** (\`index.html\`)

Every example is a set of studio controls and nothing else. The dimensions, the OpenSCAD
source, the mesh and the audio all come from the modules the studio runs, so an example can be
reproduced by entering the settings listed under it.

---

## 🌟 Showcase Gallery

${sections}

---

## 🛠️ Rebuilding All Examples

Requires [OpenSCAD](https://openscad.org/) on the PATH (or \`OPENSCAD\` pointing at it) for the
mesh and the two renders, and a Chromium that Puppeteer can launch for the audio.

\`\`\`bash
npm install
npm run build:examples
\`\`\`
`;
}

// ---------------------------------------------------------------------------------------

async function main() {
  const filters = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const selected = filters.length
    ? EXAMPLES.filter((ex) => filters.some((f) => ex.dir.startsWith(f)))
    : EXAMPLES;
  if (selected.length === 0) throw new Error(`no example matches ${filters.join(', ')}`);

  const openscad = await resolveOpenScad();
  const { stdout: version } = await execFileAsync(openscad, ['--version']).catch((e) => ({ stdout: e.stderr || '' }));
  console.log(`OpenSCAD: ${openscad} (${version.trim() || 'version unknown'})`);

  const domain = await loadDomain();
  const { server, port } = await startServer();
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--autoplay-policy=no-user-gesture-required']
  });

  const entries = [];
  try {
    const page = await browser.newPage();
    page.on('pageerror', (err) => console.error(`  [pageerror] ${err.message}`));
    await page.goto(`http://127.0.0.1:${port}/__render.html`, { waitUntil: 'load' });

    for (const ex of selected) {
      const dir = path.join(EXAMPLES_DIR, ex.dir);
      console.log(`\n=== ${ex.title}`);
      await mkdir(dir, { recursive: true });

      const geom = domain.computeFluteGeometry(
        ex.root, ex.scale, ex.holes,
        DEFAULTS.drone1Interval, DEFAULTS.drone2Interval,
        DEFAULTS.chimneyDepth, DEFAULTS.rimThickness
      );
      console.log(`  ${geom.melody.holes.length} holes of ${geom.holeDiameter.toFixed(2)} mm, ${geom.totalLength.toFixed(1)} mm tall`);

      const scadPath = path.join(dir, 'flute.scad');
      const scad = domain.generateScadJs(
        ex.root, ex.scale, ex.holes, ex.profile,
        DEFAULTS.chimneyDepth, DEFAULTS.rimThickness,
        DEFAULTS.numSegments, DEFAULTS.printPart,
        DEFAULTS.jointTol, DEFAULTS.jointLen,
        DEFAULTS.drone1Interval, DEFAULTS.drone2Interval,
        DEFAULTS.tubeShellMode, DEFAULTS.keyworkMode, DEFAULTS.padMaterial
      );
      await writeFile(scadPath, scad);
      console.log(`  flute.scad  ${scad.length} bytes`);

      // No -D override: the mesh is rendered at the $fn the SCAD source itself declares, so the
      // gallery's STL is the same solid the studio's WASM renderer produces from that source.
      await execFileAsync(openscad, ['-o', path.join(dir, 'flute.stl'), scadPath], { maxBuffer: 1 << 28 });
      await execFileAsync(openscad, ['-o', path.join(dir, 'flute_iso.png'), ...isoCameraArgs(), scadPath], { maxBuffer: 1 << 28 });
      await execFileAsync(openscad, ['-o', path.join(dir, 'flute_head.png'), ...headCameraArgs(geom), scadPath], { maxBuffer: 1 << 28 });
      console.log('  flute.stl, flute_iso.png, flute_head.png rendered');

      const song = domain.buildSongScore(ex.song, ex.root, ex.scale, geom.numHoles);
      const duration = domain.scoreDurationSeconds(song.notes);

      // The audio is rendered inside a browser because an AudioWorklet needs a real Web Audio
      // implementation. dist/flute-offline.js is the studio's own render path, and the worklet
      // it loads is the exact file the page loads.
      const wavBase64 = await page.evaluate(async (args) => {
        const mod = await import('/dist/flute-offline.js');
        const res = await mod.renderScoreOffline(args.geom, args.score, args.breath, {
          sampleRate: 44100, envKey: args.envKey, slapGain: args.slapGain, seed: args.seed
        });
        const bytes = mod.encodeWav16(res.left, res.right, res.sampleRate);
        let s = '';
        for (let i = 0; i < bytes.length; i += 0x8000) {
          s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        }
        return btoa(s);
      }, { geom, score: song.notes, breath: song.breathCurve, envKey: ex.env, slapGain: DEFAULTS.slapGain, seed: ex.seed });
      const wav = Buffer.from(wavBase64, 'base64');
      await writeFile(path.join(dir, 'flute.wav'), wav);
      console.log(`  flute.wav   ${wav.length} bytes (${duration.toFixed(2)} s, ${ex.env} room)`);

      const mid = domain.encodeScoreMidi({
        score: song.notes,
        breath: song.breathCurve,
        drone1Midi: ex.root + DEFAULTS.drone1Interval,
        drone2Midi: ex.root + DEFAULTS.drone2Interval
      });
      await writeFile(path.join(dir, 'flute.mid'), Buffer.from(mid));
      console.log(`  flute.mid   ${mid.length} bytes`);

      await writeFile(path.join(dir, 'README.md'), renderReadme(ex, geom));
      await writeFile(path.join(dir, 'index.html'), renderIndexHtml(ex, geom));
      entries.push({ ex, geom });
    }
  } finally {
    await browser.close();
    server.close();
  }

  // The gallery index lists every example, so it is only rewritten on a full run.
  if (selected.length === EXAMPLES.length) {
    await writeFile(path.join(EXAMPLES_DIR, 'README.md'), renderGalleryReadme(entries));
  }

  // docs/ is the published site: the same gallery, copied rather than regenerated, so the two
  // cannot differ. Stale directories from an earlier naming are removed first.
  for (const target of [DOCS_DIR]) {
    for (const ex of EXAMPLES) {
      await rm(path.join(target, ex.dir), { recursive: true, force: true });
      await cp(path.join(EXAMPLES_DIR, ex.dir), path.join(target, ex.dir), { recursive: true });
    }
    await cp(path.join(EXAMPLES_DIR, 'README.md'), path.join(target, 'README.md'));
  }

  // The viewer libraries the pages load with a ../vendor/ relative path. A gallery page's root is
  // its parent directory, so both trees that serve one need their own copy of vendor/. The
  // checked-in original is vendor/ at the repository root; these two are build products.
  for (const target of [EXAMPLES_DIR, DOCS_DIR]) {
    await rm(path.join(target, 'vendor'), { recursive: true, force: true });
    await copyVendorTo(target);
  }
  console.log(`\nGallery written to examples/ and copied to docs/ (${selected.length} example(s)).`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
