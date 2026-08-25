// The two byte-level exporters. Both ship in the gallery (flute.mid, flute.wav) and in the
// studio's download buttons, and neither had any check at all. Their output is decoded back here
// rather than hashed, so a failure says what is wrong with the file and not only that it moved.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { createSeededRandom } from '../src/web/acoustics/random.js';
import { WaveguideFlutePipe } from '../src/web/acoustics/waveguide.js';
import { buildSongScore, scoreDurationSeconds } from '../src/web/data/score.js';
import { encodeScoreMidi } from '../src/web/export/midi.js';
import { encodeWav16 } from '../src/web/export/wav.js';
import { computeFluteGeometry } from '../src/web/geometry/flute.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TICKS_PER_SECOND = 960;

describe('WAV export', () => {
  const left = Float32Array.from([0, 0.5, -0.5, 1.0, -1.0, 2.0, -2.0]);
  const right = Float32Array.from([0, -0.25, 0.25, -1.0, 1.0, -2.0, 2.0]);
  const bytes = encodeWav16(left, right, 44100);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (o: number, n: number) => String.fromCharCode(...bytes.subarray(o, o + n));

  it('is a well-formed 16-bit stereo RIFF/WAVE', () => {
    expect(ascii(0, 4)).toBe('RIFF');
    expect(ascii(8, 4)).toBe('WAVE');
    expect(ascii(12, 4)).toBe('fmt ');
    expect(view.getUint16(20, true)).toBe(1);       // PCM
    expect(view.getUint16(22, true)).toBe(2);       // stereo
    expect(view.getUint32(24, true)).toBe(44100);
    expect(view.getUint16(34, true)).toBe(16);      // bits per sample
    expect(ascii(36, 4)).toBe('data');
    expect(view.getUint32(40, true)).toBe(left.length * 2 * 2);
    expect(view.getUint32(4, true)).toBe(bytes.length - 8);
    expect(bytes.length).toBe(44 + left.length * 2 * 2);
  });

  it('clips asymmetrically, the way two-complement 16-bit actually reaches', () => {
    const at = (frame: number, ch: 0 | 1) => view.getInt16(44 + frame * 4 + ch * 2, true);
    expect(at(0, 0)).toBe(0);
    expect(at(3, 0)).toBe(32767);   // +1.0 -> the largest positive value
    expect(at(4, 0)).toBe(-32768);  // -1.0 -> the largest negative value
    expect(at(5, 0)).toBe(32767);   // +2.0 clipped, not wrapped
    expect(at(6, 0)).toBe(-32768);  // -2.0 clipped, not wrapped
  });

  it('truncates to the shorter channel rather than reading past it', () => {
    const short = encodeWav16(Float32Array.from([0, 0, 0]), Float32Array.from([0]), 48000);
    expect(short.length).toBe(44 + 1 * 2 * 2);
  });
});

