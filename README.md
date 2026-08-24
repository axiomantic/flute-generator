# 🪈 Flute Generator

A Python CLI tool and acoustic synthesizer for designing 3D-printable multi-drone flutes (triple flutes) with parametric OpenSCAD models, MIDI sequences, and audio previews.

---

## ✨ Features

- **Interactive CLI Wizard & Scriptable Flags**: Step-by-step prompts to configure root note, musical scale, melody, drone intervals, and bore geometry.
- **Accurate Acoustic Calculations**: Automatically computes fundamental frequencies, open-cylinder end corrections, resonance tube lengths, and tone hole positions.
- **Common Flute Melodies & Scale Quantization**: Built-in melodies (e.g., *El Cóndor Pasa*, *Native American Flute Spirit Theme*, *Desert Caravan*, *Morning Mood*, *Greensleeves*, *Amazing Grace*) that automatically transpose and quantize to match your flute's exact scale notes and available tone holes.
- **Parametric OpenSCAD Output**: Generates complete `.scad` models with uniform hexagonal outer body, converging mouth-fitting beak, fipple sound windows, and split slice modules (`head`, `mid`, `foot`) with interlocking joints for 3D printers.
- **Multi-Engine Audio Previews**:
  - **SoundFont Rendering**: Renders realistic flute audio using FluidSynth and SoundFont files (`.sf2`). Default: `ixox_flute.sf2`.
  - **Pure-Python Fallback**: Synthesizes harmonic audio previews with legato crossfading and phase-continuous oscillators if FluidSynth is not installed.
- **Full Test Suite**: Comprehensive tests covering acoustics, musical intervals, MIDI, waveform synthesis, and CAD syntax with `pytest`.

---

## 📦 Installation & Setup

It is strongly recommended to use a Python virtual environment (`venv`).

### 1. Clone & Create Virtual Environment

```bash
# Navigate to project directory
cd flute-generator

# Create a virtual environment
python3 -m venv .venv

# Activate the virtual environment
# On macOS / Linux:
source .venv/bin/activate
# On Windows:
# .venv\Scripts\activate
```

### 2. Install Dependencies

Dependencies are pinned to exact versions in [requirements.txt](requirements.txt):

```bash
pip install -r requirements.txt
pip install -e .
```

**Pinned Dependencies:**
- `mido==1.3.3` (MIDI generation and message encoding)
- `midi2audio==0.1.1` (FluidSynth SoundFont rendering bridge)
- `pytest==9.1.1` (Unit and integration testing)

---

## 🎵 SoundFont & FluidSynth Setup

### 1. Default SoundFont (`ixox_flute.sf2`)

The tool defaults to looking for **`ixox_flute.sf2`** in the project directory.

