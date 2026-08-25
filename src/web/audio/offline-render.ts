// Faster-than-real-time render of a score through the studio's own audio path: the
// flute-pipes AudioWorklet (the digital waveguide) into the same dry/convolution output chain
// the page builds for live playback. Runs in any context with an OfflineAudioContext and an
// AudioWorklet, which the example generator supplies by driving a headless browser.
//
// Nothing here models acoustics. Every sample comes from WaveguideFlutePipe by way of
// FlutePipesProcessor, so the gallery cannot describe an instrument the studio does not play.
import { ensureFluteWorkletModule } from './worklet-loader.js';
import { connectFluteOutputChain } from './output-chain.js';
import { withRoomImpulseSeed } from './room-impulse.js';
import { scoreDurationSeconds } from '../data/score.js';
import type { FluteGeometry, ScoreNote, BreathPoint } from '../types.js';

export interface OfflineRenderOptions {
  sampleRate?: number;
  envKey?: string;
  slapGain?: number;
  /** Seconds of linear ramp at each end of the file. */
  fadeSeconds?: number;
  /**
   * Makes the render reproducible: with a seed, the same arguments produce the same samples,
   * because both noise sources on this path - the pipes' breath turbulence and the reverb
   * impulse response - are drawn from generators seeded from it. Omit it and both fall back to
   * Math.random(), which is what live playback uses. The gallery build supplies one so its
   * .wav files are not rewritten on every run.
   */
  seed?: number;
}

export interface OfflineRenderResult {
  left: Float32Array;
  right: Float32Array;
  sampleRate: number;
  durationSeconds: number;
}

export async function renderScoreOffline(
  geom: FluteGeometry,
  score: ScoreNote[],
  breath: BreathPoint[],
  options: OfflineRenderOptions = {}
): Promise<OfflineRenderResult> {
  const sampleRate = options.sampleRate ?? 44100;
  const envKey = options.envKey ?? 'canyon';
  const slapGain = options.slapGain ?? 0.65;
  const fadeSeconds = options.fadeSeconds ?? 0.025;
  const seed = options.seed;

  const durationSeconds = scoreDurationSeconds(score);
  if (!(durationSeconds > 0)) throw new Error('the score has zero duration; nothing to render');
  const frames = Math.round(durationSeconds * sampleRate);

  const ctx = new OfflineAudioContext({ numberOfChannels: 2, length: frames, sampleRate });
  await ensureFluteWorkletModule(ctx);

  const node = new AudioWorkletNode(ctx, 'flute-pipes', {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [2],
    processorOptions: { geometry: geom, score, breath, slapGain, seed }
  });

  // The reverb impulse is built inside connectFluteOutputChain(), which is shared with live
  // playback and takes no seed; the seed is scoped around the call instead. A different
  // constant from the pipes' seed, so the two noise sources are not the same stream.
  if (typeof seed === 'number') {
    withRoomImpulseSeed((seed ^ 0xc2b2ae35) >>> 0, () => connectFluteOutputChain(ctx, node, envKey));
  } else {
    connectFluteOutputChain(ctx, node, envKey);
  }

  const buffer = await ctx.startRendering();
  const left = new Float32Array(buffer.getChannelData(0));
  const right = new Float32Array(buffer.getChannelData(1));

  // The render is exactly one loop of the score, so the file's two ends meet when a player
  // loops it. Both the waveguide and the reverb tail are still sounding at the cut, and a hard
  // edge there is an audible click; a short symmetric ramp removes it without touching the body.
  const fade = Math.min(Math.floor(fadeSeconds * sampleRate), Math.floor(frames / 4));
  for (let i = 0; i < fade; i++) {
    const g = i / fade;
    left[i] *= g; right[i] *= g;
    const j = frames - 1 - i;
    left[j] *= g; right[j] *= g;
  }

  return { left, right, sampleRate, durationSeconds };
}
