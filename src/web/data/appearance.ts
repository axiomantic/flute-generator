import type { WoodProfile, ThemePreset, EnvProfile, PartCharacter, PartKey } from '../types.js';

export const WOOD_PROFILES: Record<string, WoodProfile> = {
  cedar: {
    name: "Western Red Cedar",
    color: 0xba7d48, dark: 0x6e3c1b,
    roughness: 0.38, metalness: 0.06, grain: 1.2, isBamboo: false
  },
  walnut: {
    name: "Black Walnut",
    color: 0x4a3224, dark: 0x22140c,
    roughness: 0.28, metalness: 0.12, grain: 1.0, isBamboo: false
  },
  cherry: {
    name: "Wild Cherry",
    color: 0x8a3826, dark: 0x47160c,
    roughness: 0.32, metalness: 0.08, grain: 1.1, isBamboo: false
  },
  ebony: {
    name: "African Ebony",
    color: 0x222226, dark: 0x0f0f12,
    roughness: 0.20, metalness: 0.22, grain: 0.8, isBamboo: false
  },
  bamboo: {
    name: "Golden Bamboo",
    color: 0xd9b362, dark: 0x8c6b28,
    roughness: 0.40, metalness: 0.04, grain: 1.0, isBamboo: true
  }
};


// Atmospheric lighting & backgrounds
// Streamlined Visual Theme Presets (Material Finish + Atmospheric Lighting + Contrast Pairing)
// `parts` colours the tone-hole donuts and the keywork hardware. They live in the theme rather than
// behind their own pickers because the control panel is deliberately kept to a single theme selector;
// each palette is chosen so the parts stay separable against that theme's body and lighting.
export const THEME_PRESETS: Record<string, ThemePreset> = {
  cedar_canyon: {
    wood: 'cedar', env: 'canyon', opacity: 100, indicator: 'minimal_gem',
    parts: {
      chimney: 0x11202e, axlePin: 0xf8fafc, hingeStanch: 0x5b7085, hingeBoss: 0x8b5cf6,
      touchPad: 0xfff1c2, keyCup: 0x22c55e, padGasket: 0xf43f5e
    }
  },
  ebony_studio: {
    wood: 'ebony', env: 'studio', opacity: 100, indicator: 'minimal_gem',
    parts: {
      chimney: 0xf59e0b, axlePin: 0xf1f5f9, hingeStanch: 0x94a3b8, hingeBoss: 0xc084fc,
      touchPad: 0xd9f99d, keyCup: 0xfb7185, padGasket: 0x2dd4bf
    }
  },
  bamboo_forest: {
    wood: 'bamboo', env: 'forest', opacity: 100, indicator: 'floating_orbs',
    parts: {
      chimney: 0x312e81, axlePin: 0xf8fafc, hingeStanch: 0x6b7280, hingeBoss: 0xd946ef,
      touchPad: 0xffe4e6, keyCup: 0xea580c, padGasket: 0x06b6d4
    }
  },
  walnut_dark: {
    wood: 'walnut', env: 'cad_dark', opacity: 100, indicator: 'minimal_gem',
    parts: {
      chimney: 0x67e8f9, axlePin: 0xe5e7eb, hingeStanch: 0x7c8899, hingeBoss: 0xa78bfa,
      touchPad: 0xecfccb, keyCup: 0xf97316, padGasket: 0xf43f5e
    }
  },
  cherry_studio: {
    wood: 'cherry', env: 'studio', opacity: 100, indicator: 'minimal_gem',
    parts: {
      chimney: 0x0f766e, axlePin: 0xf1f5f9, hingeStanch: 0x64748b, hingeBoss: 0x6366f1,
      touchPad: 0xe0f2fe, keyCup: 0x84cc16, padGasket: 0xd946ef
    }
  },
  xray_cad: {
    wood: 'bamboo', env: 'cad_dark', opacity: 35, indicator: 'minimal_gem',
    parts: {
      chimney: 0x7dd3fc, axlePin: 0xffffff, hingeStanch: 0x38bdf8, hingeBoss: 0xc4b5fd,
      touchPad: 0xfef9c3, keyCup: 0xfda4af, padGasket: 0x86efac
    }
  }
};

// Surface character is a property of the part, not of the theme: an axle pin reads as a polished pin
// under every palette. Only the colour comes from the theme. `emissiveScale` marks the two parts that
// self-illuminate; their emissive colour is derived from the theme colour so the glow always matches.
export const PART_MATERIAL_CHARACTER: Record<PartKey, PartCharacter> = {
  chimney:     { metalness: 0.45, roughness: 0.42 },
  axlePin:     { metalness: 0.95, roughness: 0.15 },
  hingeStanch: { metalness: 0.80, roughness: 0.30 },
  hingeBoss:   { metalness: 0.70, roughness: 0.25 },
  touchPad:    { metalness: 0.30, roughness: 0.15, emissiveScale: 0.25 },
  keyCup:      { metalness: 0.88, roughness: 0.22 },
  padGasket:   { metalness: 0.10, roughness: 0.40, emissiveScale: 0.70 }
};


// High-contrast, studio-grade atmospheric lighting & backgrounds
export const ENV_PROFILES: Record<string, EnvProfile> = {
  canyon: {
    bg: 'radial-gradient(circle at 50% 35%, #4a212b 0%, #200c19 55%, #0a0308 100%)',
    ambient: 0xfff1e6, ambientInt: 1.15,
    keyLight: 0xffc48c, keyInt: 1.45,
    fillLight: 0x9d71e8, fillInt: 0.75,
    rimLight: 0xffedd5, rimInt: 1.10,
    gridColor: 0x662940
  },
  studio: {
    bg: 'radial-gradient(circle at 50% 40%, #1e293b 0%, #0f172a 60%, #030712 100%)',
    ambient: 0xffffff, ambientInt: 1.20,
    keyLight: 0xfff7ed, keyInt: 1.40,
    fillLight: 0x60a5fa, fillInt: 0.80,
    rimLight: 0x38bdf8, rimInt: 1.20,
    gridColor: 0x334155
  },
  forest: {
    bg: 'radial-gradient(circle at 50% 30%, #143d32 0%, #071f18 60%, #020b08 100%)',
    ambient: 0xf0fdf4, ambientInt: 1.15,
    keyLight: 0xdcfce7, keyInt: 1.35,
    fillLight: 0x38bdf8, fillInt: 0.70,
    rimLight: 0x34d399, rimInt: 1.15,
    gridColor: 0x065f46
  },
  cad_dark: {
    bg: 'radial-gradient(circle at 50% 50%, #1e1e38 0%, #0c0c1a 70%, #020208 100%)',
    ambient: 0xf8fafc, ambientInt: 1.25,
    keyLight: 0x38bdf8, keyInt: 1.50,
    fillLight: 0xa78bfa, fillInt: 0.85,
    rimLight: 0xf472b6, rimInt: 1.30,
    gridColor: 0x475569
  }
};

/** Iteration order matches PART_MATERIAL_CHARACTER's declaration order. */
export const PART_KEYS: PartKey[] = [
  'chimney', 'axlePin', 'hingeStanch', 'hingeBoss', 'touchPad', 'keyCup', 'padGasket'
];
