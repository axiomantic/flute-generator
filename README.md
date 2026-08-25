# 🪈 Flute Generator & Studio

[![TypeScript](https://img.shields.io/badge/TypeScript-7.x-3178c6.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Online Studio](https://img.shields.io/badge/Live%20Demo-Flute%20Studio-3b82f6.svg)](https://axiomantic.github.io/flute-generator/)

A browser CAD suite and **physical modeling acoustic synthesizer** for designing 3D-printable
multi-drone flutes (triple flutes), with parametric OpenSCAD models, an interactive visual piano
roll, and convolution room reverb. The studio synthesizes with a **digital waveguide** bore and
tone hole lattice. It needs no external sample library and no server: it is TypeScript, bundled
by esbuild, running entirely in the page.

👉 **[Launch Online Studio & 3D Piano Roll](https://axiomantic.github.io/flute-generator/)**

---

## ✨ Features

- 🌐 **Interactive Online Web Studio & Piano Roll**:
  - Runs completely client-side in your web browser (via GitHub Pages).
  - Visual piano roll sequencer with musical scale highlighting and click-and-drag note editing.
  - Real-time **Web Audio digital waveguide synthesis** in an AudioWorklet, with a **convolution
    room reverb** whose impulse responses are generated in the page from decaying noise and
    discrete early reflections — no impulse files are downloaded.
  - Interactive **3D Three.js CAD model viewer** with live parametric morphing, driven by real
    OpenSCAD compiled to WebAssembly, plus `.scad` and printable-STL `.zip` export.
- 🪈 **Self-Contained Physical Modeling Audio**:
  - **No SoundFonts, no FluidSynth, no samples.** Every sound is synthesized from the acoustic
    model alone.
  - **Digital waveguide**: models each pipe as **bidirectional transmission delay lines**, split
    into a segment per tone hole, with per-segment visco-thermal wall loss, Keefe three-port tone
    hole junctions with moving pads, and one-pole radiation and fipple reflection filters at the
    boundaries. Sounding pitch is a *consequence* of the bore geometry and fingering, not of a
    note-to-frequency table.
  - **Nonlinear jet excitation**: a Fletcher-style $\tanh$ jet drive across a jet-transit delay
    at the fipple window, with breath turbulence — white noise through a one-pole lowpass, so
    the excitation spectrum falls at roughly 6 dB per octave — and a Bernoulli $\sqrt{P}$
    jet-velocity term.
  - A modal resonator model (`WebPhysicalPipe`, a bank of biquads on the first four harmonics)
    is kept in-tree as an A/B reference. It is selected by a source constant, not by any control,
    and the studio ships with the waveguide.
- 📐 **Parametric OpenSCAD 3D CAD Generation**:
  - Uniform hexagonal outer body with converging mouth-fitting beak.
  - **Specialized Mouthpiece Profiles**:
    - `sac` (**Slow Air Chamber**): Internal expansion reservoir for breath stabilization and warm Native American tone.
    - `arched` (**Crowned Baroque Ceiling**): Focuses laminar airflow onto the center of the labium for singing upper harmonics.
    - `venturi` (**Converging Airway Taper**): High jet velocity for crisp octave voicing.
    - `flat` (**Planar Windway**): Direct whistle tone.
  - **Joint acoustic solve**: hole diameter, hole positions and melody tube length are solved
    together against the tone hole lattice, and the solver reports its worst residual in cents.
  - **Optional articulated keywork**: sax-style key cups, hinges and rods, with printable pad
    gaskets in TPU, silicone or rigid PLA.
  - **Split 3D Print Slices**: up to four segments with interlocking tenon/socket joints at
    tolerances you choose, for printing on standard desktop 3D printers.
- 🎼 **Scale Quantization & Presets**:
  - Built-in melodies (*El Cóndor Pasa*, *Native Spirit Motif*, *Desert Caravan*, *Morning Mood*,
    *Greensleeves*, *Amazing Grace*) that automatically transpose and quantize to match your
    flute's exact acoustic scale.

---

## 🌐 Running the Studio

Use the hosted build, or serve it yourself. The page must be served over HTTP: it loads an ES
module, an AudioWorklet module and a `.wasm` file, and a `file://` URL blocks all three.

👉 **[https://axiomantic.github.io/flute-generator/](https://axiomantic.github.io/flute-generator/)**

```bash
git clone https://github.com/axiomantic/flute-generator.git
cd flute-generator

npm install
npm run build      # -> dist/flute.js, dist/flute-worklet.js, dist/flute-offline.js
npm run serve      # http://localhost:8000
```

The published site under `docs/` is generated, not hand-maintained: `npm run build:docs` writes
`docs/index.html`, `docs/dist/`, the OpenSCAD WASM runtime and `docs/vendor/` into it. See
CONTRIBUTING.md.

**The studio makes no third-party request.** three.js, OrbitControls and JSZip are checked in under
`vendor/` and the OpenSCAD WASM runtime sits beside the page, so every URL the page fetches is on
its own origin. It runs with no network and under a strict `script-src 'self'` policy, and no CDN
outage can take it down. The showcase gallery works the same way.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 🪈 Flute Studio                                         [ GitHub Repo ↗ ]   │
├──────────────────────┬──────────────────────────────────────────────────────┤
│ 🎵 Acoustic Physics  │  🎹 Visual Piano Roll & Physical Synth   [ ▶ Play ]  │
│  • Root: A4 (440 Hz) │  ┌────────────────────────────────────────────────┐  │
│  • Scale: Hijaz      │  │ █ In-Scale Note Highlighting                   │  │
│  • Drones: Unison, 5 │  │ █ Click & Drag Note Sequencer                  │  │
│                      │  └────────────────────────────────────────────────┘  │
│ 🌬️ Mouthpiece Profile│  📐 3D Parametric CAD (Three.js Orbit View)          │
│  • SAC / Arched      │  ┌────────────────────────────────────────────────┐  │
│  • Keywork & Pads    │  │ [ 3D Triple Flute Model - Rotate & Zoom ]      │  │
│                      │  └────────────────────────────────────────────────┘  │
│ 🏛️ Room Reverb       │  🌟 Showcase Gallery (Native American, Baroque...)   │
│  • Canyon / Studio   │  💾 Download .SCAD  |  Export STL .ZIP  |  Specs     │
└──────────────────────┴──────────────────────────────────────────────────────┘
```

---

## 🌟 Examples & Showcase Gallery

Explore pre-rendered models and audio in the [`examples/`](examples/) gallery. Every example is a
set of studio controls: the dimensions, the OpenSCAD source, the mesh and the `.wav` are all
produced by the modules the studio itself runs, so an example can be reproduced by entering its
settings in the studio.

| Example | Scale & Pitch | Mouthpiece Acoustic Design | Previews & 3D Models |
|---|---|---|---|
| **[Native American SAC](examples/01_native_american_a4_sac/)** | Native American pentatonic (A4) | Internal Slow Air Chamber (SAC) expansion bulb for warm velvety attack | [3D Model](examples/01_native_american_a4_sac/index.html) • [Audio (WAV)](examples/01_native_american_a4_sac/flute.wav) • [SCAD](examples/01_native_american_a4_sac/flute.scad) |
| **[Desert Caravan Hijaz](examples/02_desert_caravan_hijaz_venturi/)** | Hijaz Scale (A4) | Venturi converging airway for high jet velocity at the labium | [3D Model](examples/02_desert_caravan_hijaz_venturi/index.html) • [Audio (WAV)](examples/02_desert_caravan_hijaz_venturi/flute.wav) • [SCAD](examples/02_desert_caravan_hijaz_venturi/flute.scad) |
| **[Andean Condor Pasa](examples/03_baroque_condor_pasa_arched/)** | Minor Pentatonic (A4) | Crowned arched Baroque windway for focused laminar harmonics | [3D Model](examples/03_baroque_condor_pasa_arched/index.html) • [Audio (WAV)](examples/03_baroque_condor_pasa_arched/flute.wav) • [SCAD](examples/03_baroque_condor_pasa_arched/flute.scad) |
| **[Renaissance Greensleeves](examples/04_greensleeves_dorian_c5/)** | Dorian Mode (C5) | High-register planar windway with calibrated harmonic 5th drone | [3D Model](examples/04_greensleeves_dorian_c5/index.html) • [Audio (WAV)](examples/04_greensleeves_dorian_c5/flute.wav) • [SCAD](examples/04_greensleeves_dorian_c5/flute.scad) |

Regenerating the gallery needs [OpenSCAD](https://openscad.org/) on the `PATH` (for the mesh and
the two renders) and a Chromium that Puppeteer can launch (for the audio):

```bash
npm run build:examples
```

---

## 🖨️ 3D Printing with OpenSCAD

Use **💾 Download .SCAD** for the parametric source, or **📦 Export Printable STLs (.ZIP)** to
have the studio render every segment to STL in WebAssembly and hand you a zip.

The generated `.scad` model includes a part selector variable:

```scad
print_part = "assembled"; // Options: ["assembled", "part_1", "part_2", "part_3", "part_4"]
```

- **`assembled`**: Full single-piece flute preview with uniform hexagonal body and converging mouthpiece beak.
- **`part_1` … `part_4`**: The head, mid and foot slices, cut on planes chosen to avoid every tone
  hole, chimney and the sound window, with interlocking tenon/socket joints.

Open the `.scad` file in [OpenSCAD](https://openscad.org/), select your desired part, press `F6`
to render, and export to STL (`F7`) for slicing in your 3D printer slicer (OrcaSlicer,
PrusaSlicer, Bambu Studio, Cura).

---

## ⚡ WebAssembly & Fast Manifold Engine Build

The web interface compiles parametric CAD models client-side into 3D polygon meshes via OpenSCAD
WebAssembly. The compiled `openscad.js` and `openscad.wasm` are checked in, so this section is
only needed to rebuild them.

The project includes git submodules for `emsdk` and `openscad` under `vendor/`. The build script
handles toolchain installation, recursive dependency checking (including `manifold`, `Clipper2`,
`mimalloc`, and `sanitizers-cmake`), CMake configuration, and compilation automatically:

```bash
# 1. (Optional) Initialize submodules manually, or let the script handle it:
git submodule update --init --recursive

# 2. Run the self-contained Manifold WASM build script
./scripts/build_manifold_wasm.sh
```

#### How it works:
- If Docker is running on your machine, the script uses the verified `openscad/wasm-base:latest` container containing pre-compiled WASM dependencies (`Eigen3`, `Boost`, `CGAL`, `DoubleConversion`, `HarfBuzz`, `FontConfig`).
- If Docker is not available, it automatically uses the native Emscripten toolchain inside `vendor/emsdk/`.
- The compilation produces `openscad.js` and `openscad.wasm` with `-DENABLE_MANIFOLD=ON` and deploys them to the project root for sub-50ms in-browser CSG boolean rendering.

---

## 🧑‍💻 Developing

`npm run typecheck` runs `tsc --noEmit` and must be clean. See
[CONTRIBUTING.md](CONTRIBUTING.md) for the source layout, the `docs/` publishing step, and the
gallery generator.

---

## 📜 License

MIT License. Developed with precision acoustics and open-source love.
