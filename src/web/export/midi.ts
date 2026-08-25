// Minimal Standard MIDI File writer. It serialises exactly what a ScoreNote[] carries and
// invents nothing: the melody track is the score, and the two drone tracks hold the pitches the
// waveguide drones sound for the score's whole length. There is no ornament, articulation or
// pan model here, because the score object has no such fields to serialise.
//
// The score is in seconds. A fixed 120 BPM tempo with 480 ticks per beat makes one second
// exactly 960 ticks, so no timing information is lost in the conversion.
import type { ScoreNote, BreathPoint } from '../types.js';

const TICKS_PER_BEAT = 480;
const TEMPO_US_PER_BEAT = 500000;
const TICKS_PER_SECOND = TICKS_PER_BEAT * (1e6 / TEMPO_US_PER_BEAT);

/** MIDI program 73 = Flute in the General MIDI melodic set. */
const GM_FLUTE = 73;

function varLen(value: number): number[] {
  let v = Math.max(0, Math.round(value));
  const bytes = [v & 0x7f];
  v >>= 7;
  while (v > 0) {
    bytes.unshift((v & 0x7f) | 0x80);
    v >>= 7;
  }
  return bytes;
}

function chunk(id: string, body: number[]): number[] {
  const len = body.length;
  return [
    id.charCodeAt(0), id.charCodeAt(1), id.charCodeAt(2), id.charCodeAt(3),
    (len >>> 24) & 0xff, (len >>> 16) & 0xff, (len >>> 8) & 0xff, len & 0xff,
    ...body
  ];
}

function trackName(name: string): number[] {
  const text = Array.from(name, (c) => c.charCodeAt(0) & 0x7f);
  return [0x00, 0xff, 0x03, ...varLen(text.length), ...text];
}

const END_OF_TRACK = [0x00, 0xff, 0x2f, 0x00];

interface TimedEvent { tick: number; bytes: number[]; }

/** Sorts by tick, then emits delta times. note_off precedes note_on at the same tick. */
function serialiseEvents(events: TimedEvent[]): number[] {
  const ordered = events
    .map((e, i) => ({ e, i }))
    .sort((a, b) => (a.e.tick - b.e.tick) || (a.i - b.i))
    .map((x) => x.e);
  const out: number[] = [];
  let last = 0;
  for (const ev of ordered) {
    out.push(...varLen(ev.tick - last), ...ev.bytes);
    last = ev.tick;
  }
  return out;
}

function breathAt(breath: BreathPoint[], tNorm: number): number {
  if (!breath || breath.length === 0) return 0.7;
  const t = Math.max(0, Math.min(1, tNorm));
  for (let i = 0; i < breath.length - 1; i++) {
    if (t >= breath[i].t && t <= breath[i + 1].t) {
      const span = breath[i + 1].t - breath[i].t;
      const a = span > 0 ? (t - breath[i].t) / span : 0;
      return breath[i].v + a * (breath[i + 1].v - breath[i].v);
    }
  }
  return breath[breath.length - 1].v;
}

export interface MidiExportOptions {
  score: ScoreNote[];
  breath: BreathPoint[];
  /** Absolute MIDI note numbers of the two drone pipes. */
  drone1Midi: number;
  drone2Midi: number;
}

export function encodeScoreMidi(opts: MidiExportOptions): Uint8Array {
  const { score, breath, drone1Midi, drone2Midi } = opts;
  const totalSeconds = score.reduce((m, n) => Math.max(m, (n.startTime || 0) + n.duration), 0);
  const totalTicks = Math.max(1, Math.round(totalSeconds * TICKS_PER_SECOND));

  // Track 0, the conductor: tempo only, so a DAW reads the seconds back unchanged.
  const conductor = chunk('MTrk', [
    ...trackName('Conductor'),
    0x00, 0xff, 0x51, 0x03,
    (TEMPO_US_PER_BEAT >>> 16) & 0xff, (TEMPO_US_PER_BEAT >>> 8) & 0xff, TEMPO_US_PER_BEAT & 0xff,
    ...END_OF_TRACK
  ]);

  const melodyEvents: TimedEvent[] = [];
  for (const note of score) {
    const start = note.startTime || 0;
    const onTick = Math.round(start * TICKS_PER_SECOND);
    const offTick = Math.round((start + note.duration) * TICKS_PER_SECOND);
    // Velocity is the breath pressure the synth is driven with at that instant, so the MIDI
    // dynamics follow the same curve the rendered audio does.
    const v = Math.max(1, Math.min(127, Math.round(breathAt(breath, totalSeconds > 0 ? start / totalSeconds : 0) * 127)));
    melodyEvents.push({ tick: onTick, bytes: [0x90, note.midi & 0x7f, v] });
    melodyEvents.push({ tick: Math.max(offTick, onTick + 1), bytes: [0x80, note.midi & 0x7f, 0x40] });
  }
  const melody = chunk('MTrk', [
    ...trackName('Melody Pipe'),
    0x00, 0xc0, GM_FLUTE,
    ...serialiseEvents(melodyEvents),
    ...END_OF_TRACK
  ]);

  const droneTrack = (name: string, channel: number, midi: number): number[] => chunk('MTrk', [
    ...trackName(name),
    0x00, 0xc0 | channel, GM_FLUTE,
    ...serialiseEvents([
      { tick: 0, bytes: [0x90 | channel, midi & 0x7f, 70] },
      { tick: totalTicks, bytes: [0x80 | channel, midi & 0x7f, 0x40] }
    ]),
    ...END_OF_TRACK
  ]);

  const header = chunk('MThd', [
    0x00, 0x01,                                     // format 1, multi-track
    0x00, 0x04,                                     // four tracks
    (TICKS_PER_BEAT >> 8) & 0xff, TICKS_PER_BEAT & 0xff
  ]);

  return Uint8Array.from([
    ...header,
    ...conductor,
    ...melody,
    ...droneTrack('Drone Pipe 1', 1, drone1Midi),
    ...droneTrack('Drone Pipe 2', 2, drone2Midi)
  ]);
}
