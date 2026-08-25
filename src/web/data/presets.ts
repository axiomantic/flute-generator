import type { FlutePreset } from '../types.js';

// -------------------------------------------------------------
export const DEFAULT_FLUTE_PRESETS: Record<string, FlutePreset> = {
  desert_drone: {
    name: "A4 Middle Eastern Hijaz Triple Flute",
    root: "69", scale: "hijaz", holes: "6", profile: "sac",
    chimDepth: "2.8", chimRim: "3.3",
    finish: "cedar", env: "canyon", indicator: "minimal_gem",
    song: "desert_caravan",
    breathCurve: [
      { t: 0.0, v: 0.65 },
      { t: 0.18, v: 0.95 },
      { t: 0.42, v: 0.70 },
      { t: 0.68, v: 0.98 },
      { t: 0.88, v: 0.82 },
      { t: 1.0, v: 0.60 }
    ]
  },
  plains_contrabass: {
    name: "C2 Contrabass Sacred 5-Hole",
    root: "36", scale: "native_american", holes: "5", profile: "sac",
    chimDepth: "3.2", chimRim: "3.6",
    finish: "walnut", env: "forest", indicator: "spirit_pads",
    song: "native_motif",
    breathCurve: [
      { t: 0.0, v: 0.50 },
      { t: 0.22, v: 0.85 },
      { t: 0.55, v: 0.95 },
      { t: 0.78, v: 0.75 },
      { t: 1.0, v: 0.45 }
    ]
  },
  baroque_tenor: {
    name: "C4 Tenor Dorian Flute",
    root: "60", scale: "dorian", holes: "7", profile: "venturi",
    chimDepth: "2.4", chimRim: "2.8",
    finish: "cherry", env: "studio", indicator: "minimal_gem",
    song: "greensleeves",
    breathCurve: [
      { t: 0.0, v: 0.70 },
      { t: 0.25, v: 0.90 },
      { t: 0.50, v: 0.75 },
      { t: 0.75, v: 0.92 },
      { t: 1.0, v: 0.65 }
    ]
  },
  piccolo_bright: {
    name: "D6 Piccolo High-Crown",
    root: "86", scale: "major", holes: "6", profile: "arched",
    chimDepth: "2.0", chimRim: "2.4",
    finish: "ebony", env: "cad_dark", indicator: "floating_orbs",
    song: "morning_mood",
    breathCurve: [
      { t: 0.0, v: 0.60 },
      { t: 0.30, v: 0.88 },
      { t: 0.60, v: 0.96 },
      { t: 0.85, v: 0.75 },
      { t: 1.0, v: 0.55 }
    ]
  }
};