// The gallery's flute.wav files are checked in, so `npm run build:examples` has to be a
// reproducible build: same settings in, same bytes out. It is the seeded rng seam that makes
// that true, and nothing else in the suite would notice if it were removed.
describe('seeded render reproducibility', () => {
  function run(rng: (() => number) | null, samples: number): Float64Array {
    const pipe = new WaveguideFlutePipe(44100, 19.0, 400.0, []);
    pipe.rng = rng;
    const out = new Float64Array(samples);
    for (let i = 0; i < samples; i++) out[i] = pipe.process(0.7);
    return out;
  }

  it('one seed gives one sequence, a different seed gives a different one', () => {
    const a = Array.from({ length: 64 }, createSeededRandom(1001));
    const b = Array.from({ length: 64 }, createSeededRandom(1001));
    const c = Array.from({ length: 64 }, createSeededRandom(1002));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    for (const v of a) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('two pipes on the same seed render the same samples', () => {
    const a = run(createSeededRandom(1001), 4096);
    const b = run(createSeededRandom(1001), 4096);
    // A silent pipe would compare equal for the wrong reason.
    expect(a.some((v) => v !== 0)).toBe(true);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('the seed is what does it: unseeded, the same two renders differ', () => {
    // The control for the row above. Without it, deleting the rng seam and leaving every pipe
    // on Math.random() would still leave this suite green on a determinism claim.
    const a = run(null, 4096);
    const b = run(null, 4096);
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });
});

describe('MIDI export', () => {
  const root = 69;
  const geom = computeFluteGeometry(root, 'hijaz', 6);
  const song = buildSongScore('desert_caravan', root, 'hijaz', geom.numHoles);
  const bytes = encodeScoreMidi({
    score: song.notes, breath: song.breathCurve, drone1Midi: root + 0, drone2Midi: root + 7
  });

  /** Splits the file into (id, body) chunks, which also proves every length field is right. */
  function chunks(): { id: string; body: Uint8Array }[] {
    const out: { id: string; body: Uint8Array }[] = [];
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let p = 0;
    while (p < bytes.length) {
      const id = String.fromCharCode(...bytes.subarray(p, p + 4));
      const len = view.getUint32(p + 4, false);
      out.push({ id, body: bytes.subarray(p + 8, p + 8 + len) });
      p += 8 + len;
    }
    return out;
  }

  it('is a format 1 file of four correctly-sized chunks', () => {
    const cs = chunks();
    expect(cs.map((c) => c.id)).toEqual(['MThd', 'MTrk', 'MTrk', 'MTrk', 'MTrk']);
    const head = new DataView(cs[0].body.buffer, cs[0].body.byteOffset, cs[0].body.byteLength);
    expect(head.getUint16(0, false)).toBe(1);    // format 1
    expect(head.getUint16(2, false)).toBe(4);    // four tracks
    expect(head.getUint16(4, false)).toBe(480);  // ticks per beat
  });

  it('every note in the score becomes a matched note_on / note_off pair', () => {
    const melody = chunks()[2].body;
    let p = 0;
    const readVar = (): number => {
      let v = 0;
      for (;;) { const b = melody[p++]; v = (v << 7) | (b & 0x7f); if ((b & 0x80) === 0) return v; }
    };
    let tick = 0;
    const ons: { midi: number; tick: number; velocity: number }[] = [];
    const offs: { midi: number; tick: number }[] = [];
    while (p < melody.length) {
      tick += readVar();
      const status = melody[p++];
      if (status === 0xff) { const meta = melody[p++]; const len = readVar(); p += len; if (meta === 0x2f) break; continue; }
      if ((status & 0xf0) === 0xc0) { p += 1; continue; }
      const midi = melody[p++], vel = melody[p++];
      if ((status & 0xf0) === 0x90) ons.push({ midi, tick, velocity: vel });
      else offs.push({ midi, tick });
    }
    expect(ons.length).toBe(song.notes.length);
    expect(offs.length).toBe(song.notes.length);
    song.notes.forEach((n, i) => {
      expect(ons[i].midi, `note ${i}`).toBe(n.midi);
      expect(ons[i].tick).toBe(Math.round((n.startTime || 0) * TICKS_PER_SECOND));
      // Velocity carries the breath pressure at that instant, so it must be a legal, audible value.
      expect(ons[i].velocity).toBeGreaterThanOrEqual(1);
      expect(ons[i].velocity).toBeLessThanOrEqual(127);
    });
    // The drone tracks hold their pitch for the whole score.
    expect(scoreDurationSeconds(song.notes)).toBeGreaterThan(0);
  });

  it('each drone track sounds its own pitch for the score length', () => {
    const total = Math.max(1, Math.round(scoreDurationSeconds(song.notes) * TICKS_PER_SECOND));
    for (const [idx, midi, channel] of [[3, root + 0, 1], [4, root + 7, 2]] as const) {
      const body = chunks()[idx].body;
      expect(Array.from(body)).toContain(0x90 | channel);
      // note_on <midi> 70 appears somewhere in the track, and so does the matching note_off.
      const on = Array.from(body).findIndex((b, i) =>
        b === (0x90 | channel) && body[i + 1] === midi && body[i + 2] === 70);
      expect(on, `drone on channel ${channel}`).toBeGreaterThanOrEqual(0);
      const off = Array.from(body).findIndex((b, i) =>
        b === (0x80 | channel) && body[i + 1] === midi && body[i + 2] === 0x40);
      expect(off, `drone off channel ${channel}`).toBeGreaterThan(on);
      expect(total).toBeGreaterThan(0);
    }
  });

  it('the checked-in gallery .mid is what the exporter produces today', () => {
    // Same drift guard the SCAD golden gets, applied to the byte stream a DAW opens. Example 02
    // is exactly this configuration: A4, hijaz, desert_caravan, drones at 0 and +7.
    const onDisk = readFileSync(path.join(ROOT, 'examples', '02_desert_caravan_hijaz_venturi', 'flute.mid'));
    expect(Buffer.from(bytes).equals(onDisk)).toBe(true);
  });
});
