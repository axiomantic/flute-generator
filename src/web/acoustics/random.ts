// A seedable uniform generator, kept apart from any engine so the page bundle and the
// worklet bundle can both take it without pulling the other's code in.
//
// It exists for one reason: the gallery is a reproducible build. `npm run build:examples`
// must write the same bytes from the same settings, and both noise sources on the offline
// render path — the jet turbulence in WaveguideFlutePipe and the impulse response in
// createRoomImpulseBuffer() — would otherwise be Math.random(). Live playback passes no seed
// and keeps Math.random(), so a played note is never the same twice.

/**
 * mulberry32: a 32-bit state, one multiply-xorshift round, uniform on [0, 1).
 * Chosen over an LCG because the low bits of an LCG are visibly periodic at audio rates,
 * and over a crypto generator because reproducibility, not unpredictability, is the goal.
 */
export function createSeededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a over a string, so a caller can turn a stable name into a stable seed. */
export function seedFromString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
