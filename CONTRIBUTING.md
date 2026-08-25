# 🛠️ Contributing & Developer Guide

Thank you for your interest in contributing to **Flute Generator & Studio**! This document
covers the local development setup, the source layout, publishing the site, regenerating the
showcase gallery, and rebuilding the client-side WebAssembly components.

There is one implementation. Everything the project produces — the 3D preview, the `.scad` and
STL exports, the audio, and every artifact in the gallery — comes from the TypeScript modules
under `src/web/`. A change to the acoustics changes all of them at once.

---

## 📦 Local Development Setup

```bash
git clone --recurse-submodules https://github.com/axiomantic/flute-generator.git
cd flute-generator

npm install          # once
npm run build        # -> dist/flute.js, dist/flute-worklet.js, dist/flute-offline.js
npm run serve        # http://localhost:8000
```

`npm run watch` rebuilds `dist/` on change; reload the page to pick it up. `npm run typecheck`
runs `tsc --noEmit` over `src/web` and over the suite, and must be clean, with no `any`, before a
change is proposed.

### Tests

```bash
npm test             # the whole suite, about 20 s
npm run test:watch   # re-runs on change
npm run test:sweep   # only the two files that solve all 168 UI-reachable configurations
```

The suite is vitest, under `test/`. It runs the domain modules directly, plus the real OpenSCAD
binary for the mesh checks, so **OpenSCAD must be on the PATH** (or `OPENSCAD` set) - a missing
binary fails loudly rather than skipping.

Three things about it are load-bearing:

- **The tuning table in `test/tuning.test.ts` is pinned per configuration.** A row moving means
  the instrument that gets printed changed pitch. Update it deliberately, with the new
  measurement, never to make a run go green.
- **`test/golden/*.scad` are checked-in generator output.** Update them with
  `npx vitest run test/scad-golden.test.ts -u` and read the diff.
- **`test/gallery-studio.test.ts` compares `examples/*/flute.scad` against what the studio
  generates today.** If it fails, the gallery is stale: run `npm run build:examples`.

Rows marked `KNOWN DEFECT` pin a pre-existing bug to its exact measured value. They go red if the
defect is fixed as well as if it gets worse; a fix means promoting the row, not deleting it.

The page must be served over HTTP, not opened as a `file://` URL: it loads an ES module, an
AudioWorklet module and a `.wasm` file, and all three are blocked on `file://`.

### Publishing to `docs/`

`docs/` is build output, not a hand-maintained copy. Regenerate and check it in the same way:

```bash
npm run build:docs   # writes docs/index.html, docs/dist/, docs/openscad.js, docs/openscad.wasm,
                     # docs/vendor/
npm run serve:docs   # http://localhost:8001
```

`docs/index.html` is a byte-for-byte copy of the root `index.html`, and `cmp index.html
docs/index.html` must stay silent. That is why every path the page references is relative and
one-level: `./dist/`, `./openscad.js`, `./vendor/`. A path that resolves only from the repository
root would break the published page, and the reverse.

### Vendored browser libraries

three.js, OrbitControls, STLLoader and JSZip are checked in under `vendor/`, not loaded from a CDN:
the page has to work offline and under a strict `script-src 'self'` policy, and the bytes behind a
pinned CDN URL are not themselves pinned. `vendor/README.md` records the version, source URL and
SHA-256 of each file, and is the place to update when a version changes.

`vendor/` is the only copy edited by hand. `examples/vendor/` and `docs/vendor/` are mirrors written
by `scripts/build.mjs` and `scripts/build_examples.mjs` through `copyVendorTo()` in
`scripts/vendor.mjs`; they are committed because GitHub Pages serves the tree as checked in. Three
directories are needed because a page's own directory is its root: the studio sits at the top of
its tree and asks for `./vendor/`, while a gallery page sits one level down and asks for
`../vendor/`.

The four files are classic scripts, not ES modules, and the order in `index.html` is load-bearing:
`three.min.js` defines the `THREE` global and `OrbitControls.js` attaches to it. `src/web/three-global.d.ts`
declares both, plus `JSZip`, for the type checker.

### Source layout

| Path | Holds |
|------|-------|
| `src/web/data/` | Scales, song templates, score construction, flute presets, wood/theme/environment tables |
| `src/web/acoustics/` | `WaveguideFlutePipe`, `WebPhysicalPipe`, the tone-hole lattice solver, shared constants |
| `src/web/geometry/` | `computeFluteGeometry`, `computeSmartJointCuts` |
| `src/web/cad/` | `generateScadJs`, STL-to-Three.js conversion |
| `src/web/audio/` | The AudioWorklet processor, its entry point and loader, the room impulse, the output chain, the offline render |
| `src/web/export/` | The `.wav` and `.mid` serializers |
| `src/web/ui/` | DOM helpers, the wood-grain texture, and the studio runtime (`app.ts`) |
| `src/web/testkit/` | `node-entry.ts`, the pure-domain surface bundled for Node |
| `src/web/types.ts` | The geometry object, the hole lattice and the solver report |

### The three esbuild entry points

