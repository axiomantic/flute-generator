/** One resonator of the modal bank: a biquad plus the mode's fixed multipliers. */
interface ResonantMode {
  freqMult: number; gain: number; qMult: number; q: number;
  y1: number; y2: number; x1: number; x2: number;
  b0: number; a1: number; a2: number;
}

// Physically-Modeled Air-Jet Labium Waveguide (Verge / Fletcher Aeroacoustic Model)
export class WebPhysicalPipe {
  sr: number;
  bore: number;
  acousticLength: number;
  modes: ResonantMode[];
  jetDelay: Float32Array;
  writeJet: number;
  sacPressure: number;
  airNoise: number;
  lastTargetFreq: number;
  keySlapTimer: number;
  keySlapLen: number;
  keySlapGain: number;
  keySlapImpact: number;
  currFreq: number;
  targetFreq: number;

  constructor(sampleRate: number, boreDiameter = 19.0, acousticLength = 0.0) {
    this.sr = sampleRate;
    this.bore = boreDiameter;
    // Carried so the geometry object's contract is real end to end. The modal synth takes its
    // pitch from midiToFreq and does not read this; the planned waveguide core derives its
    // delay-line length from it.
    this.acousticLength = acousticLength;
    // Acoustic resonant modes of the cylindrical air column (fundamental + overtones)
    this.modes = [
      { freqMult: 1.0, gain: 1.00, qMult: 1.00, q: 0, y1: 0, y2: 0, x1: 0, x2: 0, b0: 0, a1: 0, a2: 0 },
      { freqMult: 2.0, gain: 0.35, qMult: 0.85, q: 0, y1: 0, y2: 0, x1: 0, x2: 0, b0: 0, a1: 0, a2: 0 },
      { freqMult: 3.0, gain: 0.15, qMult: 0.70, q: 0, y1: 0, y2: 0, x1: 0, x2: 0, b0: 0, a1: 0, a2: 0 },
      { freqMult: 4.0, gain: 0.06, qMult: 0.55, q: 0, y1: 0, y2: 0, x1: 0, x2: 0, b0: 0, a1: 0, a2: 0 }
    ];
    this.applyBoreQ();

    // Jet transit delay line (distance from windway exit to splitting labium blade)
    this.jetDelay = new Float32Array(Math.floor(sampleRate * 0.04));
    this.writeJet = 0;

    // Slow Air Chamber (SAC) internal pneumatic pressure state
    this.sacPressure = 0.0;
    this.airNoise = 0.0;
    this.lastTargetFreq = 440.0;
    this.keySlapTimer = 0;
    this.keySlapLen = Math.max(1, Math.floor(sampleRate * 0.040));
    this.keySlapGain = 0.65;
    this.keySlapImpact = 0.0;
    this.currFreq = 440.0;
    this.targetFreq = 440.0;
    this.updateCoeffs(440.0);
  }

  applyBoreQ(): void {
    const baseQ = 32.0 + (this.bore / 25.0) * 12.0;
    for (let m of this.modes) m.q = baseQ * m.qMult;
  }

  // Geometry is applied in place instead of by rebuilding the pipe: the biquad histories, the jet
  // delay line and the SAC pressure all survive, so a register change mid-note glides rather than
  // restarting the air column from silence.
  setGeometry(boreDiameter: number, acousticLength: number): void {
    if (typeof boreDiameter === 'number' && !isNaN(boreDiameter) && boreDiameter > 0.0) {
      this.bore = boreDiameter;
    }
    if (typeof acousticLength === 'number' && !isNaN(acousticLength) && acousticLength > 0.0) {
      this.acousticLength = acousticLength;
    }
    this.applyBoreQ();
    this.updateCoeffs(this.currFreq);
  }

  updateCoeffs(freq: number): void {
    if (isNaN(freq) || freq <= 20.0) freq = 440.0;
    for (let m of this.modes) {
      const f = Math.min(this.sr * 0.46, freq * m.freqMult);
      const w0 = 2.0 * Math.PI * f / this.sr;
      const alpha = Math.sin(w0) / (2.0 * m.q);
      m.b0 = (Math.sin(w0) / 2.0) / (1.0 + alpha);
      m.a1 = (-2.0 * Math.cos(w0)) / (1.0 + alpha);
      m.a2 = (1.0 - alpha) / (1.0 + alpha);
    }
  }

