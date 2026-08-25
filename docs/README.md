# 🪈 Flute Generator Examples & Showcase Gallery

A gallery of multi-drone flutes demonstrating various acoustic scales, melodies, and specialized mouthpiece designs.

Each example directory includes:
- 📸 **3D CAD Renders** (`flute_iso.png`, `flute_head.png`)
- 🔊 **Synthesized Audio** (`flute.wav`)
- 🎼 **MIDI Sequence** (`flute.mid`)
- 📐 **Parametric OpenSCAD Model** (`flute.scad`)
- 🖨️ **3D-Printable Mesh** (`flute.stl`)
- 🌐 **Interactive 3D Web Viewer & Player** (`index.html`)

Every example is a set of studio controls and nothing else. The dimensions, the OpenSCAD
source, the mesh and the audio all come from the modules the studio runs, so an example can be
reproduced by entering the settings listed under it.

---

## 🌟 Showcase Gallery

### 1. [Native American Triple Flute (A4) with Slow Air Chamber (SAC)](01_native_american_a4_sac/)
- **Scale**: native_american (`[0, 3, 5, 7, 10, 12]`)
- **Melody**: `native_motif`
- **Mouthpiece**: `sac`
- **Instrument**: 5 tone holes of 6.5 mm, 451.0 mm tall, sounding 440.0 Hz with all holes closed
- 🔗 **[Explore Example & Interactive 3D Model](01_native_american_a4_sac/)**

### 2. [Desert Caravan Middle Eastern Flute (A4) with Venturi Windway](02_desert_caravan_hijaz_venturi/)
- **Scale**: hijaz (`[0, 1, 4, 5, 7, 8, 10, 12]`)
- **Melody**: `desert_caravan`
- **Mouthpiece**: `venturi`
- **Instrument**: 6 tone holes of 8.5 mm, 451.0 mm tall, sounding 440.0 Hz with all holes closed
- 🔗 **[Explore Example & Interactive 3D Model](02_desert_caravan_hijaz_venturi/)**

### 3. [Andean Condor Pasa Triple Flute (A4) with Arched Baroque Windway](03_baroque_condor_pasa_arched/)
- **Scale**: minor_pentatonic (`[0, 3, 5, 7, 10, 12]`)
- **Melody**: `condor_pasa`
- **Mouthpiece**: `arched`
- **Instrument**: 5 tone holes of 6.5 mm, 451.0 mm tall, sounding 440.0 Hz with all holes closed
- 🔗 **[Explore Example & Interactive 3D Model](03_baroque_condor_pasa_arched/)**

### 4. [Renaissance Greensleeves Triple Flute (C5) in Dorian Scale](04_greensleeves_dorian_c5/)
- **Scale**: dorian (`[0, 2, 3, 5, 7, 9, 10, 12]`)
- **Melody**: `greensleeves`
- **Mouthpiece**: `flat`
- **Instrument**: 6 tone holes of 8.0 mm, 388.9 mm tall, sounding 523.3 Hz with all holes closed
- 🔗 **[Explore Example & Interactive 3D Model](04_greensleeves_dorian_c5/)**

---

## 🛠️ Rebuilding All Examples

Requires [OpenSCAD](https://openscad.org/) on the PATH (or `OPENSCAD` pointing at it) for the
mesh and the two renders, and a Chromium that Puppeteer can launch for the audio.

```bash
npm install
npm run build:examples
```