| Entry | Output | Why it is separate |
|---|---|---|
| `src/web/main.ts` | `dist/flute.js` | The studio page. |
| `src/web/audio/worklet-entry.ts` | `dist/flute-worklet.js` | The processor runs in `AudioWorkletGlobalScope`, which has no `window` and no page module graph, so it is loaded with `audioWorklet.addModule()`. It must never import anything that touches the DOM. |
| `src/web/audio/offline-entry.ts` | `dist/flute-offline.js` | Faster-than-real-time rendering of a score through the same worklet. Only the gallery generator loads it; `npm run build:docs` does not publish it. |

`dist/flute-offline.js` must stay a sibling of `dist/flute-worklet.js`, because
`worklet-loader.ts` resolves the worklet against its own bundle URL.

---

## 🌟 Regenerating the Showcase Gallery

```bash
npm run build:examples            # every example
node scripts/build_examples.mjs 01 03   # only these
```

The generator writes `examples/NN_*/` and copies each directory to `docs/`. It needs:

- **OpenSCAD** on the `PATH`, or `OPENSCAD` pointing at the binary — for `flute.stl` and the two
  PNG renders.
- **A Chromium Puppeteer can launch** — for `flute.wav`. An AudioWorklet needs a real Web Audio
  implementation, so the audio is rendered in a headless page that loads
  `dist/flute-offline.js`, which loads the same worklet file the studio loads.

`scripts/build_examples.mjs` computes nothing about a flute. It calls `computeFluteGeometry()`,
`generateScadJs()`, `buildSongScore()` and `renderScoreOffline()`, and it only orchestrates: it
drives OpenSCAD, drives the browser, and writes the pages. Its predecessor was a second
implementation of the acoustics and it had drifted from the studio by tens of cents.

To check that it has not drifted again: export a `.scad` from the studio with an example's
settings and compare it byte for byte with that example's `flute.scad`.

**The gallery is a reproducible build.** Rebuilding it without changing anything writes the
same bytes, `flute.wav` included, so `git status` stays clean and a real change is visible in
the diff. Both noise sources on the render path - the breath turbulence in
`WaveguideFlutePipe` and the reverb impulse in `createRoomImpulseBuffer()` - draw from a
generator seeded per example by the `seed` field in `EXAMPLES`. Live playback passes no seed
and keeps `Math.random()`, so a note played in the studio is never quite the same twice.
Changing a `seed` rewrites that example's `.wav` and nothing else.

---

## ⚡ WebAssembly & Fast Manifold Engine Build

The web interface compiles parametric CAD models client-side into 3D polygon meshes via OpenSCAD
WebAssembly. `openscad.js` and `openscad.wasm` are checked in; rebuild them only when the
OpenSCAD submodule moves.

```bash
# 1. Initialize git submodules (if not already cloned recursively):
git submodule update --init --recursive

# 2. Run the self-contained Manifold WASM build script:
./scripts/build_manifold_wasm.sh
```

### Build Architecture:
- **Containerized Build (Recommended)**: If Docker is running, the script automatically uses the verified `openscad/wasm-base:latest` container containing pre-compiled WASM dependencies (`Eigen3`, `Boost`, `CGAL`, `DoubleConversion`, `HarfBuzz`, `FontConfig`).
- **Native Fallback**: If Docker is not available, it uses the local Emscripten toolchain in `vendor/emsdk/`.
- **Output Artifacts**: The build compiles OpenSCAD with `-DENABLE_MANIFOLD=ON` and deploys `openscad.js` and `openscad.wasm` to the project root for sub-50ms in-browser CSG boolean rendering.

---

## 📋 Code Quality & Architecture Guidelines

- **Acoustic Physics**: All physical dimensions and hole placement live in
  `src/web/geometry/flute.ts` and `src/web/acoustics/solver.ts`. `computeFluteGeometry()` returns
  the one `FluteGeometry` object the CAD generator, the 3D scene and the audio engine all read.
- **CAD Representation**: `generateScadJs()` in `src/web/cad/scad.ts` must produce 100%
  2-manifold CSG solid models. It is the single source of truth for the 3D preview, the STL
  renders, the ZIP's master SCAD, and the `.scad` download.

  **Known deviations from this rule.** The rule states what the generator must do, not what it
  currently achieves. Configurations have been measured whose rendered mesh carries
  non-manifold edges, and the standard is not relaxed to accommodate them: each one is pinned
  in `test/stl-manifold.test.ts` as a `KNOWN DEFECT` row holding its exact measured edge count,
  so the row goes red if the defect spreads and also if it is fixed. That file is the authority
  on which configurations deviate today - read its case table, not this paragraph. Fixing one
  means promoting its row to a watertight case, which is the only way this list shrinks.
- **Physical Modeling**: `src/web/acoustics/waveguide.ts` (`WaveguideFlutePipe`) is the engine,
  running in an AudioWorklet. `src/web/acoustics/modal.ts` (`WebPhysicalPipe`) is a modal
  resonator kept as an A/B reference; `FLUTE_AUDIO_ENGINE` in `app.ts` selects between them and
  there is no UI for it. The two are separate implementations and must not be assumed to match:
  the waveguide derives pitch from the geometry, the modal model forces equal temperament.
- **Reverb**: the studio uses a Web Audio `ConvolverNode`. Its impulse responses are generated
  in the page by `createRoomImpulseBuffer()` from decaying noise plus discrete early reflections.
  There is no algorithmic reverb implementation in this project.
- **Score construction** is pure and lives in `src/web/data/score.ts`. `app.ts` holds only DOM
  adapters over it, so the studio and the gallery generator build a score identically.
