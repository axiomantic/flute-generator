# 🪈 Flute Generator

A Python CLI tool and acoustic synthesizer for designing 3D-printable multi-drone flutes (triple flutes) with parametric OpenSCAD models, MIDI sequences, and audio previews.

---

## ✨ Features

- **Interactive CLI Wizard & Scriptable Flags**: Step-by-step prompts to configure root note, musical scale, melody, drone intervals, and bore geometry.
- **Accurate Acoustic Calculations**: Automatically computes fundamental frequencies, open-cylinder end corrections, resonance tube lengths, and tone hole positions.
- **Common Flute Melodies & Scale Quantization**: Built-in melodies (e.g., *El Cóndor Pasa*, *Native American Flute Spirit Theme*, *Morning Mood*, *Greensleeves*, *Amazing Grace*) that automatically transpose and quantize to match your flute's exact scale notes and available tone holes.
- **Parametric OpenSCAD Output**: Generates complete `.scad` models with ergonomic tone hole chimneys, fipples, drone bores, and split slice modules (`head`, `mid`, `foot`) with interlocking joints for 3D printers.
- **Multi-Engine Audio Previews**:
  - **SoundFont Rendering**: Renders realistic flute audio using FluidSynth and SoundFont files (`.sf2`).
  - **Pure-Python Fallback**: Synthesizes harmonic audio previews with ADSR envelopes if FluidSynth is not installed.
- **Full Test Suite**: Tested with `pytest`.

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

Dependencies are pinned to exact versions in [requirements.txt](file:///Users/eek/Development/flute-generator/requirements.txt):

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

### 1. Flute SoundFont (`.sf2`)

To enable authentic flute SoundFont rendering:
1. Download **Mell Flutes** from:
   👉 **[https://www.zanderjaz.com/downloads/soundfonts/flutes/](https://www.zanderjaz.com/downloads/soundfonts/flutes/)**
2. Place the downloaded `Mell Flutes.sf2` file into the root of this project folder, or pass its path via `--soundfont <path>`.

> [!NOTE]
> `*.sf2` files are ignored by git in `.gitignore`.

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

*(If FluidSynth or the SoundFont is not found, the generator will notify you and seamlessly create a pure-Python harmonic audio preview).*

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
  1) Minor Pentatonic (intervals: [0, 3, 5, 7, 10, 12])
  2) Major Pentatonic (intervals: [0, 2, 4, 7, 9, 12])
  3) Major (intervals: [0, 2, 4, 5, 7, 9, 11, 12])
  4) Natural Minor (intervals: [0, 2, 3, 5, 7, 8, 10, 12])
  5) Dorian (intervals: [0, 2, 3, 5, 7, 9, 10, 12])
  6) Blues (intervals: [0, 3, 5, 6, 7, 10, 12])
Choose scale (1-6 or name) [1]: 1

Available Melody Presets (automatically quantized to your flute):
  1) Condor Pasa
  2) Native Motif
  3) Morning Mood
  4) Greensleeves
  5) Amazing Grace
  6) Scale Arpeggio
Choose melody (1-6 or name) [1]: 1

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
  --scale minor_pentatonic \
  --melody condor_pasa \
  --drone1 0 \
  --drone2 7 \
  --output-dir ./output \
  --non-interactive
```

#### CLI Options Reference

| Argument | Short | Default | Description |
|---|---|---|---|
| `--root` | `-r` | `A4` | Root note name (e.g., `A4`, `C5`, `F#4`) or MIDI number (`69`) |
| `--scale` | | `minor_pentatonic` | Musical scale (`minor_pentatonic`, `major_pentatonic`, `major`, `natural_minor`, `dorian`, `blues`) |
| `--melody` | `-m` | `condor_pasa` | Melody preset (`condor_pasa`, `native_motif`, `morning_mood`, `greensleeves`, `amazing_grace`, `scale_arpeggio`) |
| `--drone1` | | `0` | Drone 1 semitone offset relative to root (0 = unison root) |
| `--drone2` | | `7` | Drone 2 semitone offset relative to root (7 = perfect 5th) |
| `--bore-melody` | | `19.0` | Melody tube bore diameter in mm |
| `--bore-drone1` | | `22.0` | Drone 1 tube bore diameter in mm |
| `--bore-drone2` | | `16.0` | Drone 2 tube bore diameter in mm |
| `--wall` | | `4.0` | Outer wall thickness in mm |
| `--spacing` | | `25.0` | Distance between bore centers in mm |
| `--hole-d` | | `7.0` | Tone hole diameter in mm |
| `--soundfont` | `-s` | `None` | Path to custom `.sf2` SoundFont |
| `--output-dir` | `-o` | `./output` | Directory for generated files |
| `--name` | `-n` | `flute_<note>_<scale>` | Base filename for output files |
| `--interactive` | `-i` | | Force interactive wizard mode |
| `--non-interactive` | `--batch` | | Run in non-interactive batch mode |

---

## 🖨️ 3D Printing with OpenSCAD

The generated `.scad` file includes a part selector variable:

```scad
print_part = "assembled"; // Options: ["assembled", "head", "mid", "foot"]
```

- **`assembled`**: Full single-piece flute preview.
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