  setFreq(freq: number): void {
    if (typeof freq === 'number' && !isNaN(freq) && freq > 20.0) {
      this.targetFreq = freq;
    }
  }

  // Pad impact is an articulation event, not a pitch event: the scheduler drives it so a
  // repeated pitch (pads re-seat) and a note release (pads lift) both excite the body,
  // which inferring the strike from a frequency change could never do.
  triggerKeySlap(impact = 1.0): void {
    this.keySlapTimer = this.keySlapLen;
    this.keySlapImpact = Math.max(0.0, Math.min(1.0, impact));
  }

  process(breathP: number): number {
    if (isNaN(breathP)) breathP = 0.0;

    // Runs ahead of the no-breath early return: a pad striking the body is mechanical, so it
    // sounds (and must decrement) whether or not the player is blowing.
    let keySlapTransient = 0.0;
    if (this.keySlapTimer > 0) {
      const t = (this.keySlapLen - this.keySlapTimer) / this.sr;
      // Dual-component transient: sharp pad closure click + damped 180 Hz wooden body mode
      const click = (Math.random() * 2.0 - 1.0) * Math.exp(-320.0 * t);
      const thud = Math.sin(2.0 * Math.PI * 180.0 * t) * Math.exp(-55.0 * t);
      keySlapTransient = (click * 0.30 + thud * 0.55) * this.keySlapGain * this.keySlapImpact;
      this.keySlapTimer--;
    }

    if (breathP <= 0.001 && this.sacPressure <= 0.001) return keySlapTransient;

    // 1. Pneumatic Airflow Dynamics in the Slow Air Chamber (P_sac)
    // Simulates the physical air volume reservoir filling and releasing breath
    this.sacPressure += (breathP - this.sacPressure) * 0.08;
    const P = this.sacPressure;

    // Smooth frequency tracking
    if (Math.abs(this.targetFreq - this.currFreq) > 0.02) {
      this.currFreq += (this.targetFreq - this.currFreq) * 0.05;
      this.updateCoeffs(this.currFreq);
    }

    // 2. Jet DC Velocity from Bernoulli's Principle: v_jet ~ sqrt(2 * P / rho)
    const jetVelocity = Math.sqrt(Math.max(0.01, P));

    // 3. Turbulent Airflow Noise generated inside the windway duct
    const white = (Math.random() * 2.0 - 1.0);
    this.airNoise = this.airNoise * 0.75 + white * 0.25;
    // Fluid turbulence at the labium blade
    const labiumTurbulence = this.airNoise * 0.012 * jetVelocity;

    // 4. Acoustic Feedback from Bore Resonator
    // Read the acoustic pressure at the labium window
    let boreAcousticPressure = 0.0;
    for (let m of this.modes) {
      boreAcousticPressure += m.y1 * m.gain;
    }

    // 5. Air Jet Deflection & Transit Time across the Sound Window (W/v_jet)
    // The acoustic pressure at the window deflects the emerging air sheet
    const jetTransitSamples = Math.max(2.0, (this.sr / this.currFreq) * 0.28);
    this.jetDelay[this.writeJet] = boreAcousticPressure * 0.48 + labiumTurbulence;
    this.writeJet = (this.writeJet + 1) % this.jetDelay.length;

    const readIdx = (this.writeJet - 1 - Math.floor(jetTransitSamples) + this.jetDelay.length) % this.jetDelay.length;
    const delayedJetDeflection = this.jetDelay[readIdx];

    // 6. Non-linear Labium Splitting Flow Non-linearity
    // The jet splits above and below the knife-edge labium (Fletcher non-linear jet model)
    // Flow into bore Q_in = b * h * v_jet * tanh(eta / h)
    const eta = (delayedJetDeflection * 1.4 + labiumTurbulence);
    const flowInjection = jetVelocity * Math.tanh(eta);

    // 7. Resonator Modal Acoustic Filter
    let totalAcousticOut = 0.0;
    for (let m of this.modes) {
      const y = m.b0 * (flowInjection - m.x2) - m.a1 * m.y1 - m.a2 * m.y2;
      m.x2 = m.x1; m.x1 = flowInjection;
      m.y2 = m.y1; m.y1 = y;
      totalAcousticOut += y * m.gain;
    }

    // Direct airy breath rush audible around the sound window
    const windowAirRush = labiumTurbulence * 0.35;
    return (totalAcousticOut * 0.28 + windowAirRush + keySlapTransient);
  }
}
