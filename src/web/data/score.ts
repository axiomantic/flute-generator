// Score construction: turning a song template plus the flute's scale into the note list the
// waveguide engine plays. Pure, so the studio and the offline example generator build a score
// the same way; the studio's copies of these lived inside app.ts and read the DOM directly,
// which made them unreachable from anything but the page.
import { SCALES } from './scales.js';
import { SONG_TEMPLATES } from './songs.js';
import type { ScoreNote, BreathPoint } from '../types.js';

export function scaleIntervalsFor(scaleKey: string): number[] {
  return SCALES[scaleKey] || SCALES.minor_pentatonic;
}

/** Bell fundamental, then one pitch per hole opened in turn, then the first overblown octave. */
export function getPlayablePitches(rootMidi: number, scaleKey: string, numHoles: number): number[] {
  const intervals = scaleIntervalsFor(scaleKey);
  const pitches = [rootMidi];
  for (let h = 0; h < numHoles; h++) {
    const targetInterval = intervals[h + 1] !== undefined ? intervals[h + 1] : Math.round(12 * (h + 1) / (numHoles + 1));
    pitches.push(rootMidi + targetInterval);
  }
  pitches.push(rootMidi + 12);
  return pitches;
}

export function quantizeMidi(target: number, rootMidi: number, scaleKey: string, numHoles: number): number {
  const playable = getPlayablePitches(rootMidi, scaleKey, numHoles);
  if (!playable.length) return target;
  return playable.reduce((closest, p) => Math.abs(p - target) < Math.abs(closest - target) ? p : closest, playable[0]);
}

/** Holes 0..k-1 open, the rest closed, where k is the pitch's index in the scale. */
export function midiToHoles(midi: number, rootMidi: number, scaleKey: string, numHoles: number): boolean[] {
  const intervals = scaleIntervalsFor(scaleKey);
  const interval = (midi - rootMidi) % 12;
  const intervalIdx = intervals.indexOf(interval);

  const holes: boolean[] = Array(numHoles).fill(true);
  if (intervalIdx > 0) {
    for (let h = 0; h < Math.min(numHoles, intervalIdx); h++) holes[h] = false;
  }
  return holes;
}

/** Total wall time the score occupies. The audio processor loops on exactly this boundary. */
export function scoreDurationSeconds(score: ScoreNote[]): number {
  return score.reduce((m, n) => Math.max(m, (n.startTime || 0) + n.duration), 0);
}

export interface SongScore {
  notes: ScoreNote[];
  breathCurve: BreathPoint[];
  /** The template actually used; a key the table does not hold falls back to desert_caravan. */
  templateName: string;
}

/**
 * Expands a song template's scale degrees against this flute's own playable pitches. Degrees
 * beyond the scale length wrap up an octave; every resulting pitch is quantized to something
 * the instrument can actually sound.
 */
export function buildSongScore(songKey: string, rootMidi: number, scaleKey: string, numHoles: number): SongScore {
  const intervals = scaleIntervalsFor(scaleKey);
  const tmpl = SONG_TEMPLATES[songKey] || SONG_TEMPLATES.desert_caravan;

  const notes: ScoreNote[] = [];
  let currentStart = 0;
  for (const item of tmpl.intervals) {
    const degreeClamped = item.deg % intervals.length;
    const octShift = Math.floor(item.deg / intervals.length);
    const targetMidi = rootMidi + (octShift * 12) + intervals[degreeClamped];
    const qMidi = quantizeMidi(targetMidi, rootMidi, scaleKey, numHoles);
    const dur = Math.max(0.1, item.d * 0.75);

    notes.push({
      startTime: parseFloat(currentStart.toFixed(3)),
      midi: qMidi,
      holes: midiToHoles(qMidi, rootMidi, scaleKey, numHoles),
      duration: parseFloat(dur.toFixed(3))
    });
    currentStart += dur;
  }

  return {
    notes,
    breathCurve: JSON.parse(JSON.stringify(tmpl.breathCurve)) as BreathPoint[],
    templateName: tmpl.name
  };
}
