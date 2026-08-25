import type { SongTemplate } from '../types.js';

// Soulfully syncopated song templates with micro-timings, breath pauses & mordents
export const SONG_TEMPLATES: Record<string, SongTemplate> = {
  desert_caravan: {
    name: "Desert Caravan (Hijaz Maqam Trill)",
    breathCurve: [
      { t: 0.0, v: 0.65 },
      { t: 0.18, v: 0.95 },
      { t: 0.42, v: 0.70 },
      { t: 0.68, v: 0.98 },
      { t: 0.88, v: 0.82 },
      { t: 1.0, v: 0.60 }
    ],
    intervals: [
      { deg: 0, d: 0.9 },
      { deg: 1, d: 0.22 }, { deg: 0, d: 0.09 }, { deg: 1, d: 0.16 }, { deg: 0, d: 0.08 }, { deg: 1, d: 0.65 },
      { deg: 2, d: 1.15 },
      { deg: 3, d: 0.18 }, { deg: 2, d: 0.09 }, { deg: 3, d: 0.12 }, { deg: 2, d: 0.08 }, { deg: 3, d: 0.09 }, { deg: 2, d: 0.09 }, { deg: 3, d: 1.35 },
      { deg: 4, d: 0.14 }, { deg: 5, d: 0.28 }, { deg: 4, d: 0.95 },
      { deg: 3, d: 0.18 }, { deg: 2, d: 0.12 }, { deg: 3, d: 0.45 }, { deg: 2, d: 0.35 }, { deg: 1, d: 0.55 }, { deg: 0, d: 2.8 }
    ]
  },
  native_motif: {
    name: "Plains Courting Song (Soulful Flutter)",
    breathCurve: [
      { t: 0.0, v: 0.52 },
      { t: 0.20, v: 0.88 },
      { t: 0.52, v: 0.96 },
      { t: 0.76, v: 0.74 },
      { t: 1.0, v: 0.48 }
    ],
    intervals: [
      { deg: 0, d: 1.1 }, { deg: 1, d: 0.25 }, { deg: 2, d: 0.75 },
      { deg: 3, d: 0.18 }, { deg: 2, d: 0.08 }, { deg: 3, d: 0.14 }, { deg: 2, d: 0.08 }, { deg: 3, d: 0.10 }, { deg: 2, d: 0.08 }, { deg: 3, d: 1.5 },
      { deg: 4, d: 0.85 }, { deg: 5, d: 0.14 }, { deg: 4, d: 0.09 }, { deg: 5, d: 0.18 }, { deg: 4, d: 0.12 }, { deg: 3, d: 1.05 },
      { deg: 2, d: 0.22 }, { deg: 3, d: 0.12 }, { deg: 2, d: 0.6 }, { deg: 1, d: 0.22 }, { deg: 2, d: 0.12 }, { deg: 1, d: 0.7 }, { deg: 0, d: 3.0 }
    ]
  },
  condor_pasa: {
    name: "El Cóndor Pasa (Andean Sway)",
    breathCurve: [
      { t: 0.0, v: 0.62 },
      { t: 0.28, v: 0.92 },
      { t: 0.50, v: 0.85 },
      { t: 0.78, v: 0.95 },
      { t: 1.0, v: 0.58 }
    ],
    intervals: [
      { deg: 3, d: 1.15 },
      { deg: 4, d: 0.18 }, { deg: 3, d: 0.09 }, { deg: 4, d: 0.45 }, { deg: 5, d: 0.9 },
      { deg: 4, d: 0.14 }, { deg: 5, d: 0.09 }, { deg: 4, d: 0.11 }, { deg: 5, d: 0.09 }, { deg: 4, d: 0.45 }, { deg: 3, d: 0.35 }, { deg: 2, d: 1.6 },
      { deg: 3, d: 0.16 }, { deg: 2, d: 0.09 }, { deg: 3, d: 0.14 }, { deg: 2, d: 0.09 }, { deg: 3, d: 0.8 }, { deg: 2, d: 0.35 }, { deg: 1, d: 0.4 }, { deg: 0, d: 2.8 }
    ]
  },
  greensleeves: {
    name: "Greensleeves (Baroque Sway)",
    breathCurve: [
      { t: 0.0, v: 0.68 },
      { t: 0.22, v: 0.88 },
      { t: 0.48, v: 0.75 },
      { t: 0.72, v: 0.92 },
      { t: 1.0, v: 0.62 }
    ],
    intervals: [
      { deg: 0, d: 0.75 }, { deg: 1, d: 1.4 },
      { deg: 2, d: 0.22 }, { deg: 1, d: 0.12 }, { deg: 2, d: 0.7 },
      { deg: 3, d: 1.15 },
      { deg: 4, d: 0.16 }, { deg: 3, d: 0.08 }, { deg: 4, d: 0.14 }, { deg: 3, d: 0.09 }, { deg: 4, d: 0.45 }, { deg: 3, d: 0.85 },
      { deg: 2, d: 1.35 },
      { deg: 1, d: 0.22 }, { deg: 0, d: 0.11 }, { deg: 1, d: 0.16 }, { deg: 0, d: 0.09 }, { deg: 1, d: 0.7 }, { deg: 0, d: 2.8 }
    ]
  },
  morning_mood: {
    name: "Morning Mood (Grieg Pastoral)",
    breathCurve: [
      { t: 0.0, v: 0.58 },
      { t: 0.30, v: 0.85 },
      { t: 0.58, v: 0.94 },
      { t: 0.82, v: 0.72 },
      { t: 1.0, v: 0.54 }
    ],
    intervals: [
      { deg: 3, d: 0.45 }, { deg: 2, d: 0.35 }, { deg: 1, d: 0.35 }, { deg: 0, d: 0.45 },
      { deg: 1, d: 0.18 }, { deg: 0, d: 0.08 }, { deg: 1, d: 0.14 }, { deg: 0, d: 0.08 }, { deg: 1, d: 0.4 }, { deg: 2, d: 0.4 },
      { deg: 3, d: 0.16 }, { deg: 2, d: 0.08 }, { deg: 3, d: 0.14 }, { deg: 2, d: 0.09 }, { deg: 3, d: 1.2 },
      { deg: 4, d: 0.22 }, { deg: 5, d: 0.14 }, { deg: 4, d: 0.18 }, { deg: 5, d: 0.14 }, { deg: 4, d: 1.6 }
    ]
  },
  amazing_grace: {
    name: "Amazing Grace (Gospel Sway)",
    breathCurve: [
      { t: 0.0, v: 0.65 },
      { t: 0.26, v: 0.92 },
      { t: 0.54, v: 0.98 },
      { t: 0.78, v: 0.82 },
      { t: 1.0, v: 0.58 }
    ],
    intervals: [
      { deg: 0, d: 0.85 }, { deg: 2, d: 1.6 },
      { deg: 3, d: 0.22 }, { deg: 2, d: 0.11 }, { deg: 3, d: 0.18 }, { deg: 2, d: 0.11 }, { deg: 4, d: 0.75 },
      { deg: 3, d: 0.45 }, { deg: 2, d: 1.8 },
      { deg: 4, d: 0.18 }, { deg: 3, d: 0.09 }, { deg: 4, d: 0.14 }, { deg: 3, d: 0.09 }, { deg: 4, d: 0.95 },
      { deg: 5, d: 0.22 }, { deg: 4, d: 0.14 }, { deg: 3, d: 2.5 }, { deg: 2, d: 0.85 }, { deg: 0, d: 3.2 }
    ]
  }
};
