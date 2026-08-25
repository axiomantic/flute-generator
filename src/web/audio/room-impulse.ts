import { createSeededRandom } from '../acoustics/random.js';

// The impulse response is noise, so it is a second source of run-to-run variation in the
// gallery's .wav files. connectFluteOutputChain() builds the same graph for live playback and
// for the offline render and takes no seed, so the seed is supplied around the call instead of
// through it: withRoomImpulseSeed() installs a generator for the duration of one callback.
// Outside that scope the value is null and Math.random() is used, which is what live playback
// gets.
let impulseRandom: (() => number) | null = null;

/** Runs `fn` with createRoomImpulseBuffer() drawing from a generator seeded by `seed`. */
export function withRoomImpulseSeed<T>(seed: number, fn: () => T): T {
  const previous = impulseRandom;
  impulseRandom = createSeededRandom(seed);
  try {
    return fn();
  } finally {
    impulseRandom = previous;
  }
}

export function createRoomImpulseBuffer(ctx: BaseAudioContext, envKey = 'canyon'): AudioBuffer {
  const random = impulseRandom ?? Math.random;
  const sampleRate = ctx.sampleRate;
  let duration = 2.4;
  let decay = 2.8;
  let earlyReflectionsCount = 18;

  if (envKey === 'studio') {
    duration = 1.1; decay = 4.2; earlyReflectionsCount = 12;
  } else if (envKey === 'forest') {
    duration = 2.0; decay = 3.0; earlyReflectionsCount = 24;
  } else if (envKey === 'cad_dark') {
    duration = 0.5; decay = 6.0; earlyReflectionsCount = 8;
  } else {
    // Canyon
    duration = 2.8; decay = 2.2; earlyReflectionsCount = 30;
  }

  const length = Math.floor(sampleRate * duration);
  const impulse = ctx.createBuffer(2, length, sampleRate);
  const left = impulse.getChannelData(0);
  const right = impulse.getChannelData(1);

  // Generate early reflection clusters + smooth diffuse reverberant tail
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const env = Math.exp(-decay * t);

    // Diffuse stereo noise tail
    const noiseL = (random() * 2 - 1) * env;
    const noiseR = (random() * 2 - 1) * env;

    left[i] = noiseL * 0.7;
    right[i] = noiseR * 0.7;
  }

  // Inject discrete early reflections with acoustic stereo panning
  for (let r = 0; r < earlyReflectionsCount; r++) {
    const delayTime = 0.015 + (r / earlyReflectionsCount) * 0.18 + random() * 0.01;
    const idx = Math.floor(delayTime * sampleRate);
    if (idx < length) {
      const amp = (1.0 - r / earlyReflectionsCount) * 0.45;
      const pan = random();
      left[idx] += amp * (1 - pan);
      right[idx] += amp * pan;
    }
  }

  return impulse;
}
