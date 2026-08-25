import { createRoomImpulseBuffer } from './room-impulse.js';

/**
 * The studio's output chain:
 *   engine -> [dry gain + convolution room reverb] -> master -> limiter -> destination
 * Live playback and the offline render used to be able to drift apart here; they now build
 * this one graph, so a rendered .wav is the same signal the page plays.
 */
export interface FluteOutputChain {
  dryGain: GainNode;
  wetGain: GainNode;
  convolver: ConvolverNode;
  masterGain: GainNode;
  /** The three nodes of the limiter, in signal order. */
  limiterIn: GainNode;
  limiterShaper: WaveShaperNode;
  limiterOut: GainNode;
}

/**
 * Below this the transfer curve is the identity line, so nothing quieter than it is touched.
 * It sits above the loudest thing the waveguide engine produces through this chain, which is
 * the C2 contrabass at 0.870 (measured; the A4 default reaches 0.620). The modal engine's own
 * peak of 1.31 is what the limiter is here to catch.
 */
export const LIMITER_THRESHOLD = 0.95;
/** Where the curve asymptotes. Nothing leaves this chain louder than this. */
export const LIMITER_CEILING = 1.0;

/**
 * WaveShaperNode clamps its input to [-1, 1] before the curve lookup, so a limiter built on one
 * alone can only ever act at full scale, which is where the destination already hard-clips. The
 * signal is therefore halved into the shaper and doubled back out, giving the curve an effective
 * domain of [-2, 2]. Both factors are powers of two, so neither multiplication loses a bit.
 */
const LIMITER_HEADROOM = 2;

/**
 * 2^11 + 1 points. Odd, so one breakpoint lands exactly on zero and the curve is symmetric.
 *
 * Linear interpolation along the identity stretch returns the input in exact arithmetic, but the
 * browser computes the curve index in floating point, which leaves a residual of one float32 ulp
 * (measured: 1.19e-7 absolute, i.e. below -138 dBFS) on samples that never reach the knee. That
 * residual is a property of the index arithmetic, not of the grid: raising this to 8193 was
 * measured and moved it not at all, so the larger table buys nothing.
 */
const LIMITER_CURVE_POINTS = 2049;

/**
 * A soft-knee limiter: identity up to LIMITER_THRESHOLD, then a hyperbolic bend that approaches
 * LIMITER_CEILING and never reaches it. Anything past the shaper's domain lands on the curve's
 * end point, which is the ceiling, so the chain has a hard output bound.
 *
 * A DynamicsCompressorNode would be the obvious node here and is the wrong one: it applies
 * lookahead delay, a release envelope and makeup gain to EVERY sample, including the quiet ones,
 * so it could not leave the waveguide's output alone.
 *
 * Curve values are in the halved domain the shaper actually sees: index i stands for an original
 * sample of `x * LIMITER_HEADROOM`, and the stored value is the shaped result halved again.
 */
function limiterCurve(): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(new ArrayBuffer(LIMITER_CURVE_POINTS * Float32Array.BYTES_PER_ELEMENT));
  const half = (LIMITER_CURVE_POINTS - 1) / 2;
  const span = LIMITER_CEILING - LIMITER_THRESHOLD;
  for (let i = 0; i < LIMITER_CURVE_POINTS; i++) {
    const x = ((i - half) / half) * LIMITER_HEADROOM;
    const mag = Math.abs(x);
    let shaped: number;
    if (mag <= LIMITER_THRESHOLD) {
      shaped = mag;
    } else {
      // over/(over + span) rises from 0 towards 1 as the overshoot grows without bound, so the
      // output approaches the ceiling asymptotically and the curve is continuous at the knee.
      const over = mag - LIMITER_THRESHOLD;
      shaped = LIMITER_THRESHOLD + span * (over / (over + span));
    }
    curve[i] = (x < 0 ? -shaped : shaped) / LIMITER_HEADROOM;
  }
  return curve;
}

export function connectFluteOutputChain(ctx: BaseAudioContext, engineNode: AudioNode, envKey: string): FluteOutputChain {
  const dryGain = ctx.createGain();
  dryGain.gain.value = 0.65;

  const wetGain = ctx.createGain();
  wetGain.gain.value = 0.45;

  const convolver = ctx.createConvolver();
  convolver.buffer = createRoomImpulseBuffer(ctx, envKey);

  const masterGain = ctx.createGain();
  masterGain.gain.value = 1.0;

  const limiterIn = ctx.createGain();
  limiterIn.gain.value = 1 / LIMITER_HEADROOM;

  const limiterShaper = ctx.createWaveShaper();
  limiterShaper.curve = limiterCurve();
  // 'none': oversampling would run the signal through resampling filters, which do change a
  // signal that never reaches the knee.
  limiterShaper.oversample = 'none';

  const limiterOut = ctx.createGain();
  limiterOut.gain.value = LIMITER_HEADROOM;

  engineNode.connect(dryGain);
  engineNode.connect(convolver);
  convolver.connect(wetGain);

  dryGain.connect(masterGain);
  wetGain.connect(masterGain);
  masterGain.connect(limiterIn);
  limiterIn.connect(limiterShaper);
  limiterShaper.connect(limiterOut);
  limiterOut.connect(ctx.destination);

  return { dryGain, wetGain, convolver, masterGain, limiterIn, limiterShaper, limiterOut };
}