To obtain the SoundFont:
1. Download **Ixox Flute Full v0.2** (`ixox_flute.sf2`) from:
   👉 **[https://www.polyphone.io/en/soundfonts/flutes/214-ixox-flute-full-v0-2](https://www.polyphone.io/en/soundfonts/flutes/214-ixox-flute-full-v0-2)**
2. Place `ixox_flute.sf2` directly in the project root directory, or specify a custom path with `--soundfont <path>`.

### 2. FluidSynth (Optional for SoundFont Rendering)

To render the SoundFont `.wav` files via FluidSynth, install the `fluidsynth` binary:

- **macOS (Homebrew):**
  ```bash
  brew install fluidsynth
  ```
- **Ubuntu / Debian:**
  ```bash
  sudo apt-get update && sudo apt-get install -y fluidsynth
  ```
- **Windows (Chocolatey / Scoop):**
  ```bash
  choco install fluidsynth
  ```

*(If FluidSynth or the SoundFont is not present, the generator will seamlessly create a pure-Python harmonic audio preview).*

---

## 🚀 Usage

### Interactive Mode

Simply run `flute-generator` without arguments (or with `-i`) to launch the interactive prompt wizard:

```bash
flute-generator
```

Example prompt walkthrough:
```text
==========================================================
           🪈  PARAMETRIC FLUTE GENERATOR  🪈           
==========================================================
Configure your multi-drone flute, CAD model, and audio preview.

Root note (e.g. A4, C4, D5, or MIDI 69) [A4]: A4

Available Scales:
  1) Native American (intervals: [0, 3, 5, 7, 10, 12])
  2) Native American Extended (intervals: [0, 3, 5, 7, 8, 10, 12])
  3) Minor Pentatonic (intervals: [0, 3, 5, 7, 10, 12])
  4) Major Pentatonic (intervals: [0, 2, 4, 7, 9, 12])
  5) Hijaz (intervals: [0, 1, 4, 5, 7, 8, 10, 12])
  6) Hijaz Kar (intervals: [0, 1, 4, 5, 7, 8, 11, 12])
  7) Major (intervals: [0, 2, 4, 5, 7, 9, 11, 12])
  8) Natural Minor (intervals: [0, 2, 3, 5, 7, 8, 10, 12])
  9) Dorian (intervals: [0, 2, 3, 5, 7, 9, 10, 12])
  10) Blues (intervals: [0, 3, 5, 6, 7, 10, 12])
Choose scale (1-10 or name) [1]: 1

Available Melody Presets (automatically quantized to your flute):
  1) Condor Pasa
  2) Native Motif
  3) Desert Caravan
  4) Morning Mood
  5) Greensleeves
  6) Amazing Grace
  7) Scale Arpeggio
Choose melody (1-7 or name) [1]: 1

Drone Offsets (in semitones relative to root):
Drone 1 offset (semitones, 0 = Root) [0]: 0
Drone 2 offset (semitones, 7 = Perfect 5th) [7]: 7
...
```

---

### Command-Line Arguments (Batch / Scriptable)

You can pass command-line arguments directly:

```bash
flute-generator \
  --root A4 \
  --scale native_american \
  --melody native_motif \
  --drone1 0 \
  --drone2 7 \
  --output-dir ./output \
  --non-interactive
```

#### CLI Options Reference

| Argument | Short | Default | Description |
|---|---|---|---|
| `--root` | `-r` | `A4` | Root note name (e.g., `A4`, `C5`, `F#4`) or MIDI number (`69`) |
| `--scale` | | `native_american` | Musical scale (`native_american`, `native_american_extended`, `minor_pentatonic`, `major_pentatonic`, `hijaz`, `hijaz_kar`, `major`, `natural_minor`, `dorian`, `blues`) |
| `--melody` | `-m` | `condor_pasa` | Melody preset (`condor_pasa`, `native_motif`, `desert_caravan`, `morning_mood`, `greensleeves`, `amazing_grace`, `scale_arpeggio`) |
| `--drone1` | | `0` | Drone 1 semitone offset relative to root (0 = unison root) |
| `--drone2` | | `7` | Drone 2 semitone offset relative to root (7 = perfect 5th) |
| `--bore-melody` | | `19.0` | Melody tube bore diameter in mm |
| `--bore-drone1` | | `22.0` | Drone 1 tube bore diameter in mm |
| `--bore-drone2` | | `16.0` | Drone 2 tube bore diameter in mm |
| `--wall` | | `4.0` | Outer wall thickness in mm |
| `--spacing` | | `25.0` | Distance between bore centers in mm |
| `--hole-d` | | `7.0` | Tone hole diameter in mm |
| `--windway-profile` | | `flat` | Mouthpiece airway profile (`flat`, `arched`, `sac`, `venturi`) |
| `--drone-air-ratio` | | `0.78` | Ratio of drone airway height to melody airway height |
| `--windway-texture` | | `smooth` | Aeroacoustic windway texture (`smooth`, `ribbed`) |
| `--soundfont` | `-s` | `None` | Path to custom `.sf2` SoundFont (defaults to `ixox_flute.sf2`) |
| `--output-dir` | `-o` | `./output` | Directory for generated files |
| `--name` | `-n` | `flute_<note>_<scale>` | Base filename for output files |
| `--interactive` | `-i` | | Force interactive wizard mode |
| `--non-interactive` | `--batch` | | Run in non-interactive batch mode |

---

## 🌟 Examples & Showcase Gallery

Explore pre-rendered, playable examples in the [`examples/`](examples/) directory:

- 🪈 **[Native American Triple Flute (A4) with Slow Air Chamber](examples/01_native_american_a4_sac/)**
- 🏜️ **[Desert Caravan Middle Eastern Flute (A4) with Ribbed Airways](examples/02_desert_caravan_hijaz_ribbed/)**
- 🦅 **[Andean Condor Pasa Triple Flute (A4) with Arched Baroque Windway](examples/03_baroque_condor_pasa_arched/)**
- 🏰 **[Renaissance Greensleeves Triple Flute (C5) in Dorian Mode](examples/04_greensleeves_dorian_c5/)**

Each example includes 3D renderings, `.wav` audio previews, `.mid` sequences, `.scad` models, `.stl` files, and an interactive **HTML5 3D rotating model viewer** (`index.html`).

---

## 🖨️ 3D Printing with OpenSCAD

The generated `.scad` file includes a part selector variable:

```scad
print_part = "assembled"; // Options: ["assembled", "head", "mid", "foot"]
```

- **`assembled`**: Full single-piece flute preview with uniform hexagonal body and converging mouthpiece beak.
- **`head`**: Top mouthpiece and fipple section with male socket joint.
- **`mid`**: Middle tone hole body with interlocking connectors.
- **`foot`**: Bottom open chamber section.

Open the `.scad` file in [OpenSCAD](https://openscad.org/), select your desired part, press `F6` to render, and export to STL (`F7`) for slicing in your favorite 3D printer slicer (e.g. OrcaSlicer, PrusaSlicer, Bambu Studio, Cura).

---

## 🧪 Running Tests

Run the test suite using `pytest`:

```bash
pytest -v
```

---

## 📜 Credits & Attributions

- **SoundFont**: [Ixox Flute Full v0.2](https://www.polyphone.io/en/soundfonts/flutes/214-ixox-flute-full-v0-2) (`ixox_flute.sf2`)
  - **Author**: Unknown (originally created by Xavier Hosxe / Ixox)
  - **License**: Public Domain
  - **Source**: [Polyphone Soundfonts Repository](https://www.polyphone.io/en/soundfonts/flutes/214-ixox-flute-full-v0-2)
