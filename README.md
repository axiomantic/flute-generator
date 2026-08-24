# 🪈 Flute Generator & Studio

[![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-45%20passed-brightgreen.svg)]()
[![Online Studio](https://img.shields.io/badge/Live%20Demo-Flute%20Studio-3b82f6.svg)](https://axiomantic.github.io/flute-generator/)

A Python CAD suite and **digital waveguide physical modeling acoustic synthesizer** for designing 3D-printable multi-drone flutes (triple flutes) with parametric OpenSCAD models, interactive visual piano roll sequencing, and stereo algorithmic reverberation.

👉 **[Launch Online Studio & 3D Piano Roll](https://axiomantic.github.io/flute-generator/)**

---

## ✨ Features

- 🌐 **Interactive Online Web Studio & Piano Roll**:
  - Run completely client-side in your web browser (via GitHub Pages).
  - Visual piano roll sequencer with musical scale highlighting, click-and-drag note editing, and velocity/vibrato control.
  - Real-time **Web Audio digital waveguide physical modeling synthesis** with live drone toggles and customizable **Stereo Freeverb reverb**.
  - Interactive **3D Three.js CAD model viewer** with live parametric morphing and `.scad` export.
- 🪈 **Pure Digital Waveguide Physical Modeling Audio Engine**:
  - **100% Self-Contained**: Zero external SoundFonts or FluidSynth binaries required.
  - Models the 3 acoustic pipes as **bidirectional digital waveguide transmission delay lines** with viscous wall absorption and boundary radiation reflections.
  - **Nonlinear Aeroacoustic Vortex Jet**: Computes the labium splitting blade vortex shedding ($f(x) = \tanh(x - x^3)$) and breath turbulence.
  - **Stereo Freeverb Algorithmic Reverb**: 8 feedback comb filters and 4 allpass diffusers with controllable room size, damping, wet mix, and stereo width.
- 📐 **Parametric OpenSCAD 3D CAD Generation**:
  - Uniform hexagonal outer body with converging mouth-fitting beak.
  - **Specialized Mouthpiece Profiles**:
    - `sac` (**Slow Air Chamber**): Internal expansion reservoir for breath stabilization and warm Native American tone.
    - `arched` (**Crowned Baroque Ceiling**): Focuses laminar airflow onto the center of the labium for singing upper harmonics.
    - `venturi` (**Converging Airway Taper**): High jet velocity for crisp octave voicing.
    - `flat` (**Planar Windway**): Direct whistle tone.
  - **Aerodynamic Drone Air Balancing**: Calibrated airway ratios so drone pipes automatically act as gentle harmonic backgrounds.
  - **Micro-Ribbed Aeroacoustic Texture**: Optional micro-grooves along drone airways for organic acoustic rasp.
  - **Split 3D Print Slices**: Modular `head`, `mid`, and `foot` sections with interlocking joints for printing on standard desktop 3D printers.
- 🎼 **Scale Quantization & Presets**:
  - Built-in melodies (*El Cóndor Pasa*, *Native Spirit Motif*, *Desert Caravan*, *Morning Mood*, *Greensleeves*, *Amazing Grace*) that automatically transpose and quantize to match your flute's exact acoustic scale.
  - Multitrack MIDI export with independent channels and stereo panning for melody and drone pipes.

---

## 🌐 Online Web Studio

Experience the generator, interactive 3D model viewer, and real-time physical waveguide synthesizer without installing anything:

👉 **[https://axiomantic.github.io/flute-generator/](https://axiomantic.github.io/flute-generator/)**

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
│  • Drone Air Ratio   │  │ [ 3D Triple Flute Model - Rotate & Zoom ]      │  │
│                      │  └────────────────────────────────────────────────┘  │
│ 🏛️ Stereo Freeverb   │  🌟 Showcase Gallery (Native American, Baroque...)   │
│  • Room Size: 0.78   │  💾 Download .SCAD  |  Download .MID  |  Specs Readout│
└──────────────────────┴──────────────────────────────────────────────────────┘
```

---

## 🌟 Examples & Showcase Gallery

Explore pre-rendered models and audio in the [`examples/`](examples/) gallery:

| Example | Scale & Pitch | Mouthpiece Acoustic Design | Previews & 3D Models |
|---|---|---|---|
| **[Native American SAC](examples/01_native_american_a4_sac/)** | Minor Pentatonic (A4) | Internal Slow Air Chamber (SAC) expansion bulb for warm velvety attack | [3D Model](examples/01_native_american_a4_sac/index.html) • [Audio (WAV)](examples/01_native_american_a4_sac/flute.wav) • [SCAD](examples/01_native_american_a4_sac/flute.scad) |
| **[Desert Caravan Hijaz](examples/02_desert_caravan_hijaz_ribbed/)** | Hijaz Scale (A4) | Venturi converging airway with micro-ribbed drone rasp channels | [3D Model](examples/02_desert_caravan_hijaz_ribbed/index.html) • [Audio (WAV)](examples/02_desert_caravan_hijaz_ribbed/flute.wav) • [SCAD](examples/02_desert_caravan_hijaz_ribbed/flute.scad) |
| **[Andean Condor Pasa](examples/03_baroque_condor_pasa_arched/)** | Minor Pentatonic (A4) | Crowned arched Baroque windway for focused laminar harmonics | [3D Model](examples/03_baroque_condor_pasa_arched/index.html) • [Audio (WAV)](examples/03_baroque_condor_pasa_arched/flute.wav) • [SCAD](examples/03_baroque_condor_pasa_arched/flute.scad) |
| **[Renaissance Greensleeves](examples/04_greensleeves_dorian_c5/)** | Dorian Mode (C5) | High-register planar windway with calibrated harmonic 5th drone | [3D Model](examples/04_greensleeves_dorian_c5/index.html) • [Audio (WAV)](examples/04_greensleeves_dorian_c5/flute.wav) • [SCAD](examples/04_greensleeves_dorian_c5/flute.scad) |

---

## 📦 Python CLI Installation

### 1. Clone & Setup Virtual Environment

```bash
git clone https://github.com/axiomantic/flute-generator.git
cd flute-generator

python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install -e .
```

---

## 🚀 CLI Usage

### 1. Interactive Wizard

Run `flute-generator` to step through interactive prompts:

```bash
flute-generator
```

### 2. Batch / Scriptable CLI

Generate complete CAD models, MIDI sequences, and synthesized physical modeling audio directly:

```bash
flute-generator \
  --root A4 \
  --scale native_american \
  --melody native_motif \
  --drone1 0 \
  --drone2 7 \
  --windway-profile sac \
  --drone-air-ratio 0.78 \
  --room-size 0.80 \
  --reverb-wet 0.35 \
  --output-dir ./output \
  --non-interactive
```

#### CLI Options Reference

| Argument | Short | Default | Description |
|---|---|---|---|
| `--root` | `-r` | `A4` | Root note name (`A4`, `C5`, `F#4`) or MIDI number (`69`) |
| `--scale` | | `minor_pentatonic` | Musical scale (`native_american`, `hijaz`, `minor_pentatonic`, `major_pentatonic`, `dorian`, `major`, `natural_minor`, `blues`) |
| `--melody` | `-m` | `condor_pasa` | Melody preset (`condor_pasa`, `native_motif`, `desert_caravan`, `morning_mood`, `greensleeves`, `amazing_grace`, `scale_arpeggio`) |
| `--drone1` | | `0` | Drone 1 semitone offset relative to root (0 = unison root) |
| `--drone2` | | `7` | Drone 2 semitone offset relative to root (7 = perfect 5th) |
| `--windway-profile` | | `flat` | Mouthpiece airway profile (`sac` [Slow Air Chamber], `arched` [Baroque], `venturi`, `flat`) |
| `--drone-air-ratio` | | `0.78` | Ratio of drone airway height to melody airway height |
| `--windway-texture` | | `smooth` | Aeroacoustic windway texture (`smooth`, `ribbed`) |
| `--room-size` | | `0.75` | Stereo Freeverb reverb room size ($0.0 \to 1.0$) |
| `--reverb-damping` | | `0.25` | Reverb high-frequency absorption ($0.0 \to 1.0$) |
| `--reverb-wet` | | `0.32` | Reverb wet mix level ($0.0 \to 1.0$) |
| `--reverb-dry` | | `0.85` | Reverb dry mix level ($0.0 \to 1.0$) |
| `--output-dir` | `-o` | `./output` | Output directory for generated files |
| `--name` | `-n` | `flute_<note>_<scale>` | Base filename for output files |
| `--interactive` | `-i` | | Launch interactive wizard mode |
| `--non-interactive` | `--batch` | | Run in non-interactive batch mode |

---

## 🖨️ 3D Printing with OpenSCAD

The generated `.scad` model includes a part selector variable:

```scad
print_part = "assembled"; // Options: ["assembled", "head", "mid", "foot"]
```

- **`assembled`**: Full single-piece flute preview with uniform hexagonal body and converging mouthpiece beak.
- **`head`**: Top mouthpiece and fipple section with male socket joint.
- **`mid`**: Middle tone hole body with interlocking connectors.
- **`foot`**: Bottom open chamber section.

Open the `.scad` file in [OpenSCAD](https://openscad.org/), select your desired part, press `F6` to render, and export to STL (`F7`) for slicing in your 3D printer slicer (OrcaSlicer, PrusaSlicer, Bambu Studio, Cura).

---

## ⚡ WebAssembly & Fast Manifold Engine Build

The web interface compiles parametric CAD models client-side into 3D polygon meshes via OpenSCAD WebAssembly.

### Building OpenSCAD WASM with the Fast Manifold Engine

To build a custom build of OpenSCAD targeting WebAssembly with the 50× faster **Manifold CSG backend** (`-DENABLE_MANIFOLD=ON`), run:

```bash
# 1. Install & activate Emscripten SDK
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk && ./emsdk install latest && ./emsdk activate latest
source ./emsdk_env.sh
cd ..

# 2. Run the automated Manifold WASM build script
./scripts/build_manifold_wasm.sh
```

This compiles upstream OpenSCAD with the Manifold geometry kernel and places `openscad.js` and `openscad.wasm` into the project root for immediate in-browser execution.

---

## 🧪 Running Tests

Run the full pytest suite:

```bash
pytest -v
```

---

## 📜 License

MIT License. Developed with precision acoustics and open-source love.
