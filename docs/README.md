# 🪈 Flute Generator Examples & Showcase Gallery

A gallery of multi-drone flutes demonstrating various acoustic scales, melodies, and specialized mouthpiece designs.

Each example directory includes:
- 📸 **3D CAD Renders** (`flute_iso.png`, `flute_head.png`)
- 🔊 **Synthesized Audio** (`flute.wav`)
- 🎼 **MIDI Sequence** (`flute.mid`)
- 📐 **Parametric OpenSCAD Model** (`flute.scad`)
- 🖨️ **3D-Printable Mesh** (`flute.stl`)
- 🌐 **Interactive 3D Web Viewer & Player** (`index.html`)

---

## 🌟 Showcase Gallery

### 1. [Native American Triple Flute (A4) with Slow Air Chamber (SAC)](01_native_american_a4_sac/)
- **Scale**: Native American (`[0, 3, 5, 7, 10, 12]`)
- **Melody**: *Native Spirit Motif*
- **Mouthpiece**: Internal Slow Air Chamber (SAC) expansion reservoir for breath stabilization and warm attack.
- 🔗 **[Explore Example & Interactive 3D Model](01_native_american_a4_sac/)**

### 2. [Desert Caravan Middle Eastern Flute (A4) with Micro-Ribbed Airways](02_desert_caravan_hijaz_ribbed/)
- **Scale**: Hijaz (`[0, 1, 4, 5, 7, 8, 10, 12]`)
- **Melody**: *Desert Caravan*
- **Mouthpiece**: Venturi converging airway with micro-ribbed drone channels for organic acoustic rasp.
- 🔗 **[Explore Example & Interactive 3D Model](02_desert_caravan_hijaz_ribbed/)**

### 3. [Andean Condor Pasa Triple Flute (A4) with Arched Baroque Windway](03_baroque_condor_pasa_arched/)
- **Scale**: Minor Pentatonic (`[0, 3, 5, 7, 10, 12]`)
- **Melody**: *El Cóndor Pasa*
- **Mouthpiece**: Crowned arched ceiling for focused laminar airflow and singing overtones.
- 🔗 **[Explore Example & Interactive 3D Model](03_baroque_condor_pasa_arched/)**

### 4. [Renaissance Greensleeves Triple Flute (C5) in Dorian Scale](04_greensleeves_dorian_c5/)
- **Scale**: Dorian (`[0, 2, 3, 5, 7, 9, 10, 12]`)
- **Melody**: *Greensleeves*
- **Mouthpiece**: Flat planar windway with calibrated harmonic fifth drone accompaniment.
- 🔗 **[Explore Example & Interactive 3D Model](04_greensleeves_dorian_c5/)**

---

## 🛠️ Rebuilding All Examples

To re-render all examples with updated models or sound settings, run:

```bash
python scripts/build_examples.py
```
